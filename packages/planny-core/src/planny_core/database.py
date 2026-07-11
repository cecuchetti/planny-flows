"""Database engine and session factory.

Supports two modes based on ``settings.db_type``:

* **postgres** — async engine via ``asyncpg`` with connection pooling.
* **sqlite** — async engine via ``aiosqlite`` with ``check_same_thread=False``.

Exports ``Base`` (SQLAlchemy 2.0 declarative base), ``async_engine``,
``sync_engine``, ``create_async_engine`` (factory), ``async_session_factory``,
and ``get_db()`` (async generator suitable for FastAPI ``Depends``).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import Engine, create_engine
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.ext.asyncio import (
    create_async_engine as _create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from planny_core.config import settings

__all__ = [
    "Base",
    "async_engine",
    "async_session_factory",
    "create_async_engine",
    "get_db",
    "sync_engine",
]


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 declarative base for all models."""
    pass


def create_async_engine() -> AsyncEngine:
    """Create and return an async engine based on ``settings.db_type``.

    * ``postgres`` — ``asyncpg`` with connection pooling (pool_size=20,
      max_overflow=10, pool_pre_ping=True, pool_recycle=3600).
    * ``sqlite`` — ``aiosqlite`` with ``check_same_thread=False``.
    """
    if settings.db_type == "postgres":
        return _create_async_engine(
            f"postgresql+asyncpg://{settings.db_username}:{settings.db_password}"
            f"@{settings.db_host}:{settings.db_port}/{settings.db_database}",
            pool_size=20,
            max_overflow=10,
            pool_pre_ping=True,
            pool_recycle=3600,
        )

    # SQLite
    db_path = settings.db_path
    if db_path.startswith("./"):
        db_path = db_path[2:]  # strip leading ./

    return _create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )


def _create_sync_engine() -> Engine | None:
    """Create a sync engine for SQLite administration tasks.

    Returns ``None`` for PostgreSQL (use the async engine instead).
    """
    if settings.db_type != "sqlite":
        return None

    db_path = settings.db_path
    if db_path.startswith("./"):
        db_path = db_path[2:]

    return create_engine(
        f"sqlite:///{db_path}",
        poolclass=NullPool,
        connect_args={"check_same_thread": False},
    )


# ── Module-level engine instances ──────────────────────────────────────────

async_engine: AsyncEngine = create_async_engine()
sync_engine = _create_sync_engine()

# ── Session factory ─────────────────────────────────────────────────────────

async_session_factory = async_sessionmaker(
    bind=async_engine,
    expire_on_commit=False,
)


# ── Dependency helper ───────────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI-compatible async generator yielding a DB session.

    Commits on success, rolls back on exception, and always closes.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
