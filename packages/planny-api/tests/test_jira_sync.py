"""Tests for the Jira sync service.

Uses an in-memory SQLite database and a mocked ``JiraHttpClient`` to
validate field mapping, upsert behaviour, closed-issue detection,
staleness checks, and empty-response handling.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from planny_core.database import Base
from planny_core.models import Issue, Project, User
from planny_jira.client import JiraHttpClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.services.jira_sync_service import (
    map_jira_issue_to_local,
    should_auto_sync,
    sync_external_projects,
)

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_jira_issue(
    key: str = "VIS-1",
    project_key: str = "VIS",
    project_name: str = "Vision",
    summary: str = "Test issue",
    issuetype: str = "Task",
    status: str = "To Do",
    priority: str = "Medium",
    description: str | None = "<p>Some HTML</p>",
    original_estimate: int | None = 3600,
    time_spent: int | None = 1800,
    remaining_estimate: int | None = 1800,
) -> dict:
    """Build a dict shaped like a Jira ``/search`` response item."""
    issue: dict = {
        "id": key.split("-")[1] if "-" in key else "99999",
        "key": key,
        "fields": {
            "project": {"key": project_key, "name": project_name},
            "summary": summary,
            "issuetype": {"name": issuetype},
            "status": {"name": status},
            "priority": {"name": priority},
        },
    }
    if description is not None:
        issue["fields"]["description"] = description
    if any(v is not None for v in (original_estimate, time_spent, remaining_estimate)):
        tt: dict = {}
        if original_estimate is not None:
            tt["originalEstimateSeconds"] = original_estimate
        if time_spent is not None:
            tt["timeSpentSeconds"] = time_spent
        if remaining_estimate is not None:
            tt["remainingEstimateSeconds"] = remaining_estimate
        issue["fields"]["timetracking"] = tt
    return issue


def _make_jira_search_response(
    issues: list[dict],
) -> dict:
    """Build a dict shaped like the Jira ``/search`` response."""
    return {"issues": issues, "total": len(issues), "maxResults": 100}


# ── Fixtures ──────────────────────────────────────────────────────────────────


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
async def db_session(db_engine) -> AsyncSession:
    """Provide a clean session per test."""
    factory = async_sessionmaker(
        bind=db_engine,
        expire_on_commit=False,
    )
    async with factory() as session:
        yield session


@pytest.fixture
def mock_jira_client() -> MagicMock:
    """Return a ``JiraHttpClient`` mock with ``AsyncMock`` methods."""
    client = MagicMock(spec=JiraHttpClient)
    client.get = AsyncMock()
    client.post = AsyncMock()
    return client


# ═══════════════════════════════════════════════════════════════════════════════
# Field mapping tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestMapJiraIssueToLocal:
    """Direct unit tests for ``map_jira_issue_to_local()``."""

    def test_maps_basic_fields(self) -> None:
        """synchronous test: summary→title, projectId, reporterId, external_key."""
        jira = _make_jira_issue(
            key="PROJ-42",
            summary="My issue title",
            project_key="PROJ",
            project_name="My Project",
        )
        result = map_jira_issue_to_local(jira, project_id=10, reporter_id=7, max_list_position=5.0)

        assert result["title"] == "My issue title"
        assert result["projectId"] == 10
        assert result["reporterId"] == 7
        assert result["external_key"] == "PROJ-42"
        assert result["listPosition"] == 6.0  # max + 1.0
        assert result["source_type"] == "jira"
        assert result["readonly"] is True

    def test_maps_issue_type(self) -> None:
        """issuetype.name → local type (lowercased)."""
        for jira_type, expected in [("Bug", "bug"), ("Task", "task"), ("Story", "story")]:
            jira = _make_jira_issue(issuetype=jira_type)
            result = map_jira_issue_to_local(jira, 1, 1, 0.0)
            assert result["type"] == expected, f"{jira_type} → {expected}"

    def test_default_issue_type(self) -> None:
        """Unknown issuetype → 'task'."""
        jira = _make_jira_issue(issuetype="Epic")
        result = map_jira_issue_to_local(jira, 1, 1, 0.0)
        assert result["type"] == "task"

    def test_maps_status(self) -> None:
        """status.name → local status."""
        cases = [
            ("To Do", "backlog"),
            ("Open", "backlog"),
            ("Selected", "selected"),
            ("In Progress", "inprogress"),
            ("Done", "done"),
            ("Closed", "done"),
            ("Resolved", "done"),
        ]
        for jira_status, expected in cases:
            jira = _make_jira_issue(status=jira_status)
            result = map_jira_issue_to_local(jira, 1, 1, 0.0)
            assert result["status"] == expected, f"{jira_status} → {expected}"

    def test_default_status(self) -> None:
        """Unknown status → 'backlog'."""
        jira = _make_jira_issue(status="Unknown Status")
        result = map_jira_issue_to_local(jira, 1, 1, 0.0)
        assert result["status"] == "backlog"

    def test_maps_priority(self) -> None:
        """priority.name → local priority string."""
        cases = [
            ("Highest", "5"),
            ("High", "4"),
            ("Medium", "3"),
            ("Low", "2"),
            ("Lowest", "1"),
        ]
        for jira_priority, expected in cases:
            jira = _make_jira_issue(priority=jira_priority)
            result = map_jira_issue_to_local(jira, 1, 1, 0.0)
            assert result["priority"] == expected, f"{jira_priority} → {expected}"

    def test_default_priority(self) -> None:
        """Unknown priority → '3'."""
        jira = _make_jira_issue(priority="Blocker")
        result = map_jira_issue_to_local(jira, 1, 1, 0.0)
        assert result["priority"] == "3"

    def test_maps_timetracking(self) -> None:
        """timetracking fields → estimate, timeSpent, timeRemaining."""
        jira = _make_jira_issue(
            original_estimate=7200,
            time_spent=3600,
            remaining_estimate=3600,
        )
        result = map_jira_issue_to_local(jira, 1, 1, 0.0)
        assert result["estimate"] == 2
        assert result["timeSpent"] == 1
        assert result["timeRemaining"] == 1

    def test_maps_timetracking_none(self) -> None:
        """No timetracking object → all None."""
        jira = _make_jira_issue(
            original_estimate=None,
            time_spent=None,
            remaining_estimate=None,
        )
        # The helper does NOT set timetracking when all values are None,
        # so we verify mapping without the key present.
        jira["fields"].pop("timetracking", None)
        result = map_jira_issue_to_local(jira, 1, 1, 0.0)
        assert result["estimate"] is None
        assert result["timeSpent"] is None
        assert result["timeRemaining"] is None

    def test_description_passed_through(self) -> None:
        """HTML description is passed through (bleach hook runs on insert)."""
        jira = _make_jira_issue(description="<p>Hello <b>world</b></p>")
        result = map_jira_issue_to_local(jira, 1, 1, 0.0)
        assert result["description"] == "<p>Hello <b>world</b></p>"


# ═══════════════════════════════════════════════════════════════════════════════
# Staleness check tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestShouldAutoSync:
    """Tests for ``should_auto_sync()``."""

    def test_never_synced(self) -> None:
        """last_synced_at is None → True."""
        project = Project(name="Test", category="software")
        assert should_auto_sync(project) is True

    def test_synced_recently(self) -> None:
        """last_synced_at < 24h ago → False."""
        project = Project(
            name="Test",
            category="software",
            last_synced_at=datetime.utcnow() - timedelta(hours=1),
        )
        assert should_auto_sync(project) is False

    def test_synced_just_over_24h(self) -> None:
        """last_synced_at > 24h ago → True."""
        project = Project(
            name="Test",
            category="software",
            last_synced_at=datetime.utcnow() - timedelta(hours=25),
        )
        assert should_auto_sync(project) is True

    def test_stale_boundary(self) -> None:
        """last_synced_at ~23.9h ago → False; ~24.1h ago → True."""
        just_under = Project(
            name="Test",
            category="software",
            last_synced_at=datetime.utcnow() - timedelta(hours=23, minutes=55),
        )
        assert should_auto_sync(just_under) is False

        just_over = Project(
            name="Test",
            category="software",
            last_synced_at=datetime.utcnow() - timedelta(hours=24, minutes=5),
        )
        assert should_auto_sync(just_over) is True


# ═══════════════════════════════════════════════════════════════════════════════
# Integration-style sync tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestSyncExternalProjects:
    """Tests for ``sync_external_projects()`` with a real DB session."""

    async def _seed_user(self, db: AsyncSession, user_id: int = 42) -> None:
        """Create a minimal user row so FK constraints are satisfied."""
        # Create a dummy default project first (needed by User.projectId FK)
        project = Project(name="Default", category="software")
        db.add(project)
        await db.flush()

        user = User(
            id=user_id,
            name="Test User",
            email="test@example.com",
            avatarUrl="https://example.com/avatar.jpg",
            projectId=project.id,
        )
        db.add(user)
        await db.flush()

    @pytest.mark.asyncio
    async def test_basic_sync(
        self,
        db_session: AsyncSession,
        mock_jira_client: MagicMock,
    ) -> None:
        """Jira API returns issues → projects and issues upserted correctly."""
        await self._seed_user(db_session)

        mock_jira_client.get.return_value = _make_jira_search_response([
            _make_jira_issue(
                key="VIS-1",
                project_key="VIS",
                project_name="Vision",
                summary="Fix login",
                issuetype="Bug",
                status="In Progress",
                priority="High",
            ),
            _make_jira_issue(
                key="VIS-2",
                project_key="VIS",
                project_name="Vision",
                summary="Add tests",
                issuetype="Task",
                status="To Do",
                priority="Medium",
            ),
        ])

        result = await sync_external_projects(42, db_session, mock_jira_client)

        assert result["projects_synced"] == 1
        assert result["issues_upserted"] == 2
        assert result["issues_closed"] == 0

        # Verify project
        proj_result = await db_session.execute(
            select(Project).where(Project.external_key == "VIS")
        )
        project = proj_result.scalars().first()
        assert project is not None
        assert project.name == "Vision"
        assert project.source_type == "jira"
        assert project.last_synced_at is not None

        # Verify user_projects association
        assoc_result = await db_session.execute(
            text(
                'SELECT count(*) FROM user_projects '
                'WHERE "userId" = 42 AND "projectId" = :pid'
            ),
            {"pid": project.id},
        )
        assert assoc_result.scalar() == 1

        # Verify issues
        issues_result = await db_session.execute(
            select(Issue).where(
                Issue.projectId == project.id,
                Issue.source_type == "jira",
            ).order_by(Issue.listPosition)
        )
        db_issues = list(issues_result.scalars().all())
        assert len(db_issues) == 2

        vis1 = db_issues[0]
        assert vis1.title == "Fix login"
        assert vis1.type == "bug"
        assert vis1.status == "inprogress"
        assert vis1.priority == "4"
        assert vis1.readonly is True
        assert vis1.external_key == "VIS-1"

        vis2 = db_issues[1]
        assert vis2.title == "Add tests"
        assert vis2.type == "task"
        assert vis2.status == "backlog"
        assert vis2.priority == "3"

    @pytest.mark.asyncio
    async def test_closed_issue_detection(
        self,
        db_session: AsyncSession,
        mock_jira_client: MagicMock,
    ) -> None:
        """Issues in DB but NOT in Jira response → status='done'."""
        await self._seed_user(db_session)

        # Seed a jira-type project and issues
        project = Project(
            name="Vision",
            source_type="jira",
            external_key="VIS",
            category="software",
        )
        db_session.add(project)
        await db_session.flush()

        # Seed association
        await db_session.execute(
            text(
                'INSERT OR IGNORE INTO user_projects ("userId", "projectId") '
                "VALUES (42, :pid)"
            ),
            {"pid": project.id},
        )

        issue_active = Issue(
            title="Active",
            type="task",
            status="inprogress",
            priority="3",
            listPosition=1.0,
            reporterId=42,
            projectId=project.id,
            source_type="jira",
            external_key="VIS-1",
            readonly=True,
        )
        issue_orphan = Issue(
            title="Orphan",
            type="task",
            status="inprogress",
            priority="3",
            listPosition=2.0,
            reporterId=42,
            projectId=project.id,
            source_type="jira",
            external_key="VIS-999",
            readonly=True,
        )
        db_session.add_all([issue_active, issue_orphan])
        await db_session.flush()

        # Mock Jira API returning only VIS-1 (not VIS-999)
        mock_jira_client.get.return_value = _make_jira_search_response([
            _make_jira_issue(
                key="VIS-1",
                project_key="VIS",
                project_name="Vision",
                summary="Active updated",
                issuetype="Task",
                status="In Progress",
                priority="Medium",
            ),
        ])

        result = await sync_external_projects(42, db_session, mock_jira_client)

        assert result["projects_synced"] == 1
        assert result["issues_upserted"] == 1  # upsert (not new)
        assert result["issues_closed"] == 1

        # VIS-999 should be done
        orphan_db = await db_session.get(Issue, issue_orphan.id)
        assert orphan_db is not None
        assert orphan_db.status == "done"

        # VIS-1 should remain inprogress (from mapping)
        active_db = await db_session.get(Issue, issue_active.id)
        assert active_db is not None
        assert active_db.status == "inprogress"

    @pytest.mark.asyncio
    async def test_duplicate_external_key(
        self,
        db_session: AsyncSession,
        mock_jira_client: MagicMock,
    ) -> None:
        """Second sync with same issues → upsert, no duplicate rows."""
        await self._seed_user(db_session)

        mock_response = _make_jira_search_response([
            _make_jira_issue(
                key="VIS-1",
                project_key="VIS",
                project_name="Vision",
                summary="Fix login",
                issuetype="Bug",
                status="In Progress",
                priority="High",
            ),
        ])

        mock_jira_client.get.return_value = mock_response

        # First sync
        result1 = await sync_external_projects(42, db_session, mock_jira_client)
        assert result1["issues_upserted"] == 1

        # Second sync with same data
        mock_jira_client.get.return_value = mock_response
        result2 = await sync_external_projects(42, db_session, mock_jira_client)
        assert result2["issues_upserted"] == 1  # upsert, not new

        # Count issue rows — should be exactly 1
        count_result = await db_session.execute(
            select(Issue).where(Issue.external_key == "VIS-1")
        )
        rows = list(count_result.scalars().all())
        assert len(rows) == 1

        # Count user_projects rows — should be exactly 1
        project_result = await db_session.execute(
            select(Project).where(Project.external_key == "VIS")
        )
        project = project_result.scalars().first()
        assert project is not None
        assoc_result = await db_session.execute(
            text(
                'SELECT count(*) FROM user_projects '
                'WHERE "userId" = 42 AND "projectId" = :pid'
            ),
            {"pid": project.id},
        )
        assert assoc_result.scalar() == 1

    @pytest.mark.asyncio
    async def test_empty_response(
        self,
        db_session: AsyncSession,
        mock_jira_client: MagicMock,
    ) -> None:
        """Jira returns 0 issues → no crash, no data loss."""
        await self._seed_user(db_session)

        mock_jira_client.get.return_value = _make_jira_search_response([])

        result = await sync_external_projects(42, db_session, mock_jira_client)

        assert result["projects_synced"] == 0
        assert result["issues_upserted"] == 0
        assert result["issues_closed"] == 0

    @pytest.mark.asyncio
    async def test_multiple_projects(
        self,
        db_session: AsyncSession,
        mock_jira_client: MagicMock,
    ) -> None:
        """Issues from different Jira projects create separate local projects."""
        await self._seed_user(db_session)

        mock_jira_client.get.return_value = _make_jira_search_response([
            _make_jira_issue(
                key="VIS-1",
                project_key="VIS",
                project_name="Vision",
                summary="VIS issue",
            ),
            _make_jira_issue(
                key="MAR-1",
                project_key="MAR",
                project_name="Marketing",
                summary="MAR issue",
            ),
        ])

        result = await sync_external_projects(42, db_session, mock_jira_client)

        assert result["projects_synced"] == 2
        assert result["issues_upserted"] == 2

        projects_result = await db_session.execute(
            select(Project).where(Project.source_type == "jira")
        )
        projects = list(projects_result.scalars().all())
        assert len(projects) == 2
        keys = {p.external_key for p in projects}
        assert keys == {"VIS", "MAR"}

    @pytest.mark.asyncio
    async def test_sync_updates_existing_issue(
        self,
        db_session: AsyncSession,
        mock_jira_client: MagicMock,
    ) -> None:
        """Existing issue gets fields updated (except listPosition)."""
        await self._seed_user(db_session)

        # Seed project and issue
        project = Project(
            name="Vision",
            source_type="jira",
            external_key="VIS",
            category="software",
        )
        db_session.add(project)
        await db_session.flush()

        await db_session.execute(
            text(
                'INSERT OR IGNORE INTO user_projects ("userId", "projectId") '
                "VALUES (42, :pid)"
            ),
            {"pid": project.id},
        )

        original = Issue(
            title="Old title",
            type="bug",
            status="backlog",
            priority="3",
            listPosition=10.0,
            reporterId=42,
            projectId=project.id,
            source_type="jira",
            external_key="VIS-1",
            readonly=True,
        )
        db_session.add(original)
        await db_session.flush()
        original_id = original.id

        mock_jira_client.get.return_value = _make_jira_search_response([
            _make_jira_issue(
                key="VIS-1",
                project_key="VIS",
                project_name="Vision",
                summary="Updated title",
                issuetype="Story",
                status="In Progress",
                priority="High",
            ),
        ])

        result = await sync_external_projects(42, db_session, mock_jira_client)

        assert result["issues_upserted"] == 1  # upsert, not new

        updated = await db_session.get(Issue, original_id)
        assert updated is not None
        assert updated.title == "Updated title"
        assert updated.type == "story"
        assert updated.status == "inprogress"
        assert updated.priority == "4"
        # listPosition should NOT have changed
        assert updated.listPosition == 10.0

    @pytest.mark.asyncio
    async def test_sync_updates_last_synced_at(
        self,
        db_session: AsyncSession,
        mock_jira_client: MagicMock,
    ) -> None:
        """After sync, project.last_synced_at is set to a recent timestamp."""
        await self._seed_user(db_session)

        mock_jira_client.get.return_value = _make_jira_search_response([
            _make_jira_issue(
                key="VIS-1",
                project_key="VIS",
                project_name="Vision",
                summary="Test",
            ),
        ])

        before = datetime.utcnow()
        await sync_external_projects(42, db_session, mock_jira_client)

        proj_result = await db_session.execute(
            select(Project).where(Project.external_key == "VIS")
        )
        project = proj_result.scalars().first()
        assert project is not None
        assert project.last_synced_at is not None
        # Should be >= before (allowing slight clock drift)
        assert project.last_synced_at >= before - timedelta(seconds=1)
