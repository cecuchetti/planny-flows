"""Tests for Jira integration routes — worklogs and issues.

Uses an in-memory SQLite database and mocks all external services
(WorklogService, JiraHttpClient, and Jira config).
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.database import Base
from planny_core.models import User
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from planny_api.dependencies import (
    get_current_user,
    get_db,
    get_jira_issue_client,
    get_jira_worklog_service,
    require_jira_config,
)
from planny_api.main import create_app

# ── Shared fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
def app() -> FastAPI:
    """Create a fresh app instance for each test."""
    return create_app()


@pytest.fixture
async def db_engine():
    """Create an in-memory SQLite engine with all tables."""
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
def mock_user() -> User:
    """Return a standard mock user."""
    return User(
        id=42,
        name="Test User",
        email="test@example.com",
        avatarUrl="https://example.com/avatar.jpg",
        projectId=1,
        createdAt=datetime.now(UTC),
        updatedAt=datetime.now(UTC),
    )


@pytest.fixture
def mock_wls() -> MagicMock:
    """Return a default-configured WorklogService mock."""
    svc = MagicMock()
    svc.create_worklog = AsyncMock(
        return_value={
            "request_id": "wlr_test123",
            "target": "TEMPO",
            "overall_status": "SUCCESS",
            "results": [
                {
                    "system": "TEMPO",
                    "issue_key": "VIS-2",
                    "status": "SUCCESS",
                    "external_id": "tempo-123",
                    "message": "Tempo worklog created successfully.",
                }
            ],
        }
    )
    svc.get_submission_history = AsyncMock(
        return_value={
            "items": [
                {
                    "id": 1,
                    "request_id": "wlr_test123",
                    "target": "TEMPO",
                    "work_date": "2026-07-11",
                    "time_spent_seconds": 3600,
                    "description": "Test worklog",
                    "overall_status": "SUCCESS",
                }
            ],
            "total": 1,
        }
    )
    svc.get_hours_by_date = AsyncMock(
        return_value=[
            {"work_date": "2026-07-11", "total_seconds": 3600, "source": "tempo"},
        ]
    )
    svc.update_hours_for_date = AsyncMock(
        return_value={
            "work_date": "2026-07-11",
            "total_seconds": 28800,
            "source": "manual",
        }
    )
    return svc


@pytest.fixture
def mock_jira_client() -> MagicMock:
    """Return a default-configured JiraHttpClient mock."""
    client = MagicMock()
    client.get = AsyncMock()
    client.post = AsyncMock()
    return client


@pytest.fixture
async def client(
    app: FastAPI,
    db_engine,
    mock_user: User,
    mock_wls: MagicMock,
    mock_jira_client: MagicMock,
) -> AsyncClient:
    """Test client with DB, auth, and Jira dependencies overridden."""
    # ── Override DB ──────────────────────────────────────────────────────
    factory = async_sessionmaker(
        bind=db_engine,
        expire_on_commit=False,
    )

    async def _get_db_override():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    app.dependency_overrides[get_db] = _get_db_override

    # ── Override auth ────────────────────────────────────────────────────
    async def _override_user():
        return mock_user

    app.dependency_overrides[get_current_user] = _override_user

    # ── Override require_jira_config (no-op) ─────────────────────────────
    async def _noop():
        pass

    app.dependency_overrides[require_jira_config] = _noop

    # ── Override service dependencies ────────────────────────────────────
    app.dependency_overrides[get_jira_worklog_service] = lambda: mock_wls
    app.dependency_overrides[get_jira_issue_client] = lambda: mock_jira_client

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ═══════════════════════════════════════════════════════════════════════════════
# 401 Unauthorized (no auth token)
# ═══════════════════════════════════════════════════════════════════════════════


class TestUnauthorized:
    """All Jira routes return 401 without authentication."""

    @pytest.mark.asyncio
    async def test_worklogs_post_returns_401(self, app: FastAPI, db_engine) -> None:
        """POST /api/v1/jira/worklogs returns 401 without auth."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/v1/jira/worklogs", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_worklogs_get_returns_401(self, app: FastAPI, db_engine) -> None:
        """GET /api/v1/jira/worklogs returns 401 without auth."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/v1/jira/worklogs")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_hours_by_date_get_returns_401(self, app: FastAPI, db_engine) -> None:
        """GET /api/v1/jira/worklogs/hours-by-date returns 401 without auth."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(
                "/api/v1/jira/worklogs/hours-by-date",
                params={"start": "2026-07-01", "end": "2026-07-31"},
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_hours_by_date_patch_returns_401(self, app: FastAPI, db_engine) -> None:
        """PATCH /api/v1/jira/worklogs/hours-by-date/{date} returns 401."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.patch(
                "/api/v1/jira/worklogs/hours-by-date/2026-07-11",
                json={"totalSeconds": 28800},
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_issues_get_returns_401(self, app: FastAPI, db_engine) -> None:
        """GET /api/v1/jira/issues returns 401 without auth."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(
                "/api/v1/jira/issues",
                params={"jql": "project=VIS"},
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_issue_by_key_returns_401(self, app: FastAPI, db_engine) -> None:
        """GET /api/v1/jira/issues/{key} returns 401 without auth."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/v1/jira/issues/VIS-1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_transitions_get_returns_401(self, app: FastAPI, db_engine) -> None:
        """GET /api/v1/jira/issues/{key}/transitions returns 401."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/v1/jira/issues/VIS-1/transitions")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_transitions_post_returns_401(self, app: FastAPI, db_engine) -> None:
        """POST /api/v1/jira/issues/{key}/transitions returns 401."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/jira/issues/VIS-1/transitions",
                json={"transitionId": "21"},
            )
        assert resp.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════════
# 503 Integration Unavailable (no Jira config)
# ═══════════════════════════════════════════════════════════════════════════════


class TestJiraNotConfigured:
    """All Jira routes return 503 when Jira is not configured.

    Overrides ``require_jira_config`` to raise ``IntegrationUnavailableError``.
    """

    @pytest.fixture
    async def unconfigured_client(
        self, app: FastAPI, db_engine, mock_user: User
    ) -> AsyncClient:
        """Client with require_jira_config that raises 503."""
        from planny_core.errors import IntegrationUnavailableError

        factory = async_sessionmaker(
            bind=db_engine,
            expire_on_commit=False,
        )

        async def _get_db_override():
            async with factory() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise
                finally:
                    await session.close()

        app.dependency_overrides[get_db] = _get_db_override

        async def _override_user():
            return mock_user

        app.dependency_overrides[get_current_user] = _override_user

        async def _raise_unavailable():
            raise IntegrationUnavailableError()

        app.dependency_overrides[require_jira_config] = _raise_unavailable

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_worklogs_post_returns_503(
        self, unconfigured_client: AsyncClient
    ) -> None:
        """POST /api/v1/jira/worklogs returns 503 when Jira not configured."""
        resp = await unconfigured_client.post(
            "/api/v1/jira/worklogs",
            json={"target": "TEMPO", "timeSpentSeconds": 3600},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"]["code"] == "INTEGRATION_UNAVAILABLE"

    @pytest.mark.asyncio
    async def test_worklogs_get_returns_503(
        self, unconfigured_client: AsyncClient
    ) -> None:
        """GET /api/v1/jira/worklogs returns 503 when Jira not configured."""
        resp = await unconfigured_client.get(
            "/api/v1/jira/worklogs",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_hours_by_date_returns_503(
        self, unconfigured_client: AsyncClient
    ) -> None:
        """GET /api/v1/jira/worklogs/hours-by-date returns 503."""
        resp = await unconfigured_client.get(
            "/api/v1/jira/worklogs/hours-by-date",
            params={"start": "2026-07-01", "end": "2026-07-31"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_issues_get_returns_503(
        self, unconfigured_client: AsyncClient
    ) -> None:
        """GET /api/v1/jira/issues returns 503 when Jira not configured."""
        resp = await unconfigured_client.get(
            "/api/v1/jira/issues",
            params={"jql": "project=VIS"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_issue_by_key_returns_503(
        self, unconfigured_client: AsyncClient
    ) -> None:
        """GET /api/v1/jira/issues/{key} returns 503."""
        resp = await unconfigured_client.get(
            "/api/v1/jira/issues/VIS-1",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_transitions_get_returns_503(
        self, unconfigured_client: AsyncClient
    ) -> None:
        """GET /api/v1/jira/issues/{key}/transitions returns 503."""
        resp = await unconfigured_client.get(
            "/api/v1/jira/issues/VIS-1/transitions",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_transitions_post_returns_503(
        self, unconfigured_client: AsyncClient
    ) -> None:
        """POST /api/v1/jira/issues/{key}/transitions returns 503."""
        resp = await unconfigured_client.post(
            "/api/v1/jira/issues/VIS-1/transitions",
            json={"transitionId": "21"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 503


# ═══════════════════════════════════════════════════════════════════════════════
# Worklog Routes
# ═══════════════════════════════════════════════════════════════════════════════


class TestCreateWorklog:
    """POST /api/v1/jira/worklogs — create a worklog submission."""

    @pytest.mark.asyncio
    async def test_creates_worklog_successfully(self, client: AsyncClient) -> None:
        """POST with valid body returns 200 and submission result."""
        resp = await client.post(
            "/api/v1/jira/worklogs",
            json={
                "target": "TEMPO",
                "timeSpentSeconds": 3600,
                "description": "Test worklog",
            },
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["request_id"] == "wlr_test123"
        assert body["overall_status"] == "SUCCESS"

    @pytest.mark.asyncio
    async def test_creates_jira_worklog(self, client: AsyncClient) -> None:
        """POST with JIRA target includes externalIssueKey."""
        resp = await client.post(
            "/api/v1/jira/worklogs",
            json={
                "target": "JIRA",
                "externalIssueKey": "VIS-1",
                "timeSpentSeconds": 1800,
                "description": "Jira worklog",
            },
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        assert resp.json()["overall_status"] == "SUCCESS"

    @pytest.mark.asyncio
    async def test_missing_target_returns_422(self, client: AsyncClient) -> None:
        """POST without target returns 422."""
        resp = await client.post(
            "/api/v1/jira/worklogs",
            json={"timeSpentSeconds": 3600},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_negative_seconds_returns_422(self, client: AsyncClient) -> None:
        """POST with negative timeSpentSeconds returns 422."""
        resp = await client.post(
            "/api/v1/jira/worklogs",
            json={"target": "TEMPO", "timeSpentSeconds": -1},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422


class TestGetSubmissionHistory:
    """GET /api/v1/jira/worklogs — submission history."""

    @pytest.mark.asyncio
    async def test_returns_history(self, client: AsyncClient) -> None:
        """GET returns paginated submission history."""
        resp = await client.get(
            "/api/v1/jira/worklogs",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body
        assert body["total"] == 1
        assert body["items"][0]["work_date"] == "2026-07-11"

    @pytest.mark.asyncio
    async def test_filters_by_date(self, client: AsyncClient) -> None:
        """GET with startDate/endDate filters."""
        resp = await client.get(
            "/api/v1/jira/worklogs",
            params={"startDate": "2026-07-01", "endDate": "2026-07-31"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1


class TestGetHoursByDate:
    """GET /api/v1/jira/worklogs/hours-by-date — daily hours aggregation."""

    @pytest.mark.asyncio
    async def test_returns_hours(self, client: AsyncClient) -> None:
        """GET /hours-by-date returns daily hours."""
        resp = await client.get(
            "/api/v1/jira/worklogs/hours-by-date",
            params={"start": "2026-07-01", "end": "2026-07-31"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body
        assert len(body["items"]) == 1
        assert body["items"][0]["total_seconds"] == 3600

    @pytest.mark.asyncio
    async def test_missing_params_returns_422(self, client: AsyncClient) -> None:
        """GET /hours-by-date without start/end returns 422."""
        resp = await client.get(
            "/api/v1/jira/worklogs/hours-by-date",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422


class TestUpdateHoursForDate:
    """PATCH /api/v1/jira/worklogs/hours-by-date/{date} — update hours."""

    @pytest.mark.asyncio
    async def test_updates_hours(self, client: AsyncClient) -> None:
        """PATCH updates daily hours and returns the record."""
        resp = await client.patch(
            "/api/v1/jira/worklogs/hours-by-date/2026-07-11",
            json={"totalSeconds": 28800},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["work_date"] == "2026-07-11"
        assert body["total_seconds"] == 28800

    @pytest.mark.asyncio
    async def test_negative_seconds_returns_422(self, client: AsyncClient) -> None:
        """PATCH with negative totalSeconds returns 422."""
        resp = await client.patch(
            "/api/v1/jira/worklogs/hours-by-date/2026-07-11",
            json={"totalSeconds": -1},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════════
# Issue Routes
# ═══════════════════════════════════════════════════════════════════════════════


class TestSearchIssues:
    """GET /api/v1/jira/issues — search with JQL."""

    @pytest.mark.asyncio
    async def test_returns_issue_list(
        self, client: AsyncClient, mock_jira_client: MagicMock
    ) -> None:
        """GET with jql returns issue list."""
        mock_jira_client.get.return_value = {
            "issues": [
                {"id": "10001", "key": "VIS-1", "fields": {"summary": "Test issue"}},
                {"id": "10002", "key": "VIS-2", "fields": {"summary": "Another issue"}},
            ]
        }

        resp = await client.get(
            "/api/v1/jira/issues",
            params={"jql": "project=VIS", "maxResults": 50},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body
        assert body["count"] == 2
        assert body["items"][0]["key"] == "VIS-1"

        # Verify correct Jira API was called
        mock_jira_client.get.assert_called_once()
        args, _ = mock_jira_client.get.call_args
        assert "/rest/api/2/search" in str(args[0])

    @pytest.mark.asyncio
    async def test_missing_jql_returns_422(self, client: AsyncClient) -> None:
        """GET /issues without jql returns 422."""
        resp = await client.get(
            "/api/v1/jira/issues",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_handles_api_error(
        self, client: AsyncClient, mock_jira_client: MagicMock
    ) -> None:
        """GET /issues with API error returns 502."""
        mock_jira_client.get.side_effect = Exception("Connection refused")

        resp = await client.get(
            "/api/v1/jira/issues",
            params={"jql": "project=VIS"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 502


class TestGetIssueByKey:
    """GET /api/v1/jira/issues/{issue_key} — single issue."""

    @pytest.mark.asyncio
    async def test_returns_issue(
        self, client: AsyncClient, mock_jira_client: MagicMock
    ) -> None:
        """GET /issues/VIS-1 returns issue details."""
        mock_jira_client.get.return_value = {
            "id": "10001",
            "key": "VIS-1",
            "fields": {"summary": "Test issue", "status": {"name": "In Progress"}},
        }

        resp = await client.get(
            "/api/v1/jira/issues/VIS-1",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["key"] == "VIS-1"
        assert body["fields"]["summary"] == "Test issue"

        mock_jira_client.get.assert_called_once_with("/rest/api/2/issue/VIS-1")

    @pytest.mark.asyncio
    async def test_not_found_returns_404(
        self, client: AsyncClient, mock_jira_client: MagicMock
    ) -> None:
        """GET /issues/UNKNOWN with 'not found' error returns 404."""
        mock_jira_client.get.side_effect = Exception("Issue does not exist or not found")

        resp = await client.get(
            "/api/v1/jira/issues/UNKNOWN-1",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_api_error_returns_502(
        self, client: AsyncClient, mock_jira_client: MagicMock
    ) -> None:
        """GET /issues/VIS-1 with API error returns 502."""
        mock_jira_client.get.side_effect = Exception("Rate limit exceeded")

        resp = await client.get(
            "/api/v1/jira/issues/VIS-1",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 502


class TestGetTransitions:
    """GET /api/v1/jira/issues/{issue_key}/transitions."""

    @pytest.mark.asyncio
    async def test_returns_transitions(
        self, client: AsyncClient, mock_jira_client: MagicMock
    ) -> None:
        """GET /issues/VIS-1/transitions returns transition list."""
        mock_jira_client.get.return_value = {
            "transitions": [
                {"id": "21", "name": "In Progress", "to": {"name": "In Progress"}},
                {"id": "31", "name": "Done", "to": {"name": "Done"}},
            ]
        }

        resp = await client.get(
            "/api/v1/jira/issues/VIS-1/transitions",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "transitions" in body
        assert len(body["transitions"]) == 2
        assert body["transitions"][0]["id"] == "21"

        mock_jira_client.get.assert_called_once_with(
            "/rest/api/2/issue/VIS-1/transitions"
        )

    @pytest.mark.asyncio
    async def test_api_error_returns_502(
        self, client: AsyncClient, mock_jira_client: MagicMock
    ) -> None:
        """GET /issues/VIS-1/transitions with API error returns 502."""
        mock_jira_client.get.side_effect = Exception("Jira unavailable")

        resp = await client.get(
            "/api/v1/jira/issues/VIS-1/transitions",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 502


class TestTransitionIssue:
    """POST /api/v1/jira/issues/{issue_key}/transitions."""

    @pytest.mark.asyncio
    async def test_executes_transition(
        self, client: AsyncClient, mock_jira_client: MagicMock
    ) -> None:
        """POST /issues/VIS-1/transitions executes and returns success."""
        mock_jira_client.post.return_value = {}

        resp = await client.post(
            "/api/v1/jira/issues/VIS-1/transitions",
            json={"transitionId": "21"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

        mock_jira_client.post.assert_called_once_with(
            "/rest/api/2/issue/VIS-1/transitions",
            json_data={"transition": {"id": "21"}},
        )

    @pytest.mark.asyncio
    async def test_missing_transition_id_returns_422(
        self, client: AsyncClient
    ) -> None:
        """POST without transitionId returns 422."""
        resp = await client.post(
            "/api/v1/jira/issues/VIS-1/transitions",
            json={},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_api_error_returns_502(
        self, client: AsyncClient, mock_jira_client: MagicMock
    ) -> None:
        """POST /issues/VIS-1/transitions with API error returns 502."""
        mock_jira_client.post.side_effect = Exception("Transition not allowed")

        resp = await client.post(
            "/api/v1/jira/issues/VIS-1/transitions",
            json={"transitionId": "99"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 502
