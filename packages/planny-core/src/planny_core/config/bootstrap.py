"""Tier-0 configuration: what is needed before the runtime store is reachable.

Reading the runtime store needs a database connection, and that connection is
itself a configurable setting. The circularity is broken by caching the last
known-good connection on disk (decision: Option A), so an operator can change the
database from the UI and still have the application start if the new value is
wrong.

Precedence for these values:

    process environment  >  bootstrap cache file  >  .env  >  code default

The file is written ``0600`` inside the data directory and holds only the
database connection. In particular the **master key is never cached**: it is the
one value that must come from outside the application entirely, or encrypting
secrets at rest would protect them with a key sitting next to them.
"""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from planny_core.config.paths import data_dir
from planny_core.config.resolver import apply_overrides, overrides_from_fields
from planny_core.config.settings import Settings

__all__ = [
    "BOOTSTRAP_FILENAME",
    "DATABASE_FIELDS",
    "BootstrapCache",
    "bootstrap_file",
    "clear_bootstrap",
    "read_bootstrap",
    "resolve_bootstrap_settings",
    "write_bootstrap",
]

logger = structlog.get_logger(__name__)

BOOTSTRAP_FILENAME = "bootstrap.json"

#: Settings field -> environment variable, for the connection the cache stores.
#:
#: This has to be the *environment* name rather than a registry key because the
#: precedence check below asks whether the process environment defined the value
#: explicitly, and only the environment variable name answers that question.
DATABASE_FIELDS: dict[str, str] = {
    "db_type": "DB_TYPE",
    "db_host": "DB_HOST",
    "db_port": "DB_PORT",
    "db_username": "DB_USERNAME",
    "db_password": "DB_PASSWORD",
    "db_database": "DB_DATABASE",
    "db_path": "DB_PATH",
}


def bootstrap_file() -> Path:
    """Absolute path of the bootstrap cache file."""
    return data_dir() / BOOTSTRAP_FILENAME


@dataclass(frozen=True, slots=True)
class BootstrapCache:
    """The last known-good database connection."""

    values: Mapping[str, Any]

    @classmethod
    def from_settings(cls, settings: Settings) -> BootstrapCache:
        """Capture the database connection from resolved settings."""
        return cls(
            values={
                field: getattr(settings, field)
                for field in DATABASE_FIELDS
                if getattr(settings, field) is not None
            }
        )

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> BootstrapCache:
        """Build a cache from already-parsed JSON.

        Unknown keys are dropped, so a file written by an older version does not
        break startup. Values are kept as they are; they are validated when they
        are applied.
        """
        return cls(
            values={field: data[field] for field in DATABASE_FIELDS if data.get(field) is not None}
        )

    def to_mapping(self) -> dict[str, Any]:
        """Render the cache as JSON-serialisable data."""
        return dict(self.values)

    def as_overrides(self) -> dict[str, Any]:
        """Translate the cache into registry-key overrides."""
        return overrides_from_fields(self.values)


def read_bootstrap(path: Path | None = None) -> BootstrapCache | None:
    """Read the cache file, or ``None`` when it is absent or unusable.

    A corrupt cache is not fatal: it is an optimisation over ``.env``, and
    refusing to start because a convenience file is malformed would be worse than
    ignoring it. The problem is logged.
    """
    target = path or bootstrap_file()
    if not target.is_file():
        return None

    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("bootstrap.unreadable", path=str(target), error=str(exc))
        return None

    if not isinstance(data, dict):
        logger.warning("bootstrap.not_an_object", path=str(target))
        return None

    return BootstrapCache.from_mapping(data)


def write_bootstrap(settings: Settings, path: Path | None = None) -> Path:
    """Persist the database connection from *settings*.

    Written with ``0600`` from the moment it is created, rather than created with
    default permissions and narrowed afterwards — the file holds a database
    password, and the gap would be a real window on a shared host.
    """
    target = path or bootstrap_file()
    target.parent.mkdir(parents=True, exist_ok=True)

    payload = json.dumps(BootstrapCache.from_settings(settings).to_mapping(), indent=2)

    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(payload)
    except BaseException:
        os.close(descriptor)
        raise

    # An existing file keeps its previous mode through O_CREAT, so narrow it.
    target.chmod(0o600)

    logger.info("bootstrap.written", path=str(target))
    return target


def clear_bootstrap(path: Path | None = None) -> bool:
    """Delete the cache file. Returns whether one existed."""
    target = path or bootstrap_file()
    if not target.is_file():
        return False
    target.unlink()
    logger.info("bootstrap.cleared", path=str(target))
    return True


def resolve_bootstrap_settings(base: Settings, path: Path | None = None) -> Settings:
    """Apply the cache between the process environment and the rest.

    ``Settings`` has already merged process environment, ``.env`` and defaults.
    Only the cache needs inserting, and only for the fields the process
    environment did **not** define: an explicit environment variable is a
    deliberate operator action and must not be overridden by a cached value.
    """
    cached = read_bootstrap(path)
    if cached is None:
        return base

    # Decided on *field* names, not on registry keys: the two do not correspond
    # (`db_database` is `database.name`), so comparing suffixes silently failed to
    # protect the field the environment had already set.
    from_environment = {
        field for field, env_name in DATABASE_FIELDS.items() if env_name in os.environ
    }
    usable = {
        field: value
        for field, value in cached.values.items()
        if field not in from_environment
    }
    if not usable:
        return base

    return apply_overrides(base, overrides_from_fields(usable))
