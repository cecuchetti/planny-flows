"""Tests for the health check router."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from planny_api.dependencies import get_db
from planny_api.main import create_app
from planny_api.routers.health import _check_database


@pytest.fixture
def app() -> FastAPI:
    """Create a fresh app instance for each test."""
    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    """Provide an async test client for the app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_db() -> AsyncMock:
    """Return a mock async session that responds to ``execute``."""
    session = AsyncMock()
    session.execute = AsyncMock()
    return session


@pytest.fixture
def override_get_db(app: FastAPI, mock_db: AsyncMock) -> None:
    """Override the ``get_db`` dependency with a mock session."""
    async def _override() -> AsyncMock:
        yield mock_db

    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.clear()


class TestHealthEndpoint:
    """Tests for ``GET /health``."""

    @pytest.mark.asyncio
    async def test_health_returns_200_with_status_and_checks(
        self,
        client: AsyncClient,
        override_get_db: None,
    ) -> None:
        """Verify the full health endpoint returns expected structure."""
        response = await client.get("/health")
        assert response.status_code == 200

        body = response.json()
        assert "status" in body
        assert "timestamp" in body
        assert "checks" in body
        assert isinstance(body["checks"], list)
        # Should have database and jira checks
        check_names = [c["name"] for c in body["checks"]]
        assert "database" in check_names
        assert "jira_integrations" in check_names

    @pytest.mark.asyncio
    async def test_health_db_unavailable(
        self,
        client: AsyncClient,
        mock_db: AsyncMock,
    ) -> None:
        """Verify health reports database error gracefully."""
        mock_db.execute.side_effect = Exception("Connection refused")
        async def _override() -> AsyncMock:
            yield mock_db
        client._transport.app.dependency_overrides[get_db] = _override  # type: ignore[union-attr]

        response = await client.get("/health")
        assert response.status_code == 200

        body = response.json()
        assert body["status"] == "unhealthy"
        db_check = [c for c in body["checks"] if c["name"] == "database"][0]
        assert db_check["status"] == "error"


class TestReadinessEndpoint:
    """Tests for ``GET /health/ready``."""

    @pytest.mark.asyncio
    async def test_readiness_returns_200_when_db_ok(
        self,
        client: AsyncClient,
        override_get_db: None,
    ) -> None:
        """Verify readiness probe returns ready."""
        response = await client.get("/health/ready")
        assert response.status_code == 200

        body = response.json()
        assert body["status"] == "ready"
        assert "timestamp" in body


class TestLivenessEndpoint:
    """Tests for ``GET /health/live``."""

    @pytest.mark.asyncio
    async def test_liveness_returns_200(
        self,
        client: AsyncClient,
    ) -> None:
        """Verify liveness probe always returns OK."""
        response = await client.get("/health/live")
        assert response.status_code == 200

        body = response.json()
        assert body["status"] == "alive"
        assert "timestamp" in body


class TestCheckDatabase:
    """Unit tests for the ``_check_database`` helper."""

    @pytest.mark.asyncio
    async def test_returns_ok_on_success(self, mock_db: AsyncMock) -> None:
        """Verify ok result when DB responds."""
        result = await _check_database(mock_db)
        assert result["status"] == "ok"
        assert result["name"] == "database"

    @pytest.mark.asyncio
    async def test_returns_error_on_exception(self, mock_db: AsyncMock) -> None:
        """Verify error result when DB raises."""
        mock_db.execute.side_effect = Exception("timeout")
        result = await _check_database(mock_db)
        assert result["status"] == "error"
        assert "error" in result
