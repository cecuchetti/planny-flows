"""Tests for Quick Actions — Outlook clean + Tempo hours + rate limiter.

Uses an in-memory SQLite database and mocks external HTTP calls.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.auth import create_token
from planny_core.database import Base
from planny_core.models import User
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.dependencies import get_current_user, get_db
from planny_api.main import create_app
from planny_api.middleware.rate_limiter import create_rate_limiter_dependency
from planny_api.routers.quick_actions import (
    outlook_clean_service,
    tempo_rate_limiter,
)

# ── Shared fixtures ──────────────────────────────────────────────────────────


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
async def db_session(db_engine) -> AsyncSession:
    """Provide a separate session for direct DB assertions."""
    factory = async_sessionmaker(
        bind=db_engine,
        expire_on_commit=False,
    )
    async with factory() as session:
        yield session


@pytest.fixture
async def client(app: FastAPI, db_engine) -> AsyncClient:
    """Test client with DB override, mock auth, and rate limiter bypass.

    The rate limiter dependency is swapped for a no-op so normal tests
    never accidentally exhaust the shared rate-limit window.
    """
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
    _mock_user = User(
        id=42,
        name="Test User",
        email="test@example.com",
        avatarUrl="https://example.com/avatar.jpg",
        projectId=1,
        createdAt=datetime.now(UTC),
        updatedAt=datetime.now(UTC),
    )

    async def _override_user():
        return _mock_user

    app.dependency_overrides[get_current_user] = _override_user

    # ── Bypass rate limiter for non-rate-limiter tests ────────────────────
    app.dependency_overrides[tempo_rate_limiter] = lambda: None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ═══════════════════════════════════════════════════════════════════════════════
# Rate Limiter (runs first — before the shared rate-limiter state is dirtied)
# ═══════════════════════════════════════════════════════════════════════════════

# NOTE: These tests create their own client WITHOUT a rate-limiter override so
# they exercise the real module-level ``tempo_rate_limiter``.  Because they
# are defined first they always run on a clean limiter state.


class TestTempoRateLimiter:
    """Verify the in-memory rate limiter on Tempo routes (10 req/min)."""

    @pytest.mark.asyncio
    async def test_blocks_11th_request(self, app: FastAPI, db_engine) -> None:
        """10 requests succeed, the 11th returns 429 with Retry-After."""
        # Set up overrides (DB + auth) but leave rate limiter active
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

        mock_user = User(
            id=42,
            name="Test User",
            email="test@example.com",
            avatarUrl="https://example.com/avatar.jpg",
            projectId=1,
            createdAt=datetime.now(UTC),
            updatedAt=datetime.now(UTC),
        )

        async def _override_user():
            return mock_user

        app.dependency_overrides[get_current_user] = _override_user
        # Do NOT override tempo_rate_limiter — let the real one run

        token = create_token(42)
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as ac:
            # 10 requests — all should succeed
            for i in range(10):
                resp = await ac.get(
                    "/quick-actions/actions/tempo-export/hours",
                    params={"date": "2026-07-11"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                assert resp.status_code == 200, f"Request {i + 1} failed: {resp.text}"

            # 11th — blocked
            resp = await ac.get(
                "/quick-actions/actions/tempo-export/hours",
                params={"date": "2026-07-11"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 429

        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_rate_limit_headers_present(self, app: FastAPI, db_engine) -> None:
        """The 429 response includes standard rate-limit headers."""
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

        mock_user = User(
            id=42,
            name="Test User",
            email="test@example.com",
            avatarUrl="https://example.com/avatar.jpg",
            projectId=1,
            createdAt=datetime.now(UTC),
            updatedAt=datetime.now(UTC),
        )

        async def _override_user():
            return mock_user

        app.dependency_overrides[get_current_user] = _override_user
        # Use a fresh rate limiter for this test (avoid state from previous test)
        fresh_tempo_limiter = create_rate_limiter_dependency(
            window_ms=60000, max_requests=2
        )
        app.dependency_overrides[tempo_rate_limiter] = fresh_tempo_limiter

        token = create_token(42)
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as ac:
            # Use 2 allowed requests
            resp1 = await ac.get(
                "/quick-actions/actions/tempo-export/hours",
                params={"date": "2026-07-11"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp1.status_code == 200

            resp2 = await ac.get(
                "/quick-actions/actions/tempo-export/hours",
                params={"date": "2026-07-11"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp2.status_code == 200

            # 3rd request — blocked
            resp3 = await ac.get(
                "/quick-actions/actions/tempo-export/hours",
                params={"date": "2026-07-11"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp3.status_code == 429
            assert "x-ratelimit-limit" in resp3.headers
            assert "x-ratelimit-remaining" in resp3.headers
            assert "x-ratelimit-reset" in resp3.headers
            assert "retry-after" in resp3.headers
            assert resp3.headers["x-ratelimit-limit"] == "2"
            assert resp3.headers["x-ratelimit-remaining"] == "0"

        app.dependency_overrides.clear()


# ═══════════════════════════════════════════════════════════════════════════════
# Outlook Clean
# ═══════════════════════════════════════════════════════════════════════════════


class TestOutlookClean:
    """Tests for GET/POST /quick-actions/actions/outlook-clean.

    Resets the shared ``outlook_clean_service`` state before each test.
    """

    @pytest.fixture(autouse=True)
    def _reset_outlook_state(self) -> None:
        """Reset the singleton state machine before each test."""
        outlook_clean_service._status = "idle"
        outlook_clean_service._last_run = None

    @pytest.mark.asyncio
    async def test_status_returns_idle_initially(self, client: AsyncClient) -> None:
        """Status is ``idle`` before any trigger."""
        resp = await client.get(
            "/quick-actions/actions/outlook-clean/status",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "idle"

    @pytest.mark.asyncio
    async def test_trigger_returns_running(self, client: AsyncClient) -> None:
        """POST triggers the clean and returns ``running`` status."""
        resp = await client.post(
            "/quick-actions/actions/outlook-clean",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "running"

    @pytest.mark.asyncio
    async def test_status_after_trigger_is_running(self, client: AsyncClient) -> None:
        """Immediately after trigger, status is ``running``."""
        resp = await client.post(
            "/quick-actions/actions/outlook-clean",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200

        resp2 = await client.get(
            "/quick-actions/actions/outlook-clean/status",
            headers={"Authorization": "Bearer test"},
        )
        assert resp2.json()["status"] == "running"

    @pytest.mark.asyncio
    async def test_trigger_already_running_returns_409(
        self, client: AsyncClient
    ) -> None:
        """Triggering while already running returns 409 Conflict."""
        # Simulate already running
        outlook_clean_service._status = "running"

        resp = await client.post(
            "/quick-actions/actions/outlook-clean",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_background_job_sets_success(
        self, client: AsyncClient
    ) -> None:
        """When the HTTP call succeeds, status transitions to ``success``."""
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_instance = AsyncMock()
            mock_response = MagicMock()
            mock_response.is_success = True
            mock_response.status_code = 200
            mock_instance.__aenter__.return_value = mock_instance
            mock_instance.post.return_value = mock_response
            mock_client_cls.return_value = mock_instance

            resp = await client.post(
                "/quick-actions/actions/outlook-clean",
                headers={"Authorization": "Bearer test"},
            )
            assert resp.status_code == 200

            # Let background task finish
            import asyncio
            await asyncio.sleep(0.05)

            status_resp = await client.get(
                "/quick-actions/actions/outlook-clean/status",
                headers={"Authorization": "Bearer test"},
            )
            body = status_resp.json()
            assert body["status"] == "success"
            assert "lastRun" in body
            assert body["lastRun"]["status"] == "success"

    @pytest.mark.asyncio
    async def test_background_job_sets_failed_on_http_error(
        self, client: AsyncClient
    ) -> None:
        """When the HTTP call fails, status transitions to ``failed``."""
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_instance = AsyncMock()
            mock_response = MagicMock()
            mock_response.is_success = False
            mock_response.status_code = 500
            mock_response.json.return_value = {"message": "Internal error"}
            mock_instance.__aenter__.return_value = mock_instance
            mock_instance.post.return_value = mock_response
            mock_client_cls.return_value = mock_instance

            resp = await client.post(
                "/quick-actions/actions/outlook-clean",
                headers={"Authorization": "Bearer test"},
            )
            assert resp.status_code == 200

            import asyncio
            await asyncio.sleep(0.05)

            status_resp = await client.get(
                "/quick-actions/actions/outlook-clean/status",
                headers={"Authorization": "Bearer test"},
            )
            body = status_resp.json()
            assert body["status"] == "failed"
            assert "lastRun" in body
            assert body["lastRun"]["status"] == "failed"

    @pytest.mark.asyncio
    async def test_background_job_sets_failed_on_exception(
        self, client: AsyncClient
    ) -> None:
        """When the HTTP call raises, status transitions to ``failed``."""
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_instance = AsyncMock()
            mock_instance.__aenter__.return_value = mock_instance
            mock_instance.post.side_effect = ConnectionError("Network unreachable")
            mock_client_cls.return_value = mock_instance

            resp = await client.post(
                "/quick-actions/actions/outlook-clean",
                headers={"Authorization": "Bearer test"},
            )
            assert resp.status_code == 200

            import asyncio
            await asyncio.sleep(0.05)

            status_resp = await client.get(
                "/quick-actions/actions/outlook-clean/status",
                headers={"Authorization": "Bearer test"},
            )
            body = status_resp.json()
            assert body["status"] == "failed"


# ═══════════════════════════════════════════════════════════════════════════════
# Tempo Hours
# ═══════════════════════════════════════════════════════════════════════════════


class TestTempoHours:
    """Tests for GET /quick-actions/actions/tempo-export/hours."""

    @pytest.mark.asyncio
    async def test_get_hours_returns_data(self, client: AsyncClient) -> None:
        """GET /tempo-export/hours?date=... returns hours data."""
        resp = await client.get(
            "/quick-actions/actions/tempo-export/hours",
            params={"date": "2026-07-11"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "hoursLogged" in body
        assert "source" in body
        assert "isComplete" in body
        assert body["source"] == "tempo"
        assert body["hoursLogged"] == 0

    @pytest.mark.asyncio
    async def test_get_hours_missing_date_returns_422(
        self, client: AsyncClient
    ) -> None:
        """Missing ``date`` query param returns 422."""
        resp = await client.get(
            "/quick-actions/actions/tempo-export/hours",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422


class TestTempoWeek:
    """Tests for GET /quick-actions/actions/tempo-export/week."""

    @pytest.mark.asyncio
    async def test_get_week_returns_7_days(self, client: AsyncClient) -> None:
        """GET /tempo-export/week returns an array of 7 days."""
        resp = await client.get(
            "/quick-actions/actions/tempo-export/week",
            params={"startDate": "2026-07-06"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "days" in body
        assert isinstance(body["days"], list)
        assert len(body["days"]) == 7

        # Verify each day has expected structure
        for day in body["days"]:
            assert "date" in day
            assert "hoursLogged" in day
            assert day["hoursLogged"] == 0

    @pytest.mark.asyncio
    async def test_get_week_missing_start_date_returns_422(
        self, client: AsyncClient
    ) -> None:
        """Missing ``startDate`` query param returns 422."""
        resp = await client.get(
            "/quick-actions/actions/tempo-export/week",
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422


class TestUpdateTempoHours:
    """Tests for PUT /quick-actions/actions/tempo-export/hours."""

    @pytest.mark.asyncio
    async def test_update_hours_returns_updated(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """PUT /tempo-export/hours updates and returns the record."""
        resp = await client.put(
            "/quick-actions/actions/tempo-export/hours",
            json={"date": "2026-07-11", "hours": 6.5},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()

        assert body["date"] == "2026-07-11"
        assert body["hours"] == 6.5
        assert body["source"] == "manual"
        assert body["isComplete"] is False  # 6.5 < 8

        # Verify in DB
        from planny_core.models import DailyHours
        from sqlalchemy import select

        result = await db_session.execute(
            select(DailyHours).where(DailyHours.work_date == "2026-07-11")
        )
        record = result.scalars().first()
        assert record is not None
        assert record.hours_logged == 6.5
        assert record.source == "manual"

    @pytest.mark.asyncio
    async def test_update_hours_overwrites_existing(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """PUT on an existing date overwrites the record."""
        # Create initial record
        resp1 = await client.put(
            "/quick-actions/actions/tempo-export/hours",
            json={"date": "2026-07-10", "hours": 4.0},
            headers={"Authorization": "Bearer test"},
        )
        assert resp1.status_code == 200

        # Overwrite
        resp2 = await client.put(
            "/quick-actions/actions/tempo-export/hours",
            json={"date": "2026-07-10", "hours": 8.0},
            headers={"Authorization": "Bearer test"},
        )
        assert resp2.status_code == 200
        body = resp2.json()
        assert body["hours"] == 8.0
        assert body["isComplete"] is True  # 8 >= 8

        # Only one record in DB
        from planny_core.models import DailyHours
        from sqlalchemy import select

        result = await db_session.execute(
            select(DailyHours).where(DailyHours.work_date == "2026-07-10")
        )
        records = result.scalars().all()
        assert len(records) == 1
        assert records[0].hours_logged == 8.0

    @pytest.mark.asyncio
    async def test_update_hours_invalid_date_returns_422(
        self, client: AsyncClient
    ) -> None:
        """PUT with invalid date format returns 422."""
        resp = await client.put(
            "/quick-actions/actions/tempo-export/hours",
            json={"date": "not-a-date", "hours": 5.0},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_update_hours_negative_hours_returns_422(
        self, client: AsyncClient
    ) -> None:
        """PUT with negative hours returns 422."""
        resp = await client.put(
            "/quick-actions/actions/tempo-export/hours",
            json={"date": "2026-07-11", "hours": -1},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_update_hours_missing_fields_returns_422(
        self, client: AsyncClient
    ) -> None:
        """PUT without required fields returns 422."""
        resp = await client.put(
            "/quick-actions/actions/tempo-export/hours",
            json={},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════════
# Tempo Export
# ═══════════════════════════════════════════════════════════════════════════════


class TestTempoExport:
    """Tests for POST /quick-actions/actions/tempo-export."""

    @pytest.mark.asyncio
    async def test_export_returns_success(self, client: AsyncClient) -> None:
        """POST /tempo-export returns stub success response."""
        resp = await client.post(
            "/quick-actions/actions/tempo-export",
            json={
                "date": "2026-07-11",
                "hours": 7.5,
                "description": "Worked on VIS-2",
            },
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert "message" in body

    @pytest.mark.asyncio
    async def test_export_without_description(
        self, client: AsyncClient
    ) -> None:
        """POST /tempo-export works without description."""
        resp = await client.post(
            "/quick-actions/actions/tempo-export",
            json={"date": "2026-07-11", "hours": 5.0},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    @pytest.mark.asyncio
    async def test_export_invalid_date_returns_422(
        self, client: AsyncClient
    ) -> None:
        """POST /tempo-export with invalid date returns 422."""
        resp = await client.post(
            "/quick-actions/actions/tempo-export",
            json={"date": "bad-date", "hours": 5.0},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_export_missing_fields_returns_422(
        self, client: AsyncClient
    ) -> None:
        """POST /tempo-export with missing fields returns 422."""
        resp = await client.post(
            "/quick-actions/actions/tempo-export",
            json={"date": "2026-07-11"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 422
