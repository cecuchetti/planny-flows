"""Tests for middleware — request ID, error handler, rate limiter."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from planny_api.dependencies import get_db
from planny_api.main import create_app
from planny_api.middleware.rate_limiter import InMemoryRateLimiter


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
def override_get_db(app: FastAPI) -> None:
    """Override the ``get_db`` dependency with a mock session."""
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock()

    async def _override() -> AsyncMock:
        yield mock_db

    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.clear()


class TestRequestIDMiddleware:
    """Tests for the ``x-request-id`` middleware."""

    @pytest.mark.asyncio
    async def test_response_has_x_request_id_header(
        self,
        client: AsyncClient,
        override_get_db: None,
    ) -> None:
        """Verify every response includes ``x-request-id``."""
        response = await client.get("/health/live")
        assert "x-request-id" in response.headers
        request_id = response.headers["x-request-id"]
        assert request_id.startswith("req_")
        assert len(request_id) == 20  # "req_" (4) + 16 hex chars

    @pytest.mark.asyncio
    async def test_preserves_incoming_x_request_id(
        self,
        client: AsyncClient,
        override_get_db: None,
    ) -> None:
        """Verify an incoming ``x-request-id`` is preserved."""
        custom_id = "custom-req-id"
        response = await client.get(
            "/health/live",
            headers={"x-request-id": custom_id},
        )
        assert response.headers["x-request-id"] == custom_id


class TestErrorHandler:
    """Tests for the error handler middleware."""

    @pytest.mark.asyncio
    async def test_route_not_found_returns_json(
        self,
        client: AsyncClient,
    ) -> None:
        """Verify 404 routes return structured JSON error."""
        response = await client.get("/nonexistent")
        assert response.status_code == 404

        body = response.json()
        assert "error" in body
        assert "requestId" in body
        assert body["error"]["code"] == "ROUTE_NOT_FOUND"
        assert body["error"]["status"] == 404

    @pytest.mark.asyncio
    async def test_error_response_has_x_request_id(
        self,
        client: AsyncClient,
    ) -> None:
        """Verify error responses include ``x-request-id`` header."""
        response = await client.get("/nonexistent")
        assert "x-request-id" in response.headers


class TestInMemoryRateLimiter:
    """Unit tests for ``InMemoryRateLimiter``."""

    def test_initial_request_allowed(self) -> None:
        """Verify the first request from an IP is allowed."""
        limiter = InMemoryRateLimiter(window_ms=60_000, max_requests=10)
        allowed, remaining, reset_seconds = limiter.is_allowed("127.0.0.1")
        assert allowed is True
        assert remaining == 9
        assert reset_seconds == 60

    def test_blocks_after_limit(self) -> None:
        """Verify the 11th request from an IP is blocked."""
        limiter = InMemoryRateLimiter(window_ms=60_000, max_requests=10)
        ip = "192.168.1.1"

        # Make 10 allowed requests
        for _ in range(10):
            allowed, _, _ = limiter.is_allowed(ip)
            assert allowed is True

        # 11th should be blocked
        allowed, remaining, _ = limiter.is_allowed(ip)
        assert allowed is False
        assert remaining == 0

    def test_window_resets(self) -> None:
        """Verify the window resets after ``window_ms`` elapses."""
        limiter = InMemoryRateLimiter(window_ms=1, max_requests=1)
        ip = "10.0.0.1"

        # Use the only allowed request
        allowed, remaining, _ = limiter.is_allowed(ip)
        assert allowed is True
        assert remaining == 0

        # Next request should be blocked (window still open)
        allowed, _, _ = limiter.is_allowed(ip)
        assert allowed is False

        # Sleep for 10ms — window (1ms) has expired
        import time
        time.sleep(0.01)

        allowed, remaining, _ = limiter.is_allowed(ip)
        assert allowed is True
        assert remaining == 0
