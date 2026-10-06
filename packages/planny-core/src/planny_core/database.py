"""Database access — the process-wide default database.

The real implementation lives in :mod:`planny_core.db`:

* ``planny_core.db.base``    — :class:`~planny_core.db.base.Base`
* ``planny_core.db.engine``  — engine factories taking explicit settings
* ``planny_core.db.session`` — :class:`~planny_core.db.session.Database`

This module provides the default :class:`Database` the application uses when no
instance is injected. It is built **lazily**, on first use, and resolved through
the bootstrap tier::

    process environment  >  bootstrap cache file  >  .env  >  code default

Two reasons it must be lazy rather than built at import:

* the bootstrap cache file is what lets an operator change the database from the
  UI without being locked out if the new value is wrong, and the file has to be
  read before the connection is opened;
* building an engine at import time would open a pool as a side effect of
  importing a module, which makes the failure surface far from its cause.

Blueprint section 4.6 replaces this default by moving the instance into the
application context; until then this is the single place the default is built.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from planny_core.config import Settings
from planny_core.config import settings as process_settings
from planny_core.config.bootstrap import resolve_bootstrap_settings
from planny_core.db import Base, Database

__all__ = ["Base", "Database", "get_database", "get_db", "reset_database"]

_database: Database | None = None


def get_database(settings: Settings | None = None) -> Database:
    """Return the process-wide database, building it on first use.

    Args:
        settings: Settings to build from, if one has to be built. An already-built
            instance is returned unchanged, so exactly one engine exists per
            process and ``dispose`` closes the one that is actually in use.
            Leaving this unset resolves the bootstrap tier.
    """
    global _database

    if _database is None:
        _database = Database(
            settings if settings is not None else resolve_bootstrap_settings(process_settings)
        )

    return _database


def reset_database() -> None:
    """Drop the cached instance so the next call rebuilds it.

    The caller owns disposal: **the engine is not closed here**, because this is
    synchronous and disposal is not. Used by tests and by tooling that needs to
    pick up a changed connection.
    """
    global _database
    _database = None


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI-compatible dependency yielding a database session.

    Commits on success, rolls back on exception, and always closes.
    """
    async with get_database().session() as session:
        yield session
