"""Tests for the issues router — CRUD, search, project-scoped access.

Uses an in-memory SQLite database for fully self-contained tests.
Guest data is seeded via ``POST /authentication/guest`` which creates
a project with 3 users, 8 issues, and 8 comments.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.database import Base
from planny_core.models import Issue, User
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


async def _seed_guest_and_get_token(client: AsyncClient) -> str:
    """Seed guest data and return a valid auth token."""
    resp = await client.post("/authentication/guest")
    assert resp.status_code == 200
    return resp.json()["authToken"]


# ── Tests: GET /issues (search + list) ───────────────────────────────────────


class TestGetProjectIssues:
    """Tests for GET /issues — list and search."""

    @pytest.mark.asyncio
    async def test_returns_all_issues_for_project(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /issues should return all 8 seeded issues."""
        token = await _seed_guest_and_get_token(client)

        response = await client.get(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

        body = response.json()
        assert "issues" in body
        assert isinstance(body["issues"], list)
        assert len(body["issues"]) == 8

        # Verify issue partial structure
        first = body["issues"][0]
        expected_keys = {
            "id", "title", "type", "status", "priority",
            "listPosition", "description", "descriptionText",
            "estimate", "timeSpent", "timeRemaining",
            "reporterId", "projectId",
            "createdAt", "updatedAt", "userIds",
        }
        assert expected_keys.issubset(first.keys())
        assert isinstance(first["listPosition"], float | int)

    @pytest.mark.asyncio
    async def test_search_returns_filtered_results(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /issues?searchTerm=bug should return only matching issues."""
        token = await _seed_guest_and_get_token(client)

        response = await client.get(
            "/issues",
            params={"searchTerm": "bug"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

        body = response.json()
        assert "issues" in body
        # Only issues with "bug" in title or description_text
        for issue in body["issues"]:
            title = issue["title"].lower()
            desc = (issue["descriptionText"] or "").lower()
            assert "bug" in title or "bug" in desc

    @pytest.mark.asyncio
    async def test_search_with_no_matches_returns_empty(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /issues?searchTerm=zzzznotfound should return empty list."""
        token = await _seed_guest_and_get_token(client)

        response = await client.get(
            "/issues",
            params={"searchTerm": "zzzznotfound"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["issues"] == []

    @pytest.mark.asyncio
    async def test_search_is_case_insensitive(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Search should be case-insensitive."""
        token = await _seed_guest_and_get_token(client)

        response = await client.get(
            "/issues",
            params={"searchTerm": "TASK"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body["issues"]) > 0

    @pytest.mark.asyncio
    async def test_results_ordered_by_list_position(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Issues should be ordered by listPosition ascending."""
        token = await _seed_guest_and_get_token(client)

        response = await client.get(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        body = response.json()
        positions = [i["listPosition"] for i in body["issues"]]
        assert positions == sorted(positions)


# ── Tests: GET /issues/:issueId (full detail) ────────────────────────────────


class TestGetIssueDetail:
    """Tests for GET /issues/:issueId — full issue with relations."""

    @pytest.mark.asyncio
    async def test_returns_full_issue_with_users_and_comments(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /issues/1 should return full issue with users and comments."""
        token = await _seed_guest_and_get_token(client)

        # First get the actual issue ID
        list_resp = await client.get(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        issue_id = list_resp.json()["issues"][0]["id"]

        response = await client.get(
            f"/issues/{issue_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200

        body = response.json()
        assert "issue" in body
        issue = body["issue"]

        # Has all partial keys
        assert "id" in issue
        assert "title" in issue
        assert "type" in issue

        # Has users array
        assert "users" in issue
        assert isinstance(issue["users"], list)
        if issue["users"]:
            user = issue["users"][0]
            assert "id" in user
            assert "name" in user
            assert "email" in user
            assert "avatarUrl" in user

        # Has comments array with nested user
        assert "comments" in issue
        assert isinstance(issue["comments"], list)

    @pytest.mark.asyncio
    async def test_comments_include_user_partial(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Comments should include a nested user object."""
        token = await _seed_guest_and_get_token(client)

        list_resp = await client.get(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        # Find an issue with comments
        issues = list_resp.json()["issues"]
        issue_id = None
        for iss in issues:
            detail = await client.get(
                f"/issues/{iss['id']}",
                headers={"Authorization": f"Bearer {token}"},
            )
            if detail.json()["issue"]["comments"]:
                issue_id = iss["id"]
                break

        if issue_id is None:
            pytest.skip("No issue with comments found in seed data")

        detail_resp = await client.get(
            f"/issues/{issue_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        comments = detail_resp.json()["issue"]["comments"]
        for comment in comments:
            assert "user" in comment
            assert "id" in comment["user"]
            assert "name" in comment["user"]
            assert "email" in comment["user"]

    @pytest.mark.asyncio
    async def test_issue_from_other_project_returns_404(
        self, app: FastAPI, db_engine
    ) -> None:
        """GET /issues/:id from different project should return 404."""
        from datetime import UTC, datetime

        from planny_core.auth import create_token

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

        # Inject a mock user with a project that doesn't match
        mock_user = User(
            id=999,
            name="Intruder",
            email="intruder@evil.com",
            avatarUrl="https://example.com/avatar.jpg",
            projectId=999,
            createdAt=datetime.now(UTC),
            updatedAt=datetime.now(UTC),
        )

        async def _override_user():
            return mock_user

        app.dependency_overrides[get_current_user] = _override_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            token = create_token(999)
            # Issue 1 exists in the real DB but belongs to project 1, not 999
            response = await ac.get(
                "/issues/1",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert response.status_code == 404
            body = response.json()
            assert body["error"]["code"] == "ENTITY_NOT_FOUND"
            assert body["error"]["status"] == 404

        app.dependency_overrides.clear()


# ── Tests: POST /issues (create) ─────────────────────────────────────────────


class TestCreateIssue:
    """Tests for POST /issues — create with auto listPosition."""

    @pytest.mark.asyncio
    async def test_creates_issue_with_auto_list_position(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """POST /issues should create issue with auto-calculated listPosition."""
        token = await _seed_guest_and_get_token(client)

        # Get current list positions
        list_resp = await client.get(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        existing_positions = [i["listPosition"] for i in list_resp.json()["issues"]]
        max_pos = max(existing_positions) if existing_positions else 0.0

        response = await client.post(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "New Test Issue",
                "type": "task",
                "status": "backlog",
                "priority": "3",
            },
        )
        assert response.status_code == 200

        body = response.json()
        assert "issue" in body
        issue = body["issue"]

        assert issue["title"] == "New Test Issue"
        assert issue["type"] == "task"
        assert issue["status"] == "backlog"
        assert issue["priority"] == "3"
        assert issue["listPosition"] == max_pos + 1.0
        assert isinstance(issue["listPosition"], float | int)

        # Verify in DB
        result = await db_session.execute(
            select(Issue).where(Issue.title == "New Test Issue")
        )
        db_issue = result.scalars().first()
        assert db_issue is not None
        assert db_issue.listPosition == max_pos + 1.0

    @pytest.mark.asyncio
    async def test_creates_multiple_issues_increments_position(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Creating 3 issues should give sequential positions."""
        token = await _seed_guest_and_get_token(client)

        positions = []
        for i in range(1, 4):
            response = await client.post(
                "/issues",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "title": f"Position Test Issue {i}",
                    "type": "task",
                    "status": "backlog",
                    "priority": "3",
                },
            )
            assert response.status_code == 200
            issue = response.json()["issue"]
            positions.append(issue["listPosition"])

        # The positions should be distinct and increasing
        assert len(set(positions)) == 3
        assert positions[0] < positions[1] < positions[2]

        # Increment between each should be 1.0
        assert positions[1] - positions[0] == 1.0
        assert positions[2] - positions[1] == 1.0

    @pytest.mark.asyncio
    async def test_defaults_reporter_to_current_user(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """reporterId should default to current user when not provided."""
        token = await _seed_guest_and_get_token(client)

        response = await client.post(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Reporter Test",
                "type": "task",
                "status": "backlog",
                "priority": "3",
            },
        )
        assert response.status_code == 200
        issue = response.json()["issue"]
        assert isinstance(issue["reporterId"], int)
        assert issue["reporterId"] > 0

    @pytest.mark.asyncio
    async def test_uses_provided_reporter_id(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """When reporterId is provided, it should be used."""
        token = await _seed_guest_and_get_token(client)

        response = await client.post(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Custom Reporter",
                "type": "task",
                "status": "backlog",
                "priority": "3",
                "reporterId": 42,
            },
        )
        assert response.status_code == 200
        assert response.json()["issue"]["reporterId"] == 42

    @pytest.mark.asyncio
    async def test_validation_error_missing_title(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """POST /issues without title should return 422."""
        token = await _seed_guest_and_get_token(client)

        response = await client.post(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "type": "task",
                "status": "backlog",
                "priority": "3",
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_validation_error_invalid_type(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """POST /issues with invalid type should return 422."""
        token = await _seed_guest_and_get_token(client)

        response = await client.post(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Test",
                "type": "invalid-type",
                "status": "backlog",
                "priority": "3",
            },
        )
        assert response.status_code == 422


# ── Tests: PUT /issues/:issueId (update) ─────────────────────────────────────


class TestUpdateIssue:
    """Tests for PUT /issues/:issueId — partial update."""

    @pytest.mark.asyncio
    async def test_updates_issue_fields(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """PUT /issues/:id should update fields and return updated issue."""
        token = await _seed_guest_and_get_token(client)

        # Get first issue
        list_resp = await client.get(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        issue_id = list_resp.json()["issues"][0]["id"]

        response = await client.put(
            f"/issues/{issue_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Updated Title",
                "status": "inprogress",
                "priority": "4",
            },
        )
        assert response.status_code == 200

        body = response.json()
        assert "issue" in body
        issue = body["issue"]
        assert issue["title"] == "Updated Title"
        assert issue["status"] == "inprogress"
        assert issue["priority"] == "4"

        # Verify DB was updated
        db_issue = await db_session.get(Issue, issue_id)
        assert db_issue is not None
        assert db_issue.title == "Updated Title"
        assert db_issue.status == "inprogress"
        assert db_issue.priority == "4"

    @pytest.mark.asyncio
    async def test_partial_update_does_not_clear_other_fields(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """PUT with only some fields should not reset others."""
        token = await _seed_guest_and_get_token(client)

        list_resp = await client.get(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        first = list_resp.json()["issues"][0]
        issue_id = first["id"]
        original_description = first["description"]

        response = await client.put(
            f"/issues/{issue_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"title": "Only Title Changed"},
        )
        assert response.status_code == 200
        issue = response.json()["issue"]
        assert issue["title"] == "Only Title Changed"
        assert issue["description"] == original_description

    @pytest.mark.asyncio
    async def test_update_from_other_project_returns_404(
        self, app: FastAPI, db_engine
    ) -> None:
        """PUT /issues/:id from different project should return 404."""
        from datetime import UTC, datetime

        from planny_core.auth import create_token

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
            id=999,
            name="Intruder",
            email="intruder@evil.com",
            avatarUrl="https://example.com/avatar.jpg",
            projectId=999,
            createdAt=datetime.now(UTC),
            updatedAt=datetime.now(UTC),
        )

        async def _override_user():
            return mock_user

        app.dependency_overrides[get_current_user] = _override_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            token = create_token(999)
            response = await ac.put(
                "/issues/1",
                headers={"Authorization": f"Bearer {token}"},
                json={"title": "Hacked"},
            )
            assert response.status_code == 404

        app.dependency_overrides.clear()


# ── Tests: DELETE /issues/:issueId (delete) ──────────────────────────────────


class TestDeleteIssue:
    """Tests for DELETE /issues/:issueId — delete and cascade."""

    @pytest.mark.asyncio
    async def test_deletes_issue(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """DELETE /issues/:id should delete the issue."""
        token = await _seed_guest_and_get_token(client)

        list_resp = await client.get(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        issues = list_resp.json()["issues"]
        assert len(issues) > 0
        issue_id = issues[0]["id"]

        response = await client.delete(
            f"/issues/{issue_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert response.json() == {"message": "Issue deleted"}

        # Verify deletion from DB
        db_issue = await db_session.get(Issue, issue_id)
        assert db_issue is None

    @pytest.mark.asyncio
    async def test_cascades_to_comments(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Deleting an issue should cascade-delete its comments."""
        token = await _seed_guest_and_get_token(client)

        # Create an issue, then delete
        create_resp = await client.post(
            "/issues",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Cascade Test",
                "type": "task",
                "status": "backlog",
                "priority": "3",
            },
        )
        issue_id = create_resp.json()["issue"]["id"]

        # Delete the issue
        delete_resp = await client.delete(
            f"/issues/{issue_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert delete_resp.status_code == 200

        # Verify issue is gone
        db_issue = await db_session.get(Issue, issue_id)
        assert db_issue is None

    @pytest.mark.asyncio
    async def test_delete_from_other_project_returns_404(
        self, app: FastAPI, db_engine
    ) -> None:
        """DELETE /issues/:id from different project should return 404."""
        from datetime import UTC, datetime

        from planny_core.auth import create_token

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
            id=999,
            name="Intruder",
            email="intruder@evil.com",
            avatarUrl="https://example.com/avatar.jpg",
            projectId=999,
            createdAt=datetime.now(UTC),
            updatedAt=datetime.now(UTC),
        )

        async def _override_user():
            return mock_user

        app.dependency_overrides[get_current_user] = _override_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            token = create_token(999)
            response = await ac.delete(
                "/issues/1",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert response.status_code == 404

        app.dependency_overrides.clear()
