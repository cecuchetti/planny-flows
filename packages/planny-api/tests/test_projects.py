"""Tests for the projects router and serializers.

- ``GET /project`` — returns project with issues and users
- ``PUT /project`` — updates fields and returns updated project
- ``Serializer`` tests — camelCase keys, correct types
- ``GET /projects`` — list all projects for current user (new)
- ``GET /project?ids=`` — multi-project load (new)
- ``PUT /project`` on Jira project → 400 (new)
- ``POST /projects/{id}/sync`` — manual sync (new)
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.auth import create_token, verify_token
from planny_core.database import Base
from planny_core.enums import ProjectSourceType
from planny_core.models import Project, User, user_projects
from sqlalchemy import select
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


# ── Tests: GET /projects ──────────────────────────────────────────────────────


class TestListProjects:
    """Tests for ``GET /projects`` — list projects for current user."""

    @pytest.mark.asyncio
    async def test_returns_user_projects(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /projects should return projects with the expected shape."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        response = await client.get(
            "/projects",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

        body = response.json()
        assert "projects" in body
        projects = body["projects"]
        assert len(projects) >= 1

        for p in projects:
            assert "id" in p
            assert "name" in p
            assert "source_type" in p
            assert p["source_type"] == "local"  # guest project is local
            assert "issue_count" in p
            assert isinstance(p["issue_count"], int)
            assert "external_key" in p
            # last_synced_at can be None for local projects
            assert "last_synced_at" in p

    @pytest.mark.asyncio
    async def test_empty_when_no_user_projects(
        self, app: FastAPI, db_engine
    ) -> None:
        """GET /projects should return empty list when user has no projects."""
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

        mock_user = _make_mock_user(project_id=999, user_id=42)

        async def _override_user():
            return mock_user

        app.dependency_overrides[get_current_user] = _override_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            token = create_token(42)
            response = await ac.get(
                "/projects",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert response.status_code == 200
            assert response.json()["projects"] == []

        app.dependency_overrides.clear()


# ── Tests: GET /project?ids= ──────────────────────────────────────────────────


class TestGetProjectMulti:
    """Tests for ``GET /project?ids=1,2,3`` — multi-project load."""

    @pytest.mark.asyncio
    async def test_get_multiple_projects_by_ids(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /project?ids=1,2 should return multiple projects with issues."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        # Get the seeded project ID
        result = await db_session.execute(select(Project))
        projects = result.scalars().all()
        assert len(projects) >= 1
        ids_param = ",".join(str(p.id) for p in projects)

        response = await client.get(
            f"/project?ids={ids_param}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

        body = response.json()
        assert "projects" in body
        assert len(body["projects"]) == len(projects)

        # Verify full project shape including issues
        proj = body["projects"][0]
        assert "issues" in proj
        assert isinstance(proj["issues"], list)
        assert "users" in proj
        assert isinstance(proj["users"], list)

    @pytest.mark.asyncio
    async def test_get_project_with_nonexistent_ids_returns_empty(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /project?ids=999 should fail closed."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        response = await client.get(
            "/project?ids=999",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "ENTITY_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_get_project_with_unauthorized_id_returns_404(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /project?ids=... should not leak projects owned by another user."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        unauthorized_project = Project(
            name="Private Project",
            source_type=ProjectSourceType.LOCAL.value,
            category="software",
        )
        db_session.add(unauthorized_project)
        await db_session.flush()
        unauthorized_project_id = unauthorized_project.id
        await db_session.commit()

        response = await client.get(
            f"/project?ids={unauthorized_project_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "ENTITY_NOT_FOUND"


# ── Tests: PUT /project with Jira guard ─────────────────────────────────────


class TestUpdateProjectJiraGuard:
    """Tests for ``PUT /project`` guard that rejects Jira project updates."""

    @pytest.mark.asyncio
    async def test_update_jira_project_returns_400(
        self, app: FastAPI, db_engine
    ) -> None:
        """PUT /project on a Jira project should return 400."""
        factory = async_sessionmaker(
            bind=db_engine,
            expire_on_commit=False,
        )

        # Create a Jira project in the DB
        async with factory() as session:
            jira_project = Project(
                name="Jira Proj",
                source_type=ProjectSourceType.JIRA.value,
                external_key="TEST-1",
                category="software",
            )
            session.add(jira_project)
            await session.flush()
            project_id = jira_project.id
            await session.commit()

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

        mock_user = _make_mock_user(project_id=project_id)

        async def _override_user():
            return mock_user

        app.dependency_overrides[get_current_user] = _override_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            token = create_token(1)
            response = await ac.put(
                "/project",
                headers={"Authorization": f"Bearer {token}"},
                json={"name": "Should Not Work"},
            )
            assert response.status_code == 400
            body = response.json()
            assert body["error"]["code"] == "BAD_USER_INPUT"

        app.dependency_overrides.clear()


# ── Tests: POST /projects/{id}/sync ─────────────────────────────────────────


class TestSyncProject:
    """Tests for ``POST /projects/{id}/sync`` — manual Jira sync."""

    @pytest.mark.asyncio
    async def test_sync_jira_project(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """POST /projects/{id}/sync should trigger sync and return project."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        # The guest auth returns user id=3 (Lord Gaben / users[2])
        # See _create_guest_account return users[2]
        from planny_core.auth import verify_token

        payload = verify_token(token)
        guest_user_id = int(payload["sub"])
        assert guest_user_id == 3  # Lord Gaben

        # Create a Jira project in the same DB
        jira_project = Project(
            name="Synced Jira Project",
            source_type=ProjectSourceType.JIRA.value,
            external_key="TEST-1",
            category="software",
        )
        db_session.add(jira_project)
        await db_session.flush()

        # Associate with correct guest user (id=3)
        stmt = user_projects.insert().values(
            userId=guest_user_id,
            projectId=jira_project.id,
        )
        await db_session.execute(stmt)
        await db_session.commit()

        mock_jira = MagicMock()
        mock_sync = AsyncMock(
            return_value={
                "projects_synced": 1,
                "issues_upserted": 0,
                "issues_closed": 0,
            }
        )

        with (
            patch(
                "planny_api.dependencies.get_jira_issue_client",
                return_value=mock_jira,
            ),
            patch(
                "planny_api.services.jira_sync_service.sync_external_projects",
                mock_sync,
            ),
        ):
            response = await client.post(
                f"/projects/{jira_project.id}/sync",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert response.status_code == 200

            body = response.json()
            assert body["synced"] is True
            assert body["project"]["id"] == jira_project.id
            assert body["project"]["sourceType"] == "jira"
            assert body["project"]["externalKey"] == "TEST-1"

        mock_sync.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_sync_local_project_returns_400(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """POST /projects/{id}/sync on local project should return 400."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        # Get the seeded (local) project
        result = await db_session.execute(select(Project))
        local_project = result.scalars().first()
        assert local_project is not None
        assert local_project.source_type == "local"

        response = await client.post(
            f"/projects/{local_project.id}/sync",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 400
        body = response.json()
        assert body["error"]["code"] == "BAD_USER_INPUT"

    @pytest.mark.asyncio
    async def test_sync_nonexistent_project_returns_404(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """POST /projects/999/sync on non-existent project should return 404."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        response = await client.post(
            "/projects/999/sync",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404
        body = response.json()
        assert body["error"]["code"] == "ENTITY_NOT_FOUND"


# ── Tests: Auto-sync on GET /projects ────────────────────────────────────────


class TestAutoSync:
    """Tests for auto-sync behaviour on ``GET /projects``."""

    @pytest.mark.asyncio
    async def test_auto_sync_triggers_for_stale_project(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /projects with stale Jira project should trigger background sync."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        # The guest auth returns user id=3 (Lord Gaben / users[2])
        payload = verify_token(token)
        guest_user_id = int(payload["sub"])

        # Create a stale Jira project (never synced)
        jira_project = Project(
            name="Stale Jira Project",
            source_type=ProjectSourceType.JIRA.value,
            external_key="STALE-1",
            category="software",
            last_synced_at=None,  # Never synced → stale
        )
        db_session.add(jira_project)
        await db_session.flush()

        # Associate with correct guest user (id=3)
        stmt = user_projects.insert().values(
            userId=guest_user_id,
            projectId=jira_project.id,
        )
        await db_session.execute(stmt)
        await db_session.commit()

        mock_jira = MagicMock()
        mock_sync = AsyncMock(
            return_value={
                "projects_synced": 1,
                "issues_upserted": 0,
                "issues_closed": 0,
            }
        )

        with (
            patch(
                "planny_api.dependencies.get_jira_issue_client",
                return_value=mock_jira,
            ),
            patch(
                "planny_api.services.jira_sync_service.sync_external_projects",
                mock_sync,
            ),
        ):
            response = await client.get(
                "/projects",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert response.status_code == 200

            projects = response.json()["projects"]
            names = [p["name"] for p in projects]
            assert "Stale Jira Project" in names

        mock_sync.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_auto_sync_skipped_for_fresh_project(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /projects with recently synced Jira project skips sync."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        # The guest auth returns user id=3 (Lord Gaben / users[2])
        payload = verify_token(token)
        guest_user_id = int(payload["sub"])

        # Create a fresh Jira project (just synced)
        fresh_project = Project(
            name="Fresh Jira Project",
            source_type=ProjectSourceType.JIRA.value,
            external_key="FRESH-1",
            category="software",
            last_synced_at=datetime.now(UTC),  # Recently synced → not stale
        )
        db_session.add(fresh_project)
        await db_session.flush()

        # Associate with correct guest user (id=3)
        stmt = user_projects.insert().values(
            userId=guest_user_id,
            projectId=fresh_project.id,
        )
        await db_session.execute(stmt)
        await db_session.commit()

        mock_jira = MagicMock()
        mock_sync = AsyncMock()

        with (
            patch(
                "planny_api.dependencies.get_jira_issue_client",
                return_value=mock_jira,
            ),
            patch(
                "planny_api.services.jira_sync_service.sync_external_projects",
                mock_sync,
            ),
        ):
            response = await client.get(
                "/projects",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert response.status_code == 200

            projects = response.json()["projects"]
            names = [p["name"] for p in projects]
            assert "Fresh Jira Project" in names

        # Sync should NOT be called for fresh projects
        mock_sync.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_auto_sync_skipped_when_jira_not_configured(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /projects should work even when Jira is not configured."""
        resp = await client.post("/authentication/guest")
        token = resp.json()["authToken"]

        # Do NOT mock get_jira_issue_client — it will raise
        # IntegrationUnavailableError which is caught by the handler.
        # Just verify the response is still 200.

        response = await client.get(
            "/projects",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert "projects" in response.json()
