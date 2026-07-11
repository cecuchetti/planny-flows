"""Tests for the users router — ``GET /currentUser``.

Verifies authentication (valid JWT → 200, invalid JWT → 401,
no JWT → 401) and response structure.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.auth import create_token
from planny_core.database import Base
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.dependencies import get_db
from planny_api.main import create_app

# ── Fixtures ─────────────────────────────────────────────────────────────────


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
async def client(app: FastAPI, db_engine) -> AsyncClient:
    """Override the DB dependency with the in-memory engine."""
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

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
async def db_session(db_engine) -> AsyncSession:
    """Provide a separate session for direct DB assertions."""
    factory = async_sessionmaker(
        bind=db_engine,
        expire_on_commit=False,
    )
    async with factory() as session:
        yield session


# ── Tests: GET /currentUser ──────────────────────────────────────────────────


class TestGetCurrentUser:
    """Functional tests for GET /currentUser."""

    @pytest.mark.asyncio
    async def test_valid_token_returns_200_with_user(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /currentUser with valid JWT should return 200 and user object."""
        # Seed a user via the guest auth endpoint
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        # Call /currentUser with the valid token
        response = await client.get(
            "/currentUser",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

        body = response.json()
        assert "currentUser" in body
        user = body["currentUser"]

        # Verify all expected keys are present (camelCase)
        expected_keys = {
            "id",
            "name",
            "email",
            "avatarUrl",
            "projectId",
            "createdAt",
            "updatedAt",
        }
        assert expected_keys.issubset(user.keys()), (
            f"Missing keys in response: {expected_keys - set(user.keys())}"
        )

        # Verify types
        assert isinstance(user["id"], int)
        assert isinstance(user["name"], str)
        assert isinstance(user["email"], str)
        assert isinstance(user["avatarUrl"], str)
        assert isinstance(user["projectId"], int)
        assert isinstance(user["createdAt"], str)  # ISO 8601
        assert isinstance(user["updatedAt"], str)  # ISO 8601

    @pytest.mark.asyncio
    async def test_invalid_token_returns_401(
        self, client: AsyncClient
    ) -> None:
        """GET /currentUser with invalid JWT should return 401."""
        response = await client.get(
            "/currentUser",
            headers={"Authorization": "Bearer invalid-jwt-token"},
        )
        assert response.status_code == 401

        body = response.json()
        # Error format matching Node: { error: { message, code, status, data }, requestId }
        assert "error" in body
        assert body["error"]["code"] == "INVALID_TOKEN"
        assert body["error"]["status"] == 401

    @pytest.mark.asyncio
    async def test_no_auth_header_returns_401(
        self, client: AsyncClient
    ) -> None:
        """GET /currentUser without Authorization header should return 401."""
        response = await client.get("/currentUser")
        # FastAPI 0.139.0+ HTTPBearer raises 401 for missing auth header
        assert response.status_code == 401
        body = response.json()
        # FastAPI returns {"detail": "Not authenticated"} by default
        assert "detail" in body

    @pytest.mark.asyncio
    async def test_expired_token_returns_401(
        self, client: AsyncClient
    ) -> None:
        """GET /currentUser with expired JWT should return 401."""
        # Create an expired token
        from datetime import UTC, datetime, timedelta

        from jose import jwt as jose_jwt
        from planny_core.config import settings

        now = datetime.now(UTC)
        expired_token = jose_jwt.encode(
            {
                "sub": "999",
                "iat": int((now - timedelta(days=181)).timestamp()),
                "exp": int((now - timedelta(hours=1)).timestamp()),
            },
            settings.jwt_secret,
            algorithm="HS256",
        )

        response = await client.get(
            "/currentUser",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert response.status_code == 401
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "INVALID_TOKEN"
        assert body["error"]["status"] == 401

    @pytest.mark.asyncio
    async def test_user_not_found_returns_401(
        self, client: AsyncClient
    ) -> None:
        """GET /currentUser with token for non-existent user returns 401."""
        token = create_token(99999)  # User ID that doesn't exist

        response = await client.get(
            "/currentUser",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "INVALID_TOKEN"
