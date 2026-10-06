"""Database handle: engine, session factory and transaction boundary.

:class:`Database` is constructed from explicit settings and is meant to be owned
by the application context (see blueprint section 4.8), not instantiated at
module import time.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import Engine
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from planny_core.config import Settings
from planny_core.db.engine import build_async_engine, build_sync_engine

__all__ = ["Database"]


class Database:
    """Owns the engine and session factory for one configuration.

    Usage::

        db = Database(settings)
        async with db.session() as session:
            ...
        await db.dispose()
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.engine: AsyncEngine = build_async_engine(settings)
        self.sync_engine: Engine | None = build_sync_engine(settings)
        self.session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            bind=self.engine,
            expire_on_commit=False,
        )

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """Yield a session, committing on success and rolling back on error.

        This is the single transaction boundary used by the request dependency.
        """
        async with self.session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def dispose(self) -> None:
        """Close the connection pools. Safe to call more than once."""
        await self.engine.dispose()
        if self.sync_engine is not None:
            self.sync_engine.dispose()
