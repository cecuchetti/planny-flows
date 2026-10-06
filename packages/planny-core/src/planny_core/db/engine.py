"""Engine factories and the single SQLAlchemy URL builder.

These are pure factories: they take explicit settings and create an engine.
They deliberately do **not** build a module-level engine, because a global
engine created at import time cannot be controlled by ``create_app(settings)``
(see blueprint finding in section 4.6).

``database_url`` is the only place in the project that composes a database URL.
Before this existed, the same logic was duplicated in the async engine, the sync
engine and ``alembic/env.py`` — three chances to diverge (finding H4).
"""

from __future__ import annotations

from sqlalchemy import Engine, create_engine
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy.ext.asyncio import create_async_engine as _create_async_engine
from sqlalchemy.pool import NullPool

from planny_core.config import Settings

__all__ = ["build_async_engine", "build_sync_engine", "database_url"]


def _normalise_sqlite_path(path: str) -> str:
    """Strip a leading ``./`` so the SQLAlchemy URL stays well-formed."""
    return path[2:] if path.startswith("./") else path


def database_url(settings: Settings, *, async_driver: bool = True) -> str:
    """Return the SQLAlchemy URL for *settings*.

    Args:
        settings: Resolved application settings.
        async_driver: When ``True`` (default) the URL carries the async driver
            (``asyncpg`` / ``aiosqlite``). Pass ``False`` for synchronous
            consumers such as Alembic or administrative tooling.
    """
    if settings.db_type == "postgres":
        scheme = "postgresql+asyncpg" if async_driver else "postgresql"
        return (
            f"{scheme}://{settings.db_username}:{settings.db_password}"
            f"@{settings.db_host}:{settings.db_port}/{settings.db_database}"
        )

    scheme = "sqlite+aiosqlite" if async_driver else "sqlite"
    return f"{scheme}:///{_normalise_sqlite_path(settings.db_path)}"


def build_async_engine(settings: Settings) -> AsyncEngine:
    """Build the async engine described by *settings*.

    * ``postgres`` uses ``asyncpg`` with connection pooling.
    * ``sqlite`` uses ``aiosqlite`` with ``check_same_thread=False``.
    """
    if settings.db_type == "postgres":
        return _create_async_engine(
            database_url(settings),
            pool_size=20,
            max_overflow=10,
            pool_pre_ping=True,
            pool_recycle=3600,
        )

    return _create_async_engine(
        database_url(settings),
        connect_args={"check_same_thread": False},
    )


def build_sync_engine(settings: Settings) -> Engine | None:
    """Build a synchronous engine for administration tasks.

    Returns ``None`` for PostgreSQL: the async engine is authoritative there and
    a second pool would only add confusion.
    """
    if settings.db_type != "sqlite":
        return None

    return create_engine(
        database_url(settings, async_driver=False),
        poolclass=NullPool,
        connect_args={"check_same_thread": False},
    )
