"""Tests for the database layer: URL building, engine construction and sessions."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select

from planny_core.config import Settings
from planny_core.db import Base, Database, database_url
from planny_core.models import Project


def _settings(**overrides: object) -> Settings:
    """Build settings from explicit field values, ignoring any ``.env`` file."""
    return Settings(_env_file=None, **overrides)


class TestDatabaseUrl:
    """``database_url`` is the single URL builder in the project."""

    def test_postgres_async_driver(self) -> None:
        url = database_url(
            _settings(
                db_type="postgres",
                db_host="db",
                db_port=5432,
                db_username="u",
                db_password="p",
                db_database="d",
            )
        )
        assert url == "postgresql+asyncpg://u:p@db:5432/d"

    def test_postgres_sync_driver(self) -> None:
        url = database_url(
            _settings(db_type="postgres", db_username="u", db_password="p", db_database="d"),
            async_driver=False,
        )
        assert url == "postgresql://u:p@localhost:5432/d"

    def test_sqlite_strips_leading_dot_slash(self) -> None:
        url = database_url(_settings(db_type="sqlite", db_path="./data/jira.sqlite"))
        assert url == "sqlite+aiosqlite:///data/jira.sqlite"

    def test_sqlite_without_prefix_is_unchanged(self) -> None:
        url = database_url(_settings(db_type="sqlite", db_path="data/jira.sqlite"))
        assert url == "sqlite+aiosqlite:///data/jira.sqlite"

    def test_sqlite_absolute_path(self) -> None:
        url = database_url(_settings(db_type="sqlite", db_path="/srv/x.sqlite"))
        assert url == "sqlite+aiosqlite:////srv/x.sqlite"

    def test_sqlite_sync_driver(self) -> None:
        url = database_url(_settings(db_type="sqlite", db_path="data/x.sqlite"), async_driver=False)
        assert url == "sqlite:///data/x.sqlite"


class TestDatabaseConstruction:
    """A ``Database`` is driven purely by the settings it is given."""

    def test_engine_url_comes_from_settings(self) -> None:
        db = Database(_settings(db_type="sqlite", db_path="data/one.sqlite"))
        assert str(db.engine.url) == "sqlite+aiosqlite:///data/one.sqlite"

    def test_two_databases_from_different_settings_do_not_share_an_engine(self) -> None:
        """Regression guard for the module-level global engine (blueprint 4.6).

        Before the ``Database`` class existed, the engine was created at import
        time and mutating settings could not change it, so ``create_app`` could
        not control the database.
        """
        first = Database(_settings(db_type="sqlite", db_path="data/a.sqlite"))
        second = Database(_settings(db_type="sqlite", db_path="data/b.sqlite"))
        assert str(first.engine.url) != str(second.engine.url)

    def test_sync_engine_is_absent_for_postgres(self) -> None:
        db = Database(_settings(db_type="postgres"))
        assert db.sync_engine is None

    def test_sync_engine_exists_for_sqlite(self) -> None:
        db = Database(_settings(db_type="sqlite", db_path="data/x.sqlite"))
        assert db.sync_engine is not None


class TestDatabaseSession:
    """The session context manager is the transaction boundary."""

    @staticmethod
    async def _prepare(tmp_path: Path) -> Database:
        db = Database(_settings(db_type="sqlite", db_path=str(tmp_path / "t.sqlite")))
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        return db

    async def test_commits_on_success(self, tmp_path: Path) -> None:
        db = await self._prepare(tmp_path)
        try:
            async with db.session() as session:
                session.add(Project(name="committed", category="software"))

            async with db.session() as session:
                found = await session.execute(select(Project).where(Project.name == "committed"))
                assert found.scalars().first() is not None
        finally:
            await db.dispose()

    async def test_rolls_back_on_error(self, tmp_path: Path) -> None:
        db = await self._prepare(tmp_path)
        try:
            with pytest.raises(RuntimeError):
                async with db.session() as session:
                    session.add(Project(name="rolled-back", category="software"))
                    raise RuntimeError("boom")

            async with db.session() as session:
                found = await session.execute(select(Project).where(Project.name == "rolled-back"))
                assert found.scalars().first() is None
        finally:
            await db.dispose()

    async def test_dispose_is_safe_to_call_twice(self, tmp_path: Path) -> None:
        db = await self._prepare(tmp_path)
        await db.dispose()
        await db.dispose()
