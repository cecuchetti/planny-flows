"""Tests for the unified error envelope and log redaction.

Two contract problems are covered here:

* the rate limiter and the Outlook-clean conflict used ``HTTPException``, which
  FastAPI wraps as ``{"detail": {...}}`` — a different shape from the
  ``{"error": ..., "requestId": ...}`` envelope every other error uses;
* the request logger wrote the raw query string, so a future endpoint carrying a
  token in the query would leak it into the logs.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.errors import RateLimitExceededError
from planny_core.models import User

from planny_api.dependencies import get_current_user
from planny_api.main import create_app
from planny_api.middleware.request_logger import MAX_QUERY_LENGTH, redact_query


@pytest.fixture
def app() -> FastAPI:
    application = create_app()

    async def _user() -> User:
        return User(id=1, name="T", email="t@example.com", avatarUrl="", projectId=1)

    application.dependency_overrides[get_current_user] = _user
    return application


@pytest.fixture
async def client(app: FastAPI) -> Iterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestRedactQuery:
    """Sensitive query values never reach the logs."""

    def test_masks_sensitive_keys(self) -> None:
        rendered = redact_query([("token", "super-secret"), ("date", "2026-01-01")])
        assert "super-secret" not in rendered
        assert "token=***" in rendered
        assert "date=2026-01-01" in rendered

    @pytest.mark.parametrize(
        "key",
        ["token", "api_key", "apiKey", "password", "secret", "authorization", "access_token"],
    )
    def test_covers_common_sensitive_names(self, key: str) -> None:
        assert "hunter2" not in redact_query([(key, "hunter2")])

    def test_is_case_insensitive(self) -> None:
        assert "hunter2" not in redact_query([("TOKEN", "hunter2")])

    def test_preserves_order_and_benign_values(self) -> None:
        rendered = redact_query([("a", "1"), ("token", "x"), ("b", "2")])
        assert rendered == "a=1&token=***&b=2"

    def test_truncates_long_query_strings(self) -> None:
        rendered = redact_query([("q", "x" * 1000)])
        assert len(rendered) < MAX_QUERY_LENGTH + 20
        assert rendered.endswith("...(truncated)")

    def test_empty_query(self) -> None:
        assert redact_query([]) == ""


class TestUnifiedErrorEnvelope:
    """Throttling and conflict responses use the standard envelope."""

    async def test_rate_limit_uses_the_error_envelope(self) -> None:
        """Regression: this used to be ``{"detail": {"error": {...}}}``."""
        from fastapi import Depends

        from planny_api.middleware.rate_limiter import create_rate_limiter_dependency

        limiter = create_rate_limiter_dependency(window_ms=60_000, max_requests=1)
        app = create_app()

        @app.get("/limited", dependencies=[Depends(limiter)])
        async def _limited() -> dict[str, bool]:
            return {"ok": True}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            assert (await ac.get("/limited")).status_code == 200
            blocked = await ac.get("/limited")

        assert blocked.status_code == 429
        body = blocked.json()
        assert "detail" not in body
        assert body["error"]["code"] == "RATE_LIMIT_EXCEEDED"
        assert body["error"]["status"] == 429
        assert "requestId" in body

    async def test_rate_limit_keeps_its_headers(self) -> None:
        from fastapi import Depends

        from planny_api.middleware.rate_limiter import create_rate_limiter_dependency

        limiter = create_rate_limiter_dependency(window_ms=60_000, max_requests=1)
        app = create_app()

        @app.get("/limited", dependencies=[Depends(limiter)])
        async def _limited() -> dict[str, bool]:
            return {"ok": True}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            await ac.get("/limited")
            blocked = await ac.get("/limited")

        assert blocked.headers["x-ratelimit-limit"] == "1"
        assert blocked.headers["x-ratelimit-remaining"] == "0"
        assert "retry-after" in blocked.headers

    async def test_conflict_uses_the_error_envelope(
        self, client: AsyncClient, app: FastAPI
    ) -> None:
        """Regression: the 409 used to be an ``HTTPException``."""
        from planny_api.dependencies import get_outlook_clean_service
        from planny_api.modules.quick_actions.outlook import OutlookCleanService

        service = OutlookCleanService()
        service._status = "running"
        app.dependency_overrides[get_outlook_clean_service] = lambda: service

        response = await client.post("/quick-actions/actions/outlook-clean")

        assert response.status_code == 409
        body = response.json()
        assert "detail" not in body
        assert body["error"]["code"] == "ALREADY_RUNNING"


class TestRateLimitErrorShape:
    """The error object carries the headers the handler forwards."""

    def test_headers_are_exposed(self) -> None:
        error = RateLimitExceededError(limit=10, remaining=0, reset_seconds=42)
        assert error.status_code == 429
        assert error.headers["Retry-After"] == "42"
        assert error.headers["X-RateLimit-Limit"] == "10"
        assert error.data["retryAfter"] == 42

    def test_code_serializes_as_a_plain_string(self) -> None:
        """A StrEnum in the payload would serialize oddly if not coerced."""
        error = RateLimitExceededError(limit=1, remaining=0, reset_seconds=1)
        assert str(error.code) == "RATE_LIMIT_EXCEEDED"
        assert isinstance(str(error.code), str)
