"""Tests for the pagination primitives."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from sqlalchemy import select

from planny_core.config import Settings
from planny_core.db import Base, Database
from planny_core.models import Project
from planny_core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page, count_rows


def _settings(db_path: str) -> Settings:
    return Settings(_env_file=None, db_type="sqlite", db_path=db_path)


class TestPage:
    """The window normalises whatever the client sends."""

    def test_defaults(self) -> None:
        page = Page()
        assert page.number == 0
        assert page.size == DEFAULT_PAGE_SIZE
        assert page.total == 0

    def test_negative_number_is_clamped(self) -> None:
        assert Page(number=-5).number == 0

    def test_size_is_at_least_one(self) -> None:
        assert Page(size=0).size == 1
        assert Page(size=-3).size == 1

    def test_size_is_capped(self) -> None:
        """A client must not be able to ask for the whole table."""
        assert Page(size=10_000).size == MAX_PAGE_SIZE

    def test_negative_total_is_clamped(self) -> None:
        assert Page(total=-1).total == 0

    def test_offset_and_limit(self) -> None:
        page = Page(number=2, size=10)
        assert page.offset == 20
        assert page.limit == 10

    def test_pages_uses_ceiling_division(self) -> None:
        assert Page(size=10, total=25).pages == 3
        assert Page(size=10, total=20).pages == 2

    def test_pages_is_zero_without_rows(self) -> None:
        assert Page(size=10, total=0).pages == 0

    def test_has_more(self) -> None:
        assert Page(number=0, size=10, total=25).has_more is True
        assert Page(number=2, size=10, total=25).has_more is False
        assert Page(number=0, size=10, total=10).has_more is False
        assert Page(number=0, size=10, total=0).has_more is False

    def test_with_total_returns_a_new_page(self) -> None:
        page = Page(number=1, size=5).with_total(12)
        assert page.total == 12
        assert page.number == 1
        assert page.size == 5

    def test_is_frozen(self) -> None:
        with pytest.raises(FrozenInstanceError):
            Page().size = 99  # type: ignore[misc]


class TestCountRows:
    """Counting delegates to the database instead of loading every row."""

    @staticmethod
    async def _database(tmp_path: Path, rows: int) -> Database:
        db = Database(_settings(str(tmp_path / "count.sqlite")))
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with db.session() as session:
            for index in range(rows):
                session.add(Project(name=f"p{index}", category="software"))
        return db

    async def test_counts_matching_rows(self, tmp_path: Path) -> None:
        db = await self._database(tmp_path, 7)
        try:
            async with db.session() as session:
                assert await count_rows(session, select(Project)) == 7
        finally:
            await db.dispose()

    async def test_counts_respect_filters(self, tmp_path: Path) -> None:
        db = await self._database(tmp_path, 4)
        try:
            async with db.session() as session:
                filtered = select(Project).where(Project.name == "p1")
                assert await count_rows(session, filtered) == 1
        finally:
            await db.dispose()

    async def test_zero_when_nothing_matches(self, tmp_path: Path) -> None:
        db = await self._database(tmp_path, 2)
        try:
            async with db.session() as session:
                missing = select(Project).where(Project.name == "absent")
                assert await count_rows(session, missing) == 0
        finally:
            await db.dispose()

    async def test_emits_a_count_query(self) -> None:
        """Regression: the old implementation selected every id and took len().

        Pinning the compiled SQL is the only way to assert this from a test; the
        result is identical either way, so a behavioural test would not catch a
        regression here.
        """
        from sqlalchemy import func
        from sqlalchemy.dialects import sqlite

        query = select(Project).where(Project.name == "p1").order_by(Project.id)
        counted = select(func.count()).select_from(query.order_by(None).subquery())
        compiled = str(counted.compile(dialect=sqlite.dialect()))

        assert "count(*)" in compiled.lower()
        # The ordering must not leak into the count, or the subquery is wasted work.
        assert "order by" not in compiled.lower()
