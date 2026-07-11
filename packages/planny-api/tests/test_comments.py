"""Tests for the comments CRUD router — project-scoped access and ownership.

- ``POST /comments`` — creates comment, validates project scoping
- ``PUT /comments/{id}`` — updates own comment body
- ``DELETE /comments/{id}`` — deletes own comment
- Ownership checks: only the comment author may edit/delete
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.database import Base
from planny_core.models import Comment, User
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


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_mock_user(project_id: int = 1, user_id: int = 1) -> User:
    """Create a mock User with the given IDs for dependency overrides."""
    return User(
        id=user_id,
        name="Test User",
        email="test@jira.guest",
        avatarUrl="https://example.com/avatar.jpg",
        projectId=project_id,
        createdAt=datetime.now(UTC),
        updatedAt=datetime.now(UTC),
    )


# ── Tests: POST /comments ────────────────────────────────────────────────────


class TestCreateComment:
    """Tests for POST /comments."""

    @pytest.mark.asyncio
    async def test_creates_comment_with_user_partial(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """POST /comments creates a comment and returns nested user."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        response = await client.post(
            "/comments",
            headers={"Authorization": f"Bearer {token}"},
            json={"body": "Test comment body", "issueId": 1},
        )
        assert response.status_code == 200

        body = response.json()
        assert "comment" in body
        comment = body["comment"]

        # CamelCase keys
        assert "id" in comment
        assert "body" in comment
        assert "userId" in comment
        assert "issueId" in comment
        assert "createdAt" in comment
        assert "updatedAt" in comment
        assert comment["body"] == "Test comment body"
        assert comment["issueId"] == 1
        assert isinstance(comment["id"], int)
        assert isinstance(comment["userId"], int)

        # Nested user object (user_to_dict format)
        assert "user" in comment
        user = comment["user"]
        assert user["id"] == comment["userId"]
        assert "name" in user
        assert "email" in user
        assert "avatarUrl" in user
        assert "projectId" in user
        assert "createdAt" in user
        assert "updatedAt" in user

        # Verify DB
        result = await db_session.execute(
            select(Comment).where(Comment.id == comment["id"]),
        )
        db_comment = result.scalars().first()
        assert db_comment is not None
        assert db_comment.body == "Test comment body"
        assert db_comment.userId == comment["userId"]

    @pytest.mark.asyncio
    async def test_post_from_other_project_returns_404(
        self,
        app: FastAPI,
        client: AsyncClient,
    ) -> None:
        """POST /comments on issue from another project returns 404."""
        # Seed guest data
        await client.post("/authentication/guest")

        # Override current user with a mock user in a different project
        mock_user = _make_mock_user(project_id=999)

        async def _override_user() -> User:
            return mock_user

        app.dependency_overrides[get_current_user] = _override_user

        response = await client.post(
            "/comments",
            json={"body": "Test body", "issueId": 1},
        )
        assert response.status_code == 404
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "ENTITY_NOT_FOUND"

        app.dependency_overrides.pop(get_current_user, None)

    @pytest.mark.asyncio
    async def test_empty_body_returns_422(
        self,
        client: AsyncClient,
    ) -> None:
        """POST /comments with empty body returns 422."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        response = await client.post(
            "/comments",
            headers={"Authorization": f"Bearer {token}"},
            json={"body": "", "issueId": 1},
        )
        assert response.status_code == 422


# ── Tests: PUT /comments/{comment_id} ────────────────────────────────────────


class TestUpdateComment:
    """Tests for PUT /comments/{comment_id}."""

    @pytest.mark.asyncio
    async def test_updates_comment_body(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """PUT /comments/:id updates body and returns updated comment."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        # Create a comment first
        create_resp = await client.post(
            "/comments",
            headers={"Authorization": f"Bearer {token}"},
            json={"body": "Original body", "issueId": 1},
        )
        comment_id = create_resp.json()["comment"]["id"]

        # Update it
        updated_body = "Updated body text"
        response = await client.put(
            f"/comments/{comment_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"body": updated_body},
        )
        assert response.status_code == 200

        body = response.json()
        assert "comment" in body
        comment = body["comment"]
        assert comment["body"] == updated_body
        assert comment["id"] == comment_id

        # Nested user still present
        assert "user" in comment
        assert comment["user"]["id"] == comment["userId"]

        # Verify DB
        result = await db_session.execute(
            select(Comment).where(Comment.id == comment_id),
        )
        db_comment = result.scalars().first()
        assert db_comment is not None
        assert db_comment.body == updated_body

    @pytest.mark.asyncio
    async def test_update_other_users_comment_returns_404(
        self,
        client: AsyncClient,
    ) -> None:
        """PUT /comments/:id on another user's comment returns 404.

        Seed comments are owned by Lord Gaben (user_id=3).  The second
        guest call returns Pickle Rick (user_id=1), who does not own
        any seed comments.
        """
        # First call creates seed data and returns gaben (user_id=3)
        await client.post("/authentication/guest")

        # Second call returns rick (user_id=1)
        resp2 = await client.post("/authentication/guest")
        token2 = resp2.json()["authToken"]

        # Seed comment ID 1 is owned by gaben (user_id=3)
        response = await client.put(
            "/comments/1",
            headers={"Authorization": f"Bearer {token2}"},
            json={"body": "Should not work"},
        )
        assert response.status_code == 404
        body = response.json()
        assert body["error"]["code"] == "ENTITY_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_update_nonexistent_comment_returns_404(
        self,
        client: AsyncClient,
    ) -> None:
        """PUT /comments/:id on a non-existent comment returns 404."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        response = await client.put(
            "/comments/99999",
            headers={"Authorization": f"Bearer {token}"},
            json={"body": "Should not work"},
        )
        assert response.status_code == 404
        body = response.json()
        assert body["error"]["code"] == "ENTITY_NOT_FOUND"


# ── Tests: DELETE /comments/{comment_id} ─────────────────────────────────────


class TestDeleteComment:
    """Tests for DELETE /comments/{comment_id}."""

    @pytest.mark.asyncio
    async def test_deletes_comment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        """DELETE /comments/:id deletes the comment and returns message."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        # Create a comment first
        create_resp = await client.post(
            "/comments",
            headers={"Authorization": f"Bearer {token}"},
            json={"body": "To delete", "issueId": 1},
        )
        comment_id = create_resp.json()["comment"]["id"]

        # Delete it
        response = await client.delete(
            f"/comments/{comment_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

        body = response.json()
        assert body["message"] == "Comment deleted"

        # Verify deletion in DB
        result = await db_session.execute(
            select(Comment).where(Comment.id == comment_id),
        )
        db_comment = result.scalars().first()
        assert db_comment is None

    @pytest.mark.asyncio
    async def test_delete_other_users_comment_returns_404(
        self,
        client: AsyncClient,
    ) -> None:
        """DELETE /comments/:id on another user's comment returns 404."""
        # First call seeds data — returns gaben (user_id=3)
        await client.post("/authentication/guest")

        # Second call returns rick (user_id=1)
        resp2 = await client.post("/authentication/guest")
        token2 = resp2.json()["authToken"]

        # Seed comment ID 1 is owned by gaben
        response = await client.delete(
            "/comments/1",
            headers={"Authorization": f"Bearer {token2}"},
        )
        assert response.status_code == 404
        body = response.json()
        assert body["error"]["code"] == "ENTITY_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_delete_nonexistent_comment_returns_404(
        self,
        client: AsyncClient,
    ) -> None:
        """DELETE /comments/:id on a non-existent comment returns 404."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        response = await client.delete(
            "/comments/99999",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404
        body = response.json()
        assert body["error"]["code"] == "ENTITY_NOT_FOUND"


# ── Tests: Response format ───────────────────────────────────────────────────


class TestCommentResponseFormat:
    """Verify the comment response JSON matches Node format."""

    @pytest.mark.asyncio
    async def test_response_keys_are_camel_case_with_nested_user(
        self,
        client: AsyncClient,
    ) -> None:
        """Comment responses must have camelCase keys and nested user."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        # Create comment
        create_resp = await client.post(
            "/comments",
            headers={"Authorization": f"Bearer {token}"},
            json={"body": "Format test", "issueId": 1},
        )
        assert create_resp.status_code == 200

        comment = create_resp.json()["comment"]
        expected_keys = {
            "id",
            "body",
            "userId",
            "issueId",
            "createdAt",
            "updatedAt",
            "user",
        }
        assert set(comment.keys()) == expected_keys, (
            f"Expected keys: {expected_keys}, got: {set(comment.keys())}"
        )

        # Nested user must have user_to_dict keys
        user = comment["user"]
        expected_user_keys = {
            "id",
            "name",
            "email",
            "avatarUrl",
            "projectId",
            "createdAt",
            "updatedAt",
        }
        assert set(user.keys()) == expected_user_keys, (
            f"Expected user keys: {expected_user_keys}, got: {set(user.keys())}"
        )
