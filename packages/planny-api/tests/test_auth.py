"""Tests for the auth router — guest account creation, root redirect, JWT.

These tests use an in-memory SQLite database so they are fully
self-contained and do not depend on an external database server.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.security import HTTPAuthorizationCredentials
from httpx import ASGITransport, AsyncClient
from jose import jwt as jose_jwt
from planny_core.auth import create_token, verify_token
from planny_core.config import settings
from planny_core.database import Base
from planny_core.errors import InvalidTokenError
from planny_core.models import Comment, Issue, Project, User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.dependencies import get_current_user, get_db
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


# ── Helper ───────────────────────────────────────────────────────────────────


def _make_expired_token() -> str:
    """Create a JWT that expired 1 hour ago."""
    now = datetime.now(UTC)
    payload = {
        "sub": "999",
        "iat": int((now - timedelta(days=181)).timestamp()),
        "exp": int((now - timedelta(hours=1)).timestamp()),
    }
    return jose_jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


# ── Tests: POST /authentication/guest ────────────────────────────────────────


class TestGuestAuthEndpoint:
    """Functional tests for the guest account endpoint."""

    @pytest.mark.asyncio
    async def test_first_call_returns_auth_token(self, client: AsyncClient) -> None:
        """The first call should create a guest account and return a token."""
        response = await client.post("/authentication/guest")
        assert response.status_code == 200

        body = response.json()
        assert "authToken" in body
        assert isinstance(body["authToken"], str)
        assert len(body["authToken"]) > 20

        # The token should be verifiable
        payload = verify_token(body["authToken"])
        assert "sub" in payload
        assert "iat" in payload
        assert "exp" in payload

    @pytest.mark.asyncio
    async def test_second_call_reuses_same_user(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Subsequent calls should re-use the existing guest account.

        Note: The TypeScript ``createGuestAccount`` returns ``users[2]``
        (Lord Gaben) on the first call (the "new" guest) but returns
        ``users[0]`` (Pickle Rick) on subsequent calls (the first user
        matching the email suffix). This test verifies idempotency —
        no duplicate users or projects are created.
        """
        # First call
        resp1 = await client.post("/authentication/guest")
        assert resp1.status_code == 200
        token1 = resp1.json()["authToken"]

        # Second call — different sub is expected (TypeScript behaviour)
        resp2 = await client.post("/authentication/guest")
        assert resp2.status_code == 200
        token2 = resp2.json()["authToken"]

        # Different tokens (different iat/exp + potentially different user)
        assert token1 != token2

        # Both tokens should be valid
        payload1 = verify_token(token1)
        payload2 = verify_token(token2)
        assert "sub" in payload1
        assert "sub" in payload2
        assert isinstance(int(payload1["sub"]), int)
        assert isinstance(int(payload2["sub"]), int)

        # Only 3 users should exist (the seeded ones, not duplicated)
        result = await db_session.execute(select(User).where(User.email.like("%@jira.guest")))
        users = result.scalars().all()
        assert len(users) == 3

        # Only 1 project should exist
        result = await db_session.execute(select(Project))
        projects = result.scalars().all()
        assert len(projects) == 1

    @pytest.mark.asyncio
    async def test_seeded_data_exists(self, client: AsyncClient, db_session: AsyncSession) -> None:
        """The guest project should have users, issues, and comments."""
        await client.post("/authentication/guest")

        # Project
        result = await db_session.execute(select(Project))
        projects = result.scalars().all()
        assert len(projects) == 1
        assert projects[0].name == "singularity 1.0"

        # Users
        result = await db_session.execute(select(User))
        users = result.scalars().all()
        assert len(users) == 3
        emails = [u.email for u in users]
        assert "rick@jira.guest" in emails
        assert "yoda@jira.guest" in emails
        assert "gaben@jira.guest" in emails

        # Issues
        result = await db_session.execute(select(Issue))
        issues = result.scalars().all()
        assert len(issues) == 8
        titles = [i.title for i in issues]
        assert "This is an issue of type: Task." in titles
        assert users[0].projectId == projects[0].id

        # Comments
        result = await db_session.execute(select(Comment))
        comments = result.scalars().all()
        assert len(comments) == 8
        # All comments should be by the last user (gaben@jira.guest)
        for c in comments:
            assert c.userId == users[2].id


# ── Tests: GET / ─────────────────────────────────────────────────────────────


class TestRootRedirect:
    """Tests for the root redirect."""

    @pytest.mark.asyncio
    async def test_redirects_to_client_url(self, client: AsyncClient) -> None:
        """GET / should return a 302 redirect to settings.client_url."""
        response = await client.get("/", follow_redirects=False)
        assert response.status_code == 302
        assert response.headers["location"] == settings.client_url


# ── Tests: JWT utilities ─────────────────────────────────────────────────────


class TestJWTTokens:
    """Unit tests for create_token and verify_token."""

    def test_create_token_returns_string(self) -> None:
        """create_token should produce a valid JWT string."""
        token = create_token(42)
        assert isinstance(token, str)
        assert len(token.split(".")) == 3  # header.payload.signature

    def test_verify_token_returns_correct_payload(self) -> None:
        """verify_token should decode a token with the correct sub claim."""
        user_id = 123
        token = create_token(user_id)
        payload = verify_token(token)

        assert payload["sub"] == str(user_id)
        assert isinstance(payload["iat"], int)
        assert isinstance(payload["exp"], int)

    def test_iat_and_exp_are_unix_timestamps(self) -> None:
        """iat and exp should be Unix timestamps (int)."""
        token = create_token(1)
        payload = verify_token(token)

        now = datetime.now(UTC)
        # iat should be recent (within last 30 seconds)
        assert abs(payload["iat"] - int(now.timestamp())) < 30
        # exp should be ~180 days in the future
        expected_exp = payload["iat"] + 180 * 24 * 3600
        assert abs(payload["exp"] - expected_exp) < 10  # within 10 seconds

    def test_verify_invalid_token_raises_error(self) -> None:
        """verify_token should raise InvalidTokenError for garbage."""
        with pytest.raises(InvalidTokenError):
            verify_token("this.is.not.a.valid.jwt")

    def test_verify_expired_token_raises_error(self) -> None:
        """verify_token should raise InvalidTokenError for expired tokens."""
        expired = _make_expired_token()
        with pytest.raises(InvalidTokenError):
            verify_token(expired)

    def test_verify_token_with_wrong_secret_fails(self) -> None:
        """A token signed with a different secret should fail."""
        token = jose_jwt.encode(
            {"sub": "1", "iat": 0, "exp": 9999999999},
            "wrong-secret",
            algorithm="HS256",
        )
        with pytest.raises(InvalidTokenError):
            verify_token(token)


# ── Tests: get_current_user dependency ───────────────────────────────────────


class TestGetCurrentUser:
    """Tests for the get_current_user FastAPI dependency."""

    @pytest.mark.asyncio
    async def test_invalid_token_returns_401(self, db_session: AsyncSession) -> None:
        """get_current_user should raise InvalidTokenError for bad tokens."""
        with pytest.raises(InvalidTokenError):
            await get_current_user(
                credentials=HTTPAuthorizationCredentials(
                    scheme="Bearer",
                    credentials="invalid-jwt-token",
                ),
                db=db_session,
            )

    @pytest.mark.asyncio
    async def test_expired_token_returns_401(self, db_session: AsyncSession) -> None:
        """get_current_user should raise InvalidTokenError for expired tokens."""
        expired_token = _make_expired_token()
        with pytest.raises(InvalidTokenError):
            await get_current_user(
                credentials=HTTPAuthorizationCredentials(
                    scheme="Bearer",
                    credentials=expired_token,
                ),
                db=db_session,
            )

    @pytest.mark.asyncio
    async def test_user_not_found_returns_401(self, db_session: AsyncSession) -> None:
        """get_current_user should raise InvalidTokenError when user is missing."""
        # Create a valid token for a user that doesn't exist in the DB
        token = create_token(99999)
        with pytest.raises(InvalidTokenError, match="User not found"):
            await get_current_user(
                credentials=HTTPAuthorizationCredentials(
                    scheme="Bearer",
                    credentials=token,
                ),
                db=db_session,
            )

    @pytest.mark.asyncio
    async def test_valid_token_returns_user(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """get_current_user should return the User for a valid token."""
        # Seed guest account first
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]
        payload = verify_token(token)
        expected_user_id = int(payload["sub"])

        # Load the expected user from DB
        expected_user = await db_session.get(User, expected_user_id)
        assert expected_user is not None

        # Call get_current_user with the valid token
        user = await get_current_user(
            credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
            db=db_session,
        )
        assert user.id == expected_user.id
        assert user.email == expected_user.email


# ── Tests: error response format ────────────────────────────────────────────


class TestAuthErrorResponses:
    """Verify error JSON format for auth failures."""

    @pytest.mark.asyncio
    async def test_missing_auth_header_returns_401(self, app: FastAPI, db_engine) -> None:
        """Calling a protected endpoint without auth should return 401.

        FastAPI 0.139.0+ ``HTTPBearer`` raises ``HTTPException(401)``
        when the ``Authorization`` header is missing.
        """
        from fastapi import Depends

        from planny_api.dependencies import get_current_user

        # Register a test-only protected route
        @app.get("/test/protected")
        async def _protected(current_user=Depends(get_current_user)) -> dict:
            return {"user_id": current_user.id}

        # Override DB
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
            response = await ac.get("/test/protected")
            assert response.status_code == 401
            body = response.json()
            # FastAPI returns {"detail": "Not authenticated"} for HTTPBearer
            assert "detail" in body
