"""Settings service — reads the registry, applies changes, tests connections.

The service owns three decisions the router should not make:

* **which changes take effect now and which need a restart** — read from the
  registry, never inferred from the key's name;
* **what happens when a change cannot be applied** — it is still persisted, but
  reported, because refusing to store it would leave the operator unable to fix a
  configuration from the UI;
* **how a candidate connection is tested** — against a throwaway engine, so a bad
  value is discovered *before* it is saved and the bootstrap cache still holds a
  working connection.
"""

from __future__ import annotations

import time
from typing import Any

import structlog
from planny_core.config.bootstrap import write_bootstrap
from planny_core.config.keys import ApplyMode, SettingKey, key_by_name, runtime_keys
from planny_core.config.resolver import (
    SOURCE_DATABASE,
    apply_overrides,
    validate_override,
    value_source,
)
from planny_core.config.settings import Settings
from planny_core.config.store import MissingMasterKeyError, SettingsStore
from planny_core.errors import EntityNotFoundError, InvalidConfigurationError
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.modules.settings.schemas import (
    ApplyResult,
    ConnectionTestResult,
    ImportResult,
    SettingsEntry,
    SettingsGroup,
    SettingsList,
    SettingsUpdateResponse,
)

__all__ = ["SettingsService"]

logger = structlog.get_logger(__name__)

#: Targets a connectivity check can address.
TESTABLE_TARGETS = ("database",)


class SettingsService:
    """Assembles the settings surface and applies changes to it."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._store = SettingsStore(master_key=settings.master_key)

    @property
    def settings(self) -> Settings:
        """The effective settings this service reports against."""
        return self._settings

    # ── Reading ───────────────────────────────────────────────────────────────

    async def list_settings(self, db: AsyncSession) -> SettingsList:
        """Every runtime key with its effective value, grouped for the UI."""
        stored = {row.key: row for row in await self._store.rows(db)}
        grouped: dict[str, list[SettingsEntry]] = {}

        for entry in runtime_keys():
            row = stored.get(entry.key)
            current = getattr(self._settings, entry.settings_field)
            grouped.setdefault(entry.group, []).append(
                SettingsEntry(
                    key=entry.key,
                    label=entry.label,
                    group=entry.group,
                    type=entry.type.value,
                    apply=entry.apply.value,
                    isSecret=entry.is_secret,
                    isOverridden=row is not None,
                    # A stored value is authoritative; otherwise the value came
                    # from the environment tier or is simply the code default.
                    source=(
                        SOURCE_DATABASE if row is not None else value_source(entry, current)
                    ),
                    isConfigured=bool(row is not None or current not in (None, "")),
                    # A secret is reported as present, never as a value.
                    value=None if entry.is_secret else current,
                    # Reported only when it is a pending change: repeating the
                    # effective value here would just be noise.
                    storedValue=self._pending_value(
                        entry,
                        row.value if row is not None else None,
                        current,
                        row is not None,
                    ),
                    defaultValue=entry.default,
                    envAliases=list(entry.env_aliases),
                    choices=list(entry.choices),
                    help=entry.help,
                    updatedAt=row.updated_at.isoformat()
                    if row is not None and row.updated_at
                    else None,
                )
            )

        return SettingsList(
            groups=[
                SettingsGroup(name=name, entries=entries)
                for name, entries in grouped.items()
            ],
            masterKeyConfigured=self._store.has_master_key,
        )

    @staticmethod
    def _pending_value(
        entry: SettingKey, stored_value: Any, effective_value: Any, is_overridden: bool
    ) -> Any:
        """The saved value, but only when it differs from the one in effect.

        "Pending" has to mean *waiting to take effect*, not merely *stored*. A
        restart key is stored from the moment it is imported, so returning it
        unconditionally made every such key announce a pending change identical to
        the value already running — noise that trains the operator to ignore the
        one line that matters.

        Secrets are still never included: the UI can say that a change is waiting
        without the credential being rendered back to the client.
        """
        if not is_overridden or entry.is_secret:
            return None
        if entry.apply is not ApplyMode.RESTART:
            return None
        return stored_value if stored_value != effective_value else None

    # ── Writing ───────────────────────────────────────────────────────────────

    async def apply_changes(
        self,
        db: AsyncSession,
        changes: dict[str, Any],
        *,
        user_id: int | None = None,
    ) -> SettingsUpdateResponse:
        """Validate, persist and report a batch of changes.

        Each change is handled independently: one bad value does not discard the
        others, so an operator fixing several settings does not have to find and
        remove the single failing one before anything is saved.
        """
        connection_changes = {
            key: value for key, value in changes.items() if key in _KEY_NAMES
        }
        other_changes = {
            key: value for key, value in changes.items() if key not in _KEY_NAMES
        }

        results: list[ApplyResult] = []
        results.extend(
            await self._apply_connection_changes(db, connection_changes, user_id=user_id)
        )

        for key, value in other_changes.items():
            results.append(await self._apply_one(db, key, value, user_id=user_id))

        restart_keys = [r.key for r in results if r.requiresRestart]
        return SettingsUpdateResponse(
            results=results,
            restartRequired=bool(restart_keys),
            restartKeys=restart_keys,
        )

    async def _apply_connection_changes(
        self, db: AsyncSession, changes: dict[str, Any], *, user_id: int | None
    ) -> list[ApplyResult]:
        """Validate, prove and store a change to the database connection.

        Treated as a unit, and proven before it is stored, for two reasons:

        * the fields only mean anything together — a new host with the old port is
          not a configuration anyone wants half of;
        * this is the one change that can lock the application out of its own
          settings store. Storing an unreachable connection would leave the next
          start unable to read the very rows that describe how to connect. The
          bootstrap cache is only updated once a connection has actually worked,
          so a bad value is rejected while the previous one remains usable.
        """
        if not changes:
            return []

        for key in changes:
            try:
                self._entry(key)
            except KeyError as exc:
                return [ApplyResult(key=key, status="rejected", detail=str(exc))]

        try:
            candidate = apply_overrides(
                self._settings,
                {key: value for key, value in changes.items() if value is not None},
            )
        except (InvalidConfigurationError, ValidationError) as exc:
            return [
                ApplyResult(key=key, status="rejected", detail=_first_error(exc))
                for key in changes
            ]

        probe = await self._test_database(candidate)
        if not probe.ok:
            return [
                ApplyResult(
                    key=key,
                    status="rejected",
                    detail=f"Connection failed, so nothing was saved. {probe.detail}",
                )
                for key in changes
            ]

        results: list[ApplyResult] = []
        for key, value in changes.items():
            result = await self._apply_one(db, key, value, user_id=user_id)
            results.append(result)

        # Only now: the connection has been proven, so recording it cannot lock
        # the next start out.
        try:
            write_bootstrap(candidate)
        except OSError as exc:  # noqa: BLE001 - the change is saved either way
            logger.warning("bootstrap.not_written", error=str(exc))

        return results

    async def _apply_one(
        self, db: AsyncSession, key: str, value: Any, *, user_id: int | None
    ) -> ApplyResult:
        """Persist one change and, when it applies live, verify it takes effect."""
        try:
            entry = self._entry(key)
        except KeyError as exc:
            return ApplyResult(key=key, status="rejected", detail=str(exc))

        try:
            await self._store.save(db, key, value, user_id=user_id)
        except (MissingMasterKeyError, InvalidConfigurationError, ValidationError) as exc:
            # A rejected value is an answer, not a failure: the caller asked for a
            # change and is being told precisely why it was not accepted.
            return ApplyResult(key=key, status="rejected", detail=_first_error(exc))

        if entry.apply is ApplyMode.RESTART:
            return ApplyResult(
                key=key,
                status="stored",
                detail=(
                    "Saved. The resource it configures is built at startup, so it "
                    "takes effect on the next start."
                ),
                requiresRestart=True,
            )

        # Live: the rest of the application reads this attribute at call time, so
        # updating it in place is what makes the change take effect. Reporting
        # "applied" without this would have been a claim the process did not honour.
        setattr(
            self._settings,
            entry.settings_field,
            validate_override(entry, value),
        )
        logger.info("settings.applied_live", key=key)

        return ApplyResult(
            key=key,
            status="applied",
            detail="Applied and in effect now.",
        )

    async def clear(self, db: AsyncSession, key: str) -> ApplyResult:
        """Remove an override so the key falls back to the environment.

        Raises:
            EntityNotFoundError: the key is not a configurable setting. Reported as
                a 404 rather than a silent success, so a typo in the URL does not
                look like a successful reset.
        """
        try:
            entry = self._entry(key)
        except KeyError as exc:
            raise EntityNotFoundError(f"Setting {key!r}") from exc

        removed = await self._store.delete(db, key)
        if not removed:
            # Idempotent: clearing a key that was never overridden is a success,
            # because the requested end state already holds.
            return ApplyResult(
                key=key,
                status="cleared",
                detail="No stored override; the value already comes from the environment.",
            )

        if entry.apply is ApplyMode.LIVE:
            self._restore_from_environment(entry)

        return ApplyResult(
            key=key,
            status="cleared",
            detail="Cleared; the value now comes from the environment.",
            requiresRestart=entry.apply is ApplyMode.RESTART,
        )

    def _restore_from_environment(self, entry: SettingKey) -> None:
        """Put the environment's value back into the running settings.

        Deleting the row is not enough for a live key: applying it earlier wrote
        the value onto the settings object the rest of the application reads, so
        without this the process would keep serving the cleared value while the
        API reported that it had fallen back to the environment.

        The fallback is read from a **freshly built** ``Settings`` because the
        object this service holds is the one that was mutated — it no longer knows
        what the environment said.
        """
        environment = Settings()
        restored = getattr(environment, entry.settings_field)
        setattr(self._settings, entry.settings_field, restored)
        logger.info("settings.restored_from_environment", key=entry.key)

    async def import_environment(
        self, db: AsyncSession, *, user_id: int | None = None
    ) -> ImportResult:
        """Copy the values the environment defines into the store.

        This is how an existing ``.env`` becomes visible and editable from the UI
        without retyping every credential.

        Two properties make it safe to run more than once:

        * only keys with **no stored row** are filled, so a change made in the UI
          is never overwritten;
        * it is **explicit**, not automatic on startup. Importing on every start
          would silently undo a cleared key: an operator who deletes an override
          to fall back to the environment would find it back after a restart, and
          the UI would have told them the opposite.
        """
        already_stored = {row.key for row in await self._store.rows(db)}
        imported: list[str] = []
        skipped: list[str] = []
        failed: list[ApplyResult] = []

        for entry in runtime_keys():
            if entry.key in already_stored:
                skipped.append(entry.key)
                continue

            current = getattr(self._settings, entry.settings_field)
            if current is None or current == "":
                # Nothing to import; the key keeps falling through to its default.
                skipped.append(entry.key)
                continue

            result = await self._apply_one(db, entry.key, current, user_id=user_id)
            if result.status == "rejected":
                failed.append(result)
            else:
                imported.append(entry.key)

        logger.info(
            "settings.imported_from_environment",
            imported=len(imported),
            skipped=len(skipped),
            failed=len(failed),
        )
        return ImportResult(imported=imported, skipped=skipped, failed=failed)

    # ── Testing ───────────────────────────────────────────────────────────────

    async def test_connection(
        self, target: str, fields: dict[str, Any]
    ) -> ConnectionTestResult:
        """Try a candidate configuration without saving it.

        This is what makes the bootstrap cache usable: an operator can prove the
        new database works before committing to it, instead of writing a value
        that only fails on the next start.
        """
        if target not in TESTABLE_TARGETS:
            return ConnectionTestResult(
                target=target,
                ok=False,
                detail=f"Unknown target {target!r}. Expected one of {', '.join(TESTABLE_TARGETS)}.",
            )

        try:
            candidate = apply_overrides(
                self._settings,
                {key: value for key, value in (fields or {}).items() if key in _KEY_NAMES},
            )
        except (KeyError, InvalidConfigurationError) as exc:
            return ConnectionTestResult(target=target, ok=False, detail=str(exc))
        except ValidationError as exc:
            # A candidate value failed its field's own validation. Reported, not
            # raised: the point of this endpoint is to say what is wrong.
            return ConnectionTestResult(target=target, ok=False, detail=str(exc))

        return await self._test_database(candidate)

    @staticmethod
    async def _test_database(candidate: Settings) -> ConnectionTestResult:
        """Open a throwaway engine and run one query.

        For SQLite the file is **not** created if it is missing. Connecting would
        create an empty database and report success, so a path typed with a typo
        would be saved as working — and the application would then start against
        an empty database, looking exactly like data loss. Better to refuse and
        say why.
        """
        from planny_core.db.engine import database_url

        if candidate.db_type == "sqlite":
            problem, note = _precheck_sqlite(candidate.db_path)
            if problem is not None:
                return ConnectionTestResult(target="database", ok=False, detail=problem)
            if note is not None:
                return ConnectionTestResult(target="database", ok=True, detail=note)

        started = time.perf_counter()
        try:
            from sqlalchemy.ext.asyncio import create_async_engine

            engine = create_async_engine(database_url(candidate), pool_pre_ping=True)
            try:
                async with engine.connect() as connection:
                    await connection.execute(text("SELECT 1"))
            finally:
                await engine.dispose()
        except SQLAlchemyError as exc:
            # The driver message is the useful part: "password authentication
            # failed" tells the operator what to change; a generic failure does not.
            return ConnectionTestResult(
                target="database",
                ok=False,
                detail=f"{type(exc).__name__}: {exc}",
            )
        except Exception as exc:  # noqa: BLE001 - any failure means "cannot connect"
            return ConnectionTestResult(
                target="database", ok=False, detail=f"{type(exc).__name__}: {exc}"
            )

        elapsed = (time.perf_counter() - started) * 1000
        return ConnectionTestResult(
            target="database",
            ok=True,
            detail="Connection succeeded.",
            latencyMs=round(elapsed, 2),
        )

    # ── Internals ─────────────────────────────────────────────────────────────

    def _entry(self, key: str) -> SettingKey:
        """Look up a runtime key, or raise ``KeyError`` naming it.

        Bootstrap keys are rejected here as well as in the store: this is the
        boundary the request comes through, so it should be the first to refuse.
        """
        entry = key_by_name(key)
        if not entry.is_stored:
            raise KeyError(f"{key!r} is a bootstrap setting and cannot be changed here.")
        return entry


def _precheck_sqlite(path: str | None) -> tuple[str | None, str | None]:
    """Inspect a SQLite target before connecting.

    Returns ``(problem, note)``: a *problem* means the connection cannot work, a
    *note* means it can, but not in the way the operator probably assumes.

    Nothing is created either way. Connecting to a missing file makes SQLite
    create an empty database, so a mistyped path would be reported as working and
    the application would come up against an empty database — indistinguishable
    from data loss. A probe must not have that side effect.

    Relative paths resolve against the working directory, which is where
    SQLAlchemy would look, so the report describes the file the application would
    actually open.
    """
    from pathlib import Path

    if not path:
        return None, None

    resolved = Path(path).expanduser()
    if not resolved.is_absolute():
        resolved = Path.cwd() / resolved

    if resolved.exists():
        return None, None

    parent = resolved.parent
    if not parent.is_dir():
        return f"The directory {parent} does not exist.", None

    # The engine will create it, which is legitimate for a new deployment but is
    # never what someone means when they typo an existing database's name.
    return None, (
        f"{resolved} does not exist. Connecting would create a new, empty "
        "database there — check the path if you meant to point at an existing one."
    )


def _first_error(exc: Exception) -> str:
    """A one-line reason from a validation error.

    Pydantic's ``str`` output is multi-line and repeats the input; the operator
    needs the sentence that says what is wrong.
    """
    if isinstance(exc, ValidationError) and exc.errors():
        error = exc.errors()[0]
        location = ".".join(str(part) for part in error.get("loc", ()))
        message = error.get("msg", "invalid value")
        return f"{location}: {message}" if location else str(message)
    return str(exc)


#: Registry keys the connection test accepts: the database connection, and
#: nothing else. Accepting unrelated keys would let the endpoint be used to probe
#: arbitrary configuration.
_KEY_NAMES = frozenset(
    entry.key for entry in runtime_keys() if entry.group == "Database"
)
