"""Tests for WorklogService orchestration logic.

All tests mock JiraHttpClient — no real API calls.
"""

from __future__ import annotations


import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from planny_jira.client import JiraHttpClient, JiraInstanceConfig
from planny_jira.worklog_service import (
    CreateWorklogRequest,
    SubmissionStatus,
    WorklogService,
    WorklogTarget,
)


def _make_mock_client(
    system_name: str = "test",
    post_response: dict | None = None,
    post_error: Exception | None = None,
) -> JiraHttpClient:
    """Create a JiraHttpClient with a stubbed post method."""
    config = JiraInstanceConfig(
        base_url="https://jira.test.com",
        auth_type="basic",
        email="test@test.com",
        api_token="test-token",
        system_name=system_name,
    )
    client = JiraHttpClient(config)

    async def successful_post(
        path: str, json_data: dict | None = None, **kwargs: object
    ) -> dict:
        if post_error:
            raise post_error
        return post_response or {"id": "12345", "key": "TEST-1"}

    client.post = successful_post  # type: ignore[assignment]
    return client


def _make_mock_client_failing(
    system_name: str = "test",
    status_code: int = 500,
    error_message: str = "Internal Server Error",
) -> JiraHttpClient:
    """Create a JiraHttpClient that raises on any POST."""
    config = JiraInstanceConfig(
        base_url="https://jira.test.com",
        auth_type="basic",
        email="test@test.com",
        api_token="test-token",
        system_name=system_name,
    )
    client = JiraHttpClient(config)

    async def failing_post(
        path: str, json_data: dict | None = None, **kwargs: object
    ) -> dict:
        raise httpx.HTTPStatusError(
            error_message,
            request=httpx.Request("POST", path),
            response=httpx.Response(status_code=status_code),
        )

    client.post = failing_post  # type: ignore[assignment]
    return client


@pytest_asyncio.fixture
async def service(db_session: AsyncSession) -> WorklogService:
    """Create a WorklogService with mocked clients."""
    internal = _make_mock_client(
        system_name="internal-jira",
        post_response={"id": "tempo-123", "key": "TEMPO-1"},
    )
    external = _make_mock_client(
        system_name="external-jira",
        post_response={"id": "jira-456", "key": "EXT-1"},
    )
    svc = WorklogService(
        internal_client=internal,
        external_client=external,
        tempo_issue_key="VIS-2",
        external_account_id="acc-123",
    )
    yield svc
    await internal.close()
    await external.close()


class TestCreateWorklogTempoOnly:
    """TEMPO target: only internal client called."""

    @pytest.mark.asyncio
    async def test_create_tempo_worklog_success(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """Create TEMPO worklog → internal client called, external skipped, SUCCESS."""
        request = CreateWorklogRequest(
            target=WorklogTarget.TEMPO,
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Working on VIS-2",
        )

        result = await service.create_worklog(request, db_session)

        assert result["target"] == "TEMPO"
        assert result["overall_status"] == "SUCCESS"
        assert result["request_id"].startswith("wlr_")
        assert len(result["results"]) == 1

        r = result["results"][0]
        assert r["system"] == "TEMPO"
        assert r["status"] == "SUCCESS"
        assert r["external_id"] == "tempo-123"

    @pytest.mark.asyncio
    async def test_create_tempo_worklog_submission_persisted(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """Verify the submission record is persisted after creation."""
        request = CreateWorklogRequest(
            target=WorklogTarget.TEMPO,
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Test persistence",
        )

        result = await service.create_worklog(request, db_session)
        request_id = result["request_id"]

        from planny_jira.repositories import SubmissionRepository

        repo = SubmissionRepository()
        found = await repo.find_by_request_id(db_session, str(request_id))
        assert found is not None
        assert found.overall_status == "SUCCESS"
        assert len(found.results) == 1
        assert found.results[0].target_system == "TEMPO"


class TestCreateWorklogJiraOnly:
    """JIRA target: only external client called."""

    @pytest.mark.asyncio
    async def test_create_jira_worklog_success(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """Create JIRA worklog → external client called, success."""
        request = CreateWorklogRequest(
            target=WorklogTarget.JIRA,
            external_issue_key="EXT-1",
            work_date="2026-07-11",
            time_spent_seconds=1800,
            description="Worked on external issue",
        )

        result = await service.create_worklog(request, db_session)

        assert result["target"] == "JIRA"
        assert result["overall_status"] == "SUCCESS"
        assert len(result["results"]) == 1
        assert result["results"][0]["system"] == "JIRA"
        assert result["results"][0]["status"] == "SUCCESS"

    @pytest.mark.asyncio
    async def test_create_jira_worklog_requires_external_issue_key(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """JIRA target without externalIssueKey raises ValueError."""
        request = CreateWorklogRequest(
            target=WorklogTarget.JIRA,
            work_date="2026-07-11",
            time_spent_seconds=1800,
            description="Missing issue key",
        )

        with pytest.raises(ValueError, match="externalIssueKey is required"):
            await service.create_worklog(request, db_session)


class TestCreateWorklogBoth:
    """BOTH target: both clients called."""

    @pytest.mark.asyncio
    async def test_create_both_worklog_success(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """Both clients called, both SUCCESS, overall SUCCESS."""
        request = CreateWorklogRequest(
            target=WorklogTarget.BOTH,
            external_issue_key="EXT-1",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Worked on both instances",
        )

        result = await service.create_worklog(request, db_session)

        assert result["target"] == "BOTH"
        assert result["overall_status"] == "SUCCESS"
        assert len(result["results"]) == 2

        systems = {r["system"] for r in result["results"]}
        assert systems == {"TEMPO", "JIRA"}
        assert all(r["status"] == "SUCCESS" for r in result["results"])

    @pytest.mark.asyncio
    async def test_external_fails_partial_success(
        self, db_session: AsyncSession
    ) -> None:
        """External client fails → external FAILED, overall PARTIAL_SUCCESS."""
        internal = _make_mock_client(
            system_name="internal",
            post_response={"id": "tempo-ok", "key": "TEMPO-1"},
        )
        external = _make_mock_client_failing(
            system_name="external",
            status_code=400,
            error_message="Bad request",
        )
        svc = WorklogService(
            internal_client=internal,
            external_client=external,
            tempo_issue_key="VIS-2",
        )

        request = CreateWorklogRequest(
            target=WorklogTarget.BOTH,
            external_issue_key="EXT-1",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Partial success test",
        )

        result = await svc.create_worklog(request, db_session)

        assert result["overall_status"] == "PARTIAL_SUCCESS"
        assert len(result["results"]) == 2

        tempo_r = next(r for r in result["results"] if r["system"] == "TEMPO")
        jira_r = next(r for r in result["results"] if r["system"] == "JIRA")
        assert tempo_r["status"] == "SUCCESS"
        assert jira_r["status"] == "FAILED"

        await internal.close()
        await external.close()

    @pytest.mark.asyncio
    async def test_both_fail_overall_failed(
        self, db_session: AsyncSession
    ) -> None:
        """Both clients fail → overall FAILED."""
        internal = _make_mock_client_failing(
            system_name="internal", status_code=500
        )
        external = _make_mock_client_failing(
            system_name="external", status_code=503
        )
        svc = WorklogService(
            internal_client=internal,
            external_client=external,
            tempo_issue_key="VIS-2",
        )

        request = CreateWorklogRequest(
            target=WorklogTarget.BOTH,
            external_issue_key="EXT-1",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Both fail test",
        )

        result = await svc.create_worklog(request, db_session)

        assert result["overall_status"] == "FAILED"
        assert all(r["status"] == "FAILED" for r in result["results"])

        await internal.close()
        await external.close()


class TestHoursUpdate:
    """Hours updated atomically with submission."""

    @pytest.mark.asyncio
    async def test_hours_updated_on_jira_success(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """ExternalHoursDaily updated after JIRA submission."""
        request = CreateWorklogRequest(
            target=WorklogTarget.JIRA,
            external_issue_key="EXT-1",
            work_date="2026-07-11",
            time_spent_seconds=7200,
            description="2 hours of work",
        )

        await service.create_worklog(request, db_session)

        from planny_jira.repositories import ExternalHoursDailyRepository

        repo = ExternalHoursDailyRepository()
        rows = await repo.get_by_date_range(db_session, "2026-07-11", "2026-07-11")
        assert len(rows) == 1
        assert rows[0]["total_seconds"] == 7200
        assert rows[0]["work_date"] == "2026-07-11"

    @pytest.mark.asyncio
    async def test_hours_not_updated_for_tempo_only(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """TEMPO-only target should NOT update ExternalHoursDaily."""
        request = CreateWorklogRequest(
            target=WorklogTarget.TEMPO,
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Tempo only",
        )

        await service.create_worklog(request, db_session)

        from planny_jira.repositories import ExternalHoursDailyRepository

        repo = ExternalHoursDailyRepository()
        rows = await repo.get_by_date_range(db_session, "2026-07-11", "2026-07-11")
        assert len(rows) == 0

    @pytest.mark.asyncio
    async def test_hours_not_updated_when_jira_fails(
        self, db_session: AsyncSession
    ) -> None:
        """Failed JIRA submission should not increment ExternalHoursDaily."""
        internal = _make_mock_client(
            system_name="internal",
            post_response={"id": "tempo-ok", "key": "TEMPO-1"},
        )
        external = _make_mock_client_failing(system_name="external", status_code=500)
        service = WorklogService(
            internal_client=internal,
            external_client=external,
            tempo_issue_key="VIS-2",
        )

        request = CreateWorklogRequest(
            target=WorklogTarget.JIRA,
            external_issue_key="EXT-1",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="External failure",
        )

        result = await service.create_worklog(request, db_session)
        assert result["overall_status"] == "FAILED"

        from planny_jira.repositories import ExternalHoursDailyRepository

        repo = ExternalHoursDailyRepository()
        rows = await repo.get_by_date_range(db_session, "2026-07-11", "2026-07-11")
        assert rows == []

        await internal.close()
        await external.close()

    @pytest.mark.asyncio
    async def test_hours_not_updated_when_both_target_jira_fails(
        self, db_session: AsyncSession
    ) -> None:
        """BOTH partial success should not count hours unless JIRA succeeds."""
        internal = _make_mock_client(
            system_name="internal",
            post_response={"id": "tempo-ok", "key": "TEMPO-1"},
        )
        external = _make_mock_client_failing(system_name="external", status_code=400)
        service = WorklogService(
            internal_client=internal,
            external_client=external,
            tempo_issue_key="VIS-2",
        )

        request = CreateWorklogRequest(
            target=WorklogTarget.BOTH,
            external_issue_key="EXT-1",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Tempo succeeds, Jira fails",
        )

        result = await service.create_worklog(request, db_session)
        assert result["overall_status"] == "PARTIAL_SUCCESS"

        from planny_jira.repositories import ExternalHoursDailyRepository

        repo = ExternalHoursDailyRepository()
        rows = await repo.get_by_date_range(db_session, "2026-07-11", "2026-07-11")
        assert rows == []

        await internal.close()
        await external.close()


class TestSubmissionHistory:
    """Submission history retrieval with filters."""

    @pytest.mark.asyncio
    async def test_get_submission_history_with_date_filters(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """Filter by date range returns correct results."""
        # Create a TEMPO submission on 2026-07-10
        req1 = CreateWorklogRequest(
            target=WorklogTarget.TEMPO,
            work_date="2026-07-10",
            time_spent_seconds=3600,
            description="Day 1",
        )
        await service.create_worklog(req1, db_session)

        # Create a TEMPO submission on 2026-07-12
        req2 = CreateWorklogRequest(
            target=WorklogTarget.TEMPO,
            work_date="2026-07-12",
            time_spent_seconds=7200,
            description="Day 2",
        )
        await service.create_worklog(req2, db_session)

        # Filter to 2026-07-10 only
        history = await service.get_submission_history(
            db_session, from_date="2026-07-10", to_date="2026-07-10"
        )
        items = history["items"]
        assert history["total"] == 1
        assert len(items) == 1
        assert items[0]["work_date"] == "2026-07-10"
        assert items[0]["time_spent_seconds"] == 3600

        # Wider range
        history = await service.get_submission_history(
            db_session, from_date="2026-07-10", to_date="2026-07-12"
        )
        assert history["total"] == 2

    @pytest.mark.asyncio
    async def test_get_submission_history_empty(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """No matching submissions returns empty list."""
        history = await service.get_submission_history(
            db_session, from_date="2099-01-01", to_date="2099-12-31"
        )
        assert history["total"] == 0
        assert len(history["items"]) == 0


class TestGetHoursByDate:
    """Hours aggregation by date range."""

    @pytest.mark.asyncio
    async def test_get_hours_by_date_returns_aggregation(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """get_hours_by_date returns correct aggregation."""
        # Create JIRA submissions that update hours
        req1 = CreateWorklogRequest(
            target=WorklogTarget.JIRA,
            external_issue_key="EXT-1",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="First entry",
        )
        await service.create_worklog(req1, db_session)

        req2 = CreateWorklogRequest(
            target=WorklogTarget.JIRA,
            external_issue_key="EXT-1",
            work_date="2026-07-11",
            time_spent_seconds=1800,
            description="Second entry",
        )
        await service.create_worklog(req2, db_session)

        hours = await service.get_hours_by_date(
            db_session, "2026-07-11", "2026-07-11"
        )
        assert len(hours) == 1
        # After two submissions: 3600 + 1800 = 5400
        assert hours[0]["total_seconds"] == 5400

    @pytest.mark.asyncio
    async def test_get_hours_by_date_empty_range(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """Empty date range returns empty list."""
        hours = await service.get_hours_by_date(
            db_session, "2099-01-01", "2099-01-31"
        )
        assert len(hours) == 0


class TestUpdateHoursForDate:
    """Manual override of daily hours."""

    @pytest.mark.asyncio
    async def test_update_hours_for_date(
        self, service: WorklogService, db_session: AsyncSession
    ) -> None:
        """Manual override sets exact hours."""
        result = await service.update_hours_for_date(
            db_session, "2026-07-11", 28800
        )
        assert result["work_date"] == "2026-07-11"
        assert result["total_seconds"] == 28800
        assert result["source"] == "tempo"

        # Override again
        result = await service.update_hours_for_date(
            db_session, "2026-07-11", 14400
        )
        assert result["total_seconds"] == 14400


class TestNormalization:
    """Date/time normalization helpers."""

    def test_normalize_date_time_with_started_at(self) -> None:
        work_date, started_at = WorklogService._normalize_date_time(
            None, "2026-07-11T14:30:00Z"
        )
        assert work_date == "2026-07-11"
        assert started_at == "2026-07-11T14:30:00Z"

    def test_normalize_date_time_with_work_date(self) -> None:
        work_date, started_at = WorklogService._normalize_date_time(
            "2026-07-11", None
        )
        assert work_date == "2026-07-11"
        assert started_at is None

    def test_normalize_date_time_raises_without_args(self) -> None:
        with pytest.raises(ValueError, match="work_date or started_at"):
            WorklogService._normalize_date_time(None, None)

    def test_calculate_overall_status(self) -> None:
        calc = WorklogService._calculate_overall_status

        assert calc([]) == SubmissionStatus.PENDING

        all_success = [
            {"system": "TEMPO", "status": "SUCCESS"},
        ]
        assert calc(all_success) == SubmissionStatus.SUCCESS

        all_failed = [
            {"system": "TEMPO", "status": "FAILED"},
            {"system": "JIRA", "status": "FAILED"},
        ]
        assert calc(all_failed) == SubmissionStatus.FAILED

        mixed = [
            {"system": "TEMPO", "status": "SUCCESS"},
            {"system": "JIRA", "status": "FAILED"},
        ]
        assert calc(mixed) == SubmissionStatus.PARTIAL_SUCCESS
