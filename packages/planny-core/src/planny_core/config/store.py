"""The runtime settings store.

Holds **overrides only**: a missing row means "not overridden here", which is what
lets a value fall through to the environment and then to the code default. Writing
back the value a key already had would turn a fallback into a silent copy that
stops tracking its source.

Values are stored as JSON so types survive the round trip: a port read back as
``"5432"`` instead of ``5432`` would be rejected by validation much later. Secrets
are encrypted on top of that (see :mod:`planny_core.config.crypto`).

The store **fails closed**. If a secret is stored and no master key is available,
loading raises instead of skipping the row: skipping would start the application
with credentials the operator believes are configured but which are silently not
in effect.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, cast

import structlog
from sqlalchemy import CursorResult, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from planny_core.config.crypto import decrypt, encrypt, key_id
from planny_core.config.keys import SETTINGS, SettingKey
from planny_core.config.resolver import apply_overrides, validate_override
from planny_core.config.settings import Settings
from planny_core.errors import InsecureConfigurationError
from planny_core.models import AppSetting

__all__ = [
    "MissingMasterKeyError",
    "SettingsStore",
    "StoredOverride",
    "resolve_stored_settings",
]

logger = structlog.get_logger(__name__)


class MissingMasterKeyError(InsecureConfigurationError):
    """A secret is stored but no master key is available to decrypt it.

    Subclasses :class:`InsecureConfigurationError` because it aborts startup:
    the alternative is serving traffic with credentials that are not the ones the
    operator configured.
    """


@dataclass(frozen=True, slots=True)
class StoredOverride:
    """One row of the store, with its value already decoded."""

    key: str
    value: Any
    is_secret: bool
    updated_at: datetime | None = None
    updated_by: int | None = None


def _encode(value: Any) -> str:
    """Serialise a value for storage, preserving its type."""
    return json.dumps(value)


def _decode(raw: str) -> Any:
    """Read a stored value back.

    Falls back to the raw string when the payload is not JSON, so a value written
    by hand into the database still loads instead of breaking startup.
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


class SettingsStore:
    """Reads and writes runtime overrides.

    Args:
        master_key: The operator's master key, or ``None`` when unset. Required
            to read or write a secret, and never persisted.
        registry: The keys this store manages. Defaults to the full registry,
            which tests narrow to isolate a case.
    """

    def __init__(
        self,
        *,
        master_key: str | None = None,
        registry: Sequence[SettingKey] = SETTINGS,
    ) -> None:
        self._master_key = master_key
        # Only stored keys are addressable. Keeping the bootstrap keys out of
        # this map matters: a row inserted by hand as `bootstrap.master_key`
        # would otherwise be read as an override and replace the very key used
        # to decrypt the store.
        self._registry = {entry.key: entry for entry in registry if entry.is_stored}

    @property
    def has_master_key(self) -> bool:
        """Whether a master key is configured."""
        return bool(self._master_key)

    def _entry(self, key: str) -> SettingKey:
        """Look up a runtime registry entry.

        Bootstrap keys are deliberately absent, so they fail here rather than
        being stored and read back as if they were overridable.
        """
        try:
            return self._registry[key]
        except KeyError:
            raise KeyError(f"{key!r} is not a stored runtime setting.") from None

    def _encode_value(self, entry: SettingKey, value: Any) -> str:
        """Validate and serialise *value*, encrypting it when the key is secret."""
        validate_override(entry, value)
        serialised = _encode(value)

        if not entry.is_secret:
            return serialised

        if self._master_key is None:
            raise MissingMasterKeyError(
                f"{entry.key} is a secret and cannot be stored without a master key. "
                "Set MASTER_KEY in the environment."
            )
        return encrypt(serialised, self._master_key)

    def _decode_row(self, entry: SettingKey, row: AppSetting) -> Any:
        """Decode one row, decrypting it when the key is secret."""
        if row.value is None:
            return None

        if not entry.is_secret:
            return _decode(row.value)

        if self._master_key is None:
            raise MissingMasterKeyError(
                f"{entry.key} is stored encrypted but no master key is configured. "
                "Set MASTER_KEY in the environment; it must be the one that "
                "encrypted this value."
            )

        return _decode(decrypt(row.value, self._master_key))

    async def load(self, db: AsyncSession) -> dict[str, Any]:
        """Return every stored override, keyed by registry name.

        Rows whose key is no longer in the registry are skipped with a warning
        rather than raising: a key can legitimately be retired, and refusing to
        start because of a stale row would be worse than ignoring it.
        """
        result = await db.execute(select(AppSetting))
        overrides: dict[str, Any] = {}

        for row in result.scalars().all():
            entry = self._registry.get(row.key)
            if entry is None:
                logger.warning("settings_store.unknown_key", key=row.key)
                continue

            value = self._decode_row(entry, row)
            if value is not None:
                overrides[entry.key] = value

        return overrides

    async def rows(self, db: AsyncSession) -> list[StoredOverride]:
        """Return every row with its value decoded, for the settings API.

        A secret's value is **not** returned; only the fact that one is stored.
        An admin may change a token, but reading it back would put every
        credential on screen and in every log that captures a response body.
        """
        result = await db.execute(select(AppSetting))
        stored: list[StoredOverride] = []

        for row in result.scalars().all():
            entry = self._registry.get(row.key)
            if entry is None:
                continue

            stored.append(
                StoredOverride(
                    key=row.key,
                    value=None if entry.is_secret else self._decode_row(entry, row),
                    is_secret=entry.is_secret,
                    updated_at=row.updated_at,
                    updated_by=row.updated_by,
                )
            )

        return stored

    async def save(
        self,
        db: AsyncSession,
        key: str,
        value: Any,
        *,
        user_id: int | None = None,
    ) -> AppSetting:
        """Create or replace one override.

        Raises:
            KeyError: the key is not a runtime setting.
            InvalidConfigurationError: the value is rejected by the registry.
            MissingMasterKeyError: the key is a secret and no master key is set.
        """
        entry = self._entry(key)
        encoded = self._encode_value(entry, value)

        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        row = result.scalars().first()

        if row is None:
            row = AppSetting(key=key)
            db.add(row)

        row.value = encoded
        row.is_secret = entry.is_secret
        row.key_id = _key_id_for(self._master_key, entry)
        row.updated_at = datetime.now(UTC).replace(tzinfo=None)
        row.updated_by = user_id

        await db.flush()
        logger.info("settings_store.saved", key=key, secret=entry.is_secret, by=user_id)
        return row

    async def delete(self, db: AsyncSession, key: str) -> bool:
        """Remove an override so the key falls back. Returns whether one existed.

        Clearing is how a value is returned to the environment: deleting the row
        restores the fallback rather than freezing today's value in place.
        """
        entry = self._entry(key)
        result = await db.execute(delete(AppSetting).where(AppSetting.key == entry.key))
        # A DELETE always yields a CursorResult, which is the only Result that
        # carries rowcount; the async session types it as the generic Result.
        removed = bool(cast("CursorResult[Any]", result).rowcount)
        if removed:
            logger.info("settings_store.deleted", key=key)
        return removed

async def resolve_stored_settings(db: AsyncSession, base: Settings) -> Settings:
    """Return *base* with every stored override applied.

    This is the whole feature in one call: the environment tier as resolved by
    :class:`Settings`, plus the runtime store on top, revalidated. The master key
    comes from *base*, so it is never read from the store it protects.
    """
    store = SettingsStore(master_key=base.master_key)
    return apply_overrides(base, await store.load(db))


def _key_id_for(master_key: str | None, entry: SettingKey) -> str | None:
    """The key fingerprint to record alongside a row, if it is encrypted."""
    if not entry.is_secret or master_key is None:
        return None
    return key_id(master_key)
