"""Tests for the projects router and serializers.

- ``GET /project`` — returns project with issues and users
- ``PUT /project`` — updates fields and returns updated project
- ``Serializer`` tests — camelCase keys, correct types
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.auth import create_token
from planny_core.database import Base
from planny_core.models import Project, User
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.dependencies import get_current_user, get_db
from planny_api.main import create_app
from planny_api.serializers import issue_partial, project_to_dict, user_to_dict

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


# ── Tests: GET /project ──────────────────────────────────────────────────────


class TestGetProject:
    """Tests for GET /project."""

    @pytest.mark.asyncio
    async def test_returns_project_with_issues_and_users(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /project should return project with issues and users arrays."""
        # Seed guest data
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        response = await client.get(
            "/project",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

        body = response.json()
        assert "project" in body
        project = body["project"]

        # Project-level keys
        assert "id" in project
        assert "name" in project
        assert "url" in project
        assert "description" in project
        assert "category" in project
        assert "createdAt" in project
        assert "updatedAt" in project

        # Issues array
        assert "issues" in project
        assert isinstance(project["issues"], list)
        assert len(project["issues"]) == 8

        # Verify issue partial structure
        first_issue = project["issues"][0]
        issue_keys = {
            "id", "title", "type", "status", "priority",
            "listPosition", "description", "descriptionText",
            "estimate", "timeSpent", "timeRemaining",
            "reporterId", "projectId",
            "createdAt", "updatedAt", "userIds",
        }
        assert issue_keys.issubset(first_issue.keys()), (
            f"Missing keys: {issue_keys - set(first_issue.keys())}"
        )
        assert isinstance(first_issue["listPosition"], float | int)
        assert isinstance(first_issue["userIds"], list)
        if first_issue["userIds"]:
            assert isinstance(first_issue["userIds"][0], int)

        # Users array
        assert "users" in project
        assert isinstance(project["users"], list)
        assert len(project["users"]) == 3

        first_user = project["users"][0]
        user_keys = {
            "id", "name", "email", "avatarUrl",
            "projectId", "createdAt", "updatedAt",
        }
        assert user_keys.issubset(first_user.keys())

    @pytest.mark.asyncio
    async def test_project_not_found_returns_404(
        self, app: FastAPI, db_engine
    ) -> None:
        """GET /project when user's project doesn't exist should return 404."""
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

        # Inject a mock user with a project_id that doesn't exist
        mock_user = _make_mock_user(project_id=999)

        async def _override_user():
            return mock_user

        app.dependency_overrides[get_current_user] = _override_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            token = create_token(1)
            response = await ac.get(
                "/project",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert response.status_code == 404
            body = response.json()
            assert "error" in body
            assert body["error"]["code"] == "ENTITY_NOT_FOUND"
            assert body["error"]["status"] == 404

        app.dependency_overrides.clear()


# ── Tests: PUT /project ──────────────────────────────────────────────────────


class TestUpdateProject:
    """Tests for PUT /project."""

    @pytest.mark.asyncio
    async def test_updates_name_and_returns_project(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """PUT /project should update name and return updated project."""
        # Seed guest data
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        new_name = "Updated Project Name"
        response = await client.put(
            "/project",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": new_name},
        )
        assert response.status_code == 200

        body = response.json()
        assert "project" in body
        project = body["project"]
        assert project["name"] == new_name
        assert isinstance(project["id"], int)

        # Verify DB was updated
        from sqlalchemy import select

        result = await db_session.execute(
            select(Project).where(Project.id == project["id"])
        )
        db_project = result.scalars().first()
        assert db_project is not None
        assert db_project.name == new_name

    @pytest.mark.asyncio
    async def test_updates_multiple_fields(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """PUT /project should update multiple fields at once."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        updates = {
            "name": "New Name",
            "url": "https://example.com",
            "description": "Updated description",
        }
        response = await client.put(
            "/project",
            headers={"Authorization": f"Bearer {token}"},
            json=updates,
        )
        assert response.status_code == 200

        project = response.json()["project"]
        assert project["name"] == updates["name"]
        assert project["url"] == updates["url"]
        assert project["description"] == updates["description"]

    @pytest.mark.asyncio
    async def test_invalid_category_returns_422(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """PUT /project with invalid category should return 422."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        response = await client.put(
            "/project",
            headers={"Authorization": f"Bearer {token}"},
            json={"category": "invalid-category"},
        )
        # Pydantic validation failure returns 422
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_empty_body_succeeds(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """PUT /project with empty body should succeed (no-op)."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        response = await client.put(
            "/project",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        )
        assert response.status_code == 200
        project = response.json()["project"]
        assert project["name"] == "singularity 1.0"


# ── Tests: Serializers ───────────────────────────────────────────────────────


class TestSerializers:
    """Unit tests for the shared serializer functions."""

    def test_issue_partial_keys_are_camel_case(self) -> None:
        """issue_partial should return dict with camelCase keys."""
        # Minimal issue stub
        from planny_core.models.issue import Issue

        issue = Issue(
            title="Test",
            type="task",
            status="backlog",
            priority="3",
            listPosition=1.0,
            reporterId=1,
            projectId=1,
        )
        result = issue_partial(issue)

        # All expected keys present
        assert result["id"] == issue.id
        assert result["title"] == "Test"
        assert result["type"] == "task"
        assert result["status"] == "backlog"
        assert result["priority"] == "3"
        assert result["listPosition"] == 1.0
        assert result["reporterId"] == 1
        assert result["projectId"] == 1
        assert isinstance(result["listPosition"], float)
        assert isinstance(result["userIds"], list)

    def test_user_to_dict_keys_are_camel_case(self) -> None:
        """user_to_dict should return dict with camelCase keys."""
        user = User(
            name="Rick",
            email="rick@jira.guest",
            avatarUrl="https://example.com/avatar.jpg",
            projectId=1,
        )
        result = user_to_dict(user)

        assert result["id"] == user.id
        assert result["name"] == "Rick"
        assert result["email"] == "rick@jira.guest"
        assert result["avatarUrl"] == "https://example.com/avatar.jpg"
        assert result["projectId"] == 1
        # createdAt/updatedAt may be None if not set
        assert "createdAt" in result
        assert "updatedAt" in result

    def test_project_to_dict_keys_are_camel_case(self) -> None:
        """project_to_dict should return dict with camelCase keys."""
        project = Project(
            name="Test Project",
            url="https://example.com",
            description="A test project",
            category="software",
        )
        result = project_to_dict(project)

        assert result["id"] == project.id
        assert result["name"] == "Test Project"
        assert result["url"] == "https://example.com"
        assert result["description"] == "A test project"
        assert result["category"] == "software"
        assert "createdAt" in result
        assert "updatedAt" in result
        # Users should be an empty list when no users
        assert isinstance(result["users"], list)
        # Issues should be an empty list when no issues (with include_issues=True by default)
        assert isinstance(result["issues"], list)

    def test_project_to_dict_without_issues(self) -> None:
        """project_to_dict(include_issues=False) should omit issues key."""
        project = Project(
            name="No Issues",
            url="https://example.com",
            description="No issues",
            category="software",
        )
        result = project_to_dict(project, include_issues=False)
        assert "issues" not in result
        assert "users" in result
