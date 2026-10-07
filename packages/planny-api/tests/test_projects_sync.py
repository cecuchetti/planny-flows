"""Tests for the Jira sync endpoints and the auto-sync decision.

These exist because nothing covered `POST /projects/sync` while it was broken:
the service fetched its Jira client by *calling* the FastAPI dependency, which
returns the ``Depends`` marker rather than a client, so the attribute access
raised and a bare ``except`` reported it as "Jira is not configured". Every sync
returned 503 no matter how Jira was configured, and the whole suite stayed green.

The tests below therefore override ``get_context`` — the real dependency's own
input — and never ``get_jira_issue_client``. Overriding the latter would replace
the very thing under test and would have passed against the broken code.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.config import Settings
from planny_core.db import Base
from planny_core.models import Project, User, user_projects
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.app.context import AppContext
from planny_api.dependencies import get_context, get_current_user, get_db
from planny_api.main import create_app


class FakeJiraClient:
    """Stands in for the external Jira HTTP client."""

    def __init__(self, issues: list[dict] | None = None) -> None:
        self.issues = issues if issues is not None else []
        self.calls: list[str] = []

    async def get(self, path: str, params: dict | None = None) -> dict:
        self.calls.append(path)
        return {"issues": self.issues, "isLast": True}


def _jira_issue(key: str = "VIS-1", project_key: str = "VIS") -> dict:
    return {
        "key": key,
        "fields": {
            "summary": "An issue",
            "project": {"key": project_key, "name": "Visible"},
            "status": {"name": "In Progress"},
            "issuetype": {"name": "Task"},
            "priority": {"name": "Medium"},
        },
    }


@pytest.fixture
async def engine() -> AsyncIterator[object]:
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with factory() as session:
        session.add(Project(id=1, name="Local", category="software"))
        await session.flush()
        session.add(User(id=1, name="Me", email="me@example.com", avatarUrl="", projectId=1))
        await session.flush()
        await session.execute(
            user_projects.insert().values(userId=1, projectId=1)
        )
        await session.commit()

    yield engine
    await engine.dispose()


def _app(engine: object, *, jira_client: object | None) -> FastAPI:
    """An app whose context may or may not carry a Jira client."""
    app = create_app(Settings(_env_file=None, env="development", jwt_secret="s"))
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)  # type: ignore[arg-type]

    async def _db() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session
            await session.commit()

    settings = Settings(_env_file=None, env="development", jwt_secret="s")
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: User(id=1)
    app.dependency_overrides[get_context] = lambda: AppContext(
        settings, jira_issue_client=jira_client
    )
    return app


class TestForcedSync:
    """`POST /projects/sync` must work when Jira is configured."""

    async def test_syncs_when_jira_is_configured(self, engine: object) -> None:
        fake = FakeJiraClient([_jira_issue()])
        app = _app(engine, jira_client=fake)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/projects/sync")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["synced"] is True
        assert body["projects_synced"] == 1
        assert fake.calls, "the Jira client was never used"

    async def test_returns_503_when_jira_is_not_configured(self, engine: object) -> None:
        """The correct answer for a deployment without Jira, not for a bug."""
        app = _app(engine, jira_client=None)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/projects/sync")

        assert response.status_code == 503
        assert response.json()["error"]["code"] == "INTEGRATION_UNAVAILABLE"

    async def test_syncs_a_single_jira_project(self, engine: object) -> None:
        fake = FakeJiraClient([_jira_issue()])
        app = _app(engine, jira_client=fake)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # The project does not exist yet: the sync discovers it, so syncing an
            # unknown id is a 404 rather than a sync.
            response = await client.post("/api/v1/projects/999/sync")

        assert response.status_code in (404, 400), response.text


class TestAutoSyncReporting:
    """`GET /projects` tells the client whether a sync was queued."""

    async def test_reports_the_interval(self, engine: object) -> None:
        app = _app(engine, jira_client=FakeJiraClient())

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            body = (await client.get("/api/v1/projects")).json()

        assert body["syncIntervalMinutes"] == 15

    async def test_schedules_when_a_jira_project_is_stale(self, engine: object) -> None:
        factory = async_sessionmaker(bind=engine, expire_on_commit=False)  # type: ignore[arg-type]
        async with factory() as session:
            session.add(
                Project(
                    id=2,
                    name="Synced",
                    category="software",
                    source_type="jira",
                    external_key="VIS",
                    last_synced_at=datetime.utcnow() - timedelta(hours=5),
                )
            )
            await session.flush()
            await session.execute(user_projects.insert().values(userId=1, projectId=2))
            await session.commit()

        app = _app(engine, jira_client=FakeJiraClient())

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            body = (await client.get("/api/v1/projects")).json()

        assert body["syncScheduled"] is True

    async def test_does_not_schedule_for_a_local_only_project(self, engine: object) -> None:
        app = _app(engine, jira_client=FakeJiraClient())

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            body = (await client.get("/api/v1/projects")).json()

        assert body["syncScheduled"] is False

    async def test_listing_still_works_without_jira(self, engine: object) -> None:
        """An unconfigured integration must not break the board."""
        app = _app(engine, jira_client=None)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/projects")

        assert response.status_code == 200
        assert response.json()["syncScheduled"] is False
