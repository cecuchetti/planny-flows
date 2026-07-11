"""Tests for all 4 persistence repositories.

Uses async in-memory SQLite database.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from planny_jira.repositories import (
    DailyHoursRepository,
    ExternalHoursDailyRepository,
    SubmissionRepository,
    TempoHoursRepository,
)


class TestSubmissionRepository:
    """Tests for SubmissionRepository — CRUD for WorklogSubmission + results."""

    @pytest.mark.asyncio
    async def test_create_and_find_submission(self, db_session: AsyncSession) -> None:
        repo = SubmissionRepository()
        sub = await repo.create_submission(
            db_session,
            request_id="wlr_test001",
            target="TEMPO",
            tempo_issue_key="VIS-2",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Test worklog",
            overall_status="PENDING",
        )
        assert sub.id is not None
        assert sub.request_id == "wlr_test001"
        assert sub.target == "TEMPO"

        found = await repo.find_by_request_id(db_session, "wlr_test001")
        assert found is not None
        assert found.id == sub.id

    @pytest.mark.asyncio
    async def test_find_by_request_id_returns_none(self, db_session: AsyncSession) -> None:
        repo = SubmissionRepository()
        found = await repo.find_by_request_id(db_session, "wlr_nonexistent")
        assert found is None

    @pytest.mark.asyncio
    async def test_create_result_linked_to_submission(
        self, db_session: AsyncSession
    ) -> None:
        repo = SubmissionRepository()
        sub = await repo.create_submission(
            db_session,
            request_id="wlr_result_link",
            target="BOTH",
            tempo_issue_key="VIS-2",
            work_date="2026-07-11",
            time_spent_seconds=1800,
            description="Result linking test",
            overall_status="PENDING",
        )

        result = await repo.create_result(
            db_session,
            submission_id=sub.id,
            target_system="TEMPO",
            status="SUCCESS",
            external_id="ext-123",
            request_payload='{"timeSpentSeconds": 1800}',
        )
        assert result.id is not None
        assert result.submission_id == sub.id
        assert result.target_system == "TEMPO"
        assert result.status == "SUCCESS"
        assert result.external_id == "ext-123"

    @pytest.mark.asyncio
    async def test_update_submission_status(self, db_session: AsyncSession) -> None:
        repo = SubmissionRepository()
        sub = await repo.create_submission(
            db_session,
            request_id="wlr_status_update",
            target="TEMPO",
            tempo_issue_key="VIS-2",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Status update test",
            overall_status="PENDING",
        )
        assert sub.overall_status == "PENDING"

        await repo.update_submission_status(db_session, "wlr_status_update", "SUCCESS")

        found = await repo.find_by_request_id(db_session, "wlr_status_update")
        assert found is not None
        assert found.overall_status == "SUCCESS"

    @pytest.mark.asyncio
    async def test_search_submissions_with_filters(
        self, db_session: AsyncSession
    ) -> None:
        repo = SubmissionRepository()
        # Create two submissions
        await repo.create_submission(
            db_session,
            request_id="wlr_search_1",
            target="TEMPO",
            tempo_issue_key="VIS-2",
            work_date="2026-07-10",
            time_spent_seconds=3600,
            description="Search test 1",
            overall_status="SUCCESS",
        )
        await repo.create_submission(
            db_session,
            request_id="wlr_search_2",
            target="JIRA",
            tempo_issue_key="VIS-2",
            external_issue_key="EXT-1",
            work_date="2026-07-11",
            time_spent_seconds=1800,
            description="Search test 2",
            overall_status="FAILED",
        )
        await db_session.commit()

        # Filter by target
        items, total = await repo.search_submissions(
            db_session, target="TEMPO"
        )
        assert total == 1
        assert items[0].request_id == "wlr_search_1"

        # Filter by status
        items, total = await repo.search_submissions(
            db_session, status="FAILED"
        )
        assert total == 1
        assert items[0].request_id == "wlr_search_2"

        # Filter by date range
        items, total = await repo.search_submissions(
            db_session, from_date="2026-07-11", to_date="2026-07-11"
        )
        assert total == 1

        # No filter — both
        items, total = await repo.search_submissions(db_session)
        assert total == 2


class TestExternalHoursDailyRepository:
    """Tests for ExternalHoursDailyRepository."""

    @pytest.mark.asyncio
    async def test_upsert_hours_creates_new(self, db_session: AsyncSession) -> None:
        repo = ExternalHoursDailyRepository()
        record = await repo.upsert_hours(
            db_session, work_date="2026-07-11", total_seconds=28800
        )
        assert record.work_date == "2026-07-11"
        assert record.total_seconds == 28800
        assert record.source == "tempo"

    @pytest.mark.asyncio
    async def test_upsert_hours_updates_existing(
        self, db_session: AsyncSession
    ) -> None:
        repo = ExternalHoursDailyRepository()
        await repo.upsert_hours(
            db_session, work_date="2026-07-11", total_seconds=14400
        )
        record = await repo.upsert_hours(
            db_session, work_date="2026-07-11", total_seconds=28800
        )
        assert record.total_seconds == 28800

    @pytest.mark.asyncio
    async def test_add_hours_accumulates(self, db_session: AsyncSession) -> None:
        repo = ExternalHoursDailyRepository()
        record = await repo.add_hours(db_session, "2026-07-11", 3600)
        assert record.total_seconds == 3600

        record = await repo.add_hours(db_session, "2026-07-11", 1800)
        assert record.total_seconds == 5400

    @pytest.mark.asyncio
    async def test_get_by_date_range(self, db_session: AsyncSession) -> None:
        repo = ExternalHoursDailyRepository()
        await repo.upsert_hours(
            db_session, work_date="2026-07-10", total_seconds=14400
        )
        await repo.upsert_hours(
            db_session, work_date="2026-07-11", total_seconds=28800
        )
        await repo.upsert_hours(
            db_session, work_date="2026-07-12", total_seconds=3600
        )

        rows = await repo.get_by_date_range(db_session, "2026-07-11", "2026-07-12")
        assert len(rows) == 2
        assert rows[0]["work_date"] == "2026-07-11"
        assert rows[0]["total_seconds"] == 28800
        assert rows[1]["work_date"] == "2026-07-12"

    @pytest.mark.asyncio
    async def test_get_by_date_returns_none(self, db_session: AsyncSession) -> None:
        repo = ExternalHoursDailyRepository()
        record = await repo.get_by_date(db_session, "2026-07-11")
        assert record is None


class TestTempoHoursRepository:
    """Tests for TempoHoursRepository."""

    @pytest.mark.asyncio
    async def test_upsert_and_get_by_date(self, db_session: AsyncSession) -> None:
        repo = TempoHoursRepository()
        record = await repo.upsert_hours(db_session, "2026-07-11", 8.0)
        assert record.hours_logged == 8.0
        assert record.confirmed_at is not None

        found = await repo.get_by_date(db_session, "2026-07-11")
        assert found is not None
        assert float(found.hours_logged) == 8.0

    @pytest.mark.asyncio
    async def test_get_by_date_returns_none(self, db_session: AsyncSession) -> None:
        repo = TempoHoursRepository()
        found = await repo.get_by_date(db_session, "2099-01-01")
        assert found is None

    @pytest.mark.asyncio
    async def test_get_by_date_range(self, db_session: AsyncSession) -> None:
        repo = TempoHoursRepository()
        await repo.upsert_hours(db_session, "2026-07-10", 6.0)
        await repo.upsert_hours(db_session, "2026-07-11", 8.0)

        rows = await repo.get_by_date_range(db_session, "2026-07-10", "2026-07-11")
        assert len(rows) == 2
        assert float(rows[0].hours_logged) == 6.0
        assert float(rows[1].hours_logged) == 8.0


class TestDailyHoursRepository:
    """Tests for DailyHoursRepository."""

    @pytest.mark.asyncio
    async def test_upsert_creates_and_updates(self, db_session: AsyncSession) -> None:
        repo = DailyHoursRepository()
        record = await repo.upsert_hours(
            db_session, "2026-07-11", 8.0, source="tempo"
        )
        assert record.hours_logged == 8.0
        assert record.source == "tempo"
        assert record.id is not None

        record = await repo.upsert_hours(
            db_session, "2026-07-11", 4.0, source="manual"
        )
        assert float(record.hours_logged) == 4.0
        assert record.source == "manual"

    @pytest.mark.asyncio
    async def test_get_by_date(self, db_session: AsyncSession) -> None:
        repo = DailyHoursRepository()
        await repo.upsert_hours(db_session, "2026-07-11", 8.0, source="tempo")

        found = await repo.get_by_date(db_session, "2026-07-11")
        assert found is not None
        assert float(found.hours_logged) == 8.0

        missing = await repo.get_by_date(db_session, "2099-01-01")
        assert missing is None

    @pytest.mark.asyncio
    async def test_get_week_hours(self, db_session: AsyncSession) -> None:
        repo = DailyHoursRepository()
        await repo.upsert_hours(db_session, "2026-07-06", 8.0, source="tempo")
        await repo.upsert_hours(db_session, "2026-07-07", 8.0, source="tempo")
        await repo.upsert_hours(db_session, "2026-07-08", 6.0, source="manual")

        rows = await repo.get_week_hours(db_session, "2026-07-06", "2026-07-12")
        assert len(rows) == 3
        assert float(rows[0].hours_logged) == 8.0

    @pytest.mark.asyncio
    async def test_delete(self, db_session: AsyncSession) -> None:
        repo = DailyHoursRepository()
        await repo.upsert_hours(db_session, "2026-07-11", 8.0, source="tempo")
        assert await repo.get_by_date(db_session, "2026-07-11") is not None

        deleted = await repo.delete(db_session, "2026-07-11")
        assert deleted is True
        assert await repo.get_by_date(db_session, "2026-07-11") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, db_session: AsyncSession) -> None:
        repo = DailyHoursRepository()
        deleted = await repo.delete(db_session, "2099-01-01")
        assert deleted is False
