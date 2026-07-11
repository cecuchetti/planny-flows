"""Tests for all 9 SQLAlchemy models — instantiation, relationships, cascade, constraints.

Uses an in-memory SQLite database to verify schema and relationship behaviour
matches the TypeORM entities.
"""

from __future__ import annotations

from collections.abc import Generator
from datetime import datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from planny_core.database import Base
from planny_core.models import (
    Comment,
    DailyHours,
    ExternalHoursDaily,
    Issue,
    Project,
    TempoHoursDaily,
    User,
    WorklogSubmission,
    WorklogSubmissionResult,
)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Create an in-memory SQLite database with all tables for each test."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine)
    session = test_session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


# ── Fixture helpers ──────────────────────────────────────────────────────────


def _create_project(session: Session, **kwargs) -> Project:
    defaults = dict(name="Test Project", category="software")
    defaults.update(kwargs)
    p = Project(**defaults)
    session.add(p)
    session.commit()
    return p


def _create_user(session: Session, project: Project, **kwargs) -> User:
    defaults = dict(
        name="Test User",
        email="user@test.com",
        avatarUrl="http://example.com/avatar.png",
        projectId=project.id,
    )
    defaults.update(kwargs)
    u = User(**defaults)
    session.add(u)
    session.commit()
    return u


def _create_issue(session: Session, project: Project, **kwargs) -> Issue:
    defaults = dict(
        title="Test Issue",
        type="task",
        status="backlog",
        priority="3",
        listPosition=1.0,
        reporterId=1,
        projectId=project.id,
    )
    defaults.update(kwargs)
    i = Issue(**defaults)
    session.add(i)
    session.commit()
    return i


# ── Model instantiation tests ────────────────────────────────────────────────


class TestProjectModel:
    def test_create(self, db_session: Session) -> None:
        p = _create_project(db_session)
        assert p.id is not None
        assert p.name == "Test Project"
        assert p.category == "software"
        assert isinstance(p.createdAt, datetime)
        assert isinstance(p.updatedAt, datetime)

    def test_nullable_fields(self, db_session: Session) -> None:
        p = _create_project(db_session, url=None, description=None)
        assert p.url is None
        assert p.description is None


class TestUserModel:
    def test_create(self, db_session: Session) -> None:
        p = _create_project(db_session)
        u = _create_user(db_session, p)
        assert u.id is not None
        assert u.name == "Test User"
        assert u.email == "user@test.com"
        assert u.avatarUrl == "http://example.com/avatar.png"
        assert u.projectId == p.id

    def test_camelcase_avatar_url(self, db_session: Session) -> None:  # noqa: N802 — test for camelCase column
        """Verify column name matches TypeORM's camelCase naming."""
        p = _create_project(db_session)
        u = User(
            name="Avatar Test",
            email="avatar@test.com",
            avatarUrl="https://example.com/avatar.jpg",
            projectId=p.id,
        )
        db_session.add(u)
        db_session.commit()

        # Read back — column name must be exactly avatarUrl
        row = db_session.execute(
            text('SELECT "avatarUrl" FROM "user" WHERE id = :id'), {"id": u.id}
        ).fetchone()
        assert row is not None
        assert row[0] == "https://example.com/avatar.jpg"


class TestIssueModel:
    def test_create(self, db_session: Session) -> None:
        p = _create_project(db_session)
        i = _create_issue(db_session, p)
        assert i.id is not None
        assert i.title == "Test Issue"
        assert i.type == "task"
        assert i.status == "backlog"
        assert i.priority == "3"
        assert i.listPosition == 1.0
        assert i.reporterId == 1
        assert i.projectId == p.id

    def test_nullable_fields(self, db_session: Session) -> None:
        p = _create_project(db_session)
        i = _create_issue(db_session, p, description=None, estimate=None)
        assert i.description is None
        assert i.timeSpent is None
        assert i.timeRemaining is None

    def test_striptags_hook(self, db_session: Session) -> None:
        """Verify description_text is auto-generated from description."""
        p = _create_project(db_session)
        html = "<p>Hello <b>world</b></p>"
        i = Issue(
            title="Striptags Test",
            type="task",
            status="backlog",
            priority="3",
            listPosition=2.0,
            reporterId=1,
            projectId=p.id,
            description=html,
        )
        db_session.add(i)
        db_session.commit()

        # Hook runs on before_insert, so description_text should be stripped
        assert i.descriptionText == "Hello world"

    def test_striptags_updates_on_change(self, db_session: Session) -> None:
        """Verify description_text is updated when description changes."""
        p = _create_project(db_session)
        i = Issue(
            title="Update Test",
            type="task",
            status="backlog",
            priority="3",
            listPosition=3.0,
            reporterId=1,
            projectId=p.id,
            description="<p>Original</p>",
        )
        db_session.add(i)
        db_session.commit()
        assert i.descriptionText == "Original"

        i.description = "<p>Updated <b>content</b></p>"
        db_session.commit()

        # Reload and check
        db_session.refresh(i)
        assert i.descriptionText == "Updated content"


class TestCommentModel:
    def test_create(self, db_session: Session) -> None:
        p = _create_project(db_session)
        u = _create_user(db_session, p)
        i = _create_issue(db_session, p)
        c = Comment(body="Test comment", userId=u.id, issueId=i.id)
        db_session.add(c)
        db_session.commit()
        assert c.id is not None
        assert c.body == "Test comment"

    def test_cascade_delete(self, db_session: Session) -> None:
        """Deleting an Issue cascades to its Comments."""
        p = _create_project(db_session)
        u = _create_user(db_session, p)
        i = _create_issue(db_session, p)
        c = Comment(body="Will be deleted", userId=u.id, issueId=i.id)
        db_session.add(c)
        db_session.commit()

        comment_id = c.id
        db_session.delete(i)
        db_session.commit()

        # Comment should be gone
        deleted = db_session.get(Comment, comment_id)
        assert deleted is None


# ── Jira integration model tests ─────────────────────────────────────────────


class TestWorklogSubmissionModel:
    def test_create(self, db_session: Session) -> None:
        wls = WorklogSubmission(
            request_id="wlr_test123",
            target="TEMPO",
            tempo_issue_key="VIS-2",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Test worklog",
            overall_status="PENDING",
        )
        db_session.add(wls)
        db_session.commit()
        assert wls.id is not None

    def test_unique_request_id(self, db_session: Session) -> None:
        wls1 = WorklogSubmission(
            request_id="wlr_unique",
            target="TEMPO",
            tempo_issue_key="VIS-2",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="First",
            overall_status="PENDING",
        )
        db_session.add(wls1)
        db_session.commit()

        wls2 = WorklogSubmission(
            request_id="wlr_unique",  # duplicate
            target="JIRA",
            tempo_issue_key="VIS-2",
            work_date="2026-07-11",
            time_spent_seconds=1800,
            description="Second",
            overall_status="PENDING",
        )
        db_session.add(wls2)
        with pytest.raises(Exception, match="UNIQUE|IntegrityError"):
            db_session.commit()

    def test_nullable_fields(self, db_session: Session) -> None:
        wls = WorklogSubmission(
            request_id="wlr_nullable",
            target="BOTH",
            tempo_issue_key="VIS-2",
            external_issue_key=None,
            work_date="2026-07-11",
            started_at=None,
            time_spent_seconds=0,
            description="",
            overall_status="SUCCESS",
        )
        db_session.add(wls)
        db_session.commit()
        assert wls.external_issue_key is None
        assert wls.started_at is None


class TestWorklogSubmissionResultModel:
    def test_create(self, db_session: Session) -> None:
        wls = WorklogSubmission(
            request_id="wlr_result_test",
            target="TEMPO",
            tempo_issue_key="VIS-2",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Result test",
            overall_status="SUCCESS",
        )
        db_session.add(wls)
        db_session.commit()

        result = WorklogSubmissionResult(
            submission_id=wls.id,
            target_system="TEMPO",
            status="SUCCESS",
            external_id="12345",
            request_payload='{"timeSpentSeconds": 3600}',
        )
        db_session.add(result)
        db_session.commit()
        assert result.id is not None
        assert result.external_id == "12345"

    def test_cascade_delete(self, db_session: Session) -> None:
        """Deleting a WorklogSubmission cascades to its results."""
        wls = WorklogSubmission(
            request_id="wlr_cascade_test",
            target="TEMPO",
            tempo_issue_key="VIS-2",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Cascade test",
            overall_status="PENDING",
        )
        db_session.add(wls)
        db_session.commit()

        result = WorklogSubmissionResult(
            submission_id=wls.id,
            target_system="JIRA",
            status="PENDING",
            request_payload="{}",
        )
        db_session.add(result)
        db_session.commit()
        result_id = result.id

        db_session.delete(wls)
        db_session.commit()

        assert db_session.get(WorklogSubmissionResult, result_id) is None


class TestExternalHoursDailyModel:
    def test_create(self, db_session: Session) -> None:
        ehd = ExternalHoursDaily(
            work_date="2026-07-11",
            total_seconds=28800,
            source="tempo",
        )
        db_session.add(ehd)
        db_session.commit()
        assert ehd.work_date == "2026-07-11"
        assert ehd.total_seconds == 28800

    def test_default_values(self, db_session: Session) -> None:
        ehd = ExternalHoursDaily(work_date="2026-07-12")
        db_session.add(ehd)
        db_session.commit()
        assert ehd.total_seconds == 0
        assert ehd.source == "tempo"


class TestDailyHoursModel:
    def test_create(self, db_session: Session) -> None:
        dh = DailyHours(
            work_date="2026-07-11",
            hours_logged=8.0,
            source="tempo",
        )
        db_session.add(dh)
        db_session.commit()
        assert dh.id is not None
        assert dh.work_date == "2026-07-11"

    def test_unique_work_date(self, db_session: Session) -> None:
        dh1 = DailyHours(work_date="2026-07-11", hours_logged=8.0, source="tempo")
        db_session.add(dh1)
        db_session.commit()

        dh2 = DailyHours(work_date="2026-07-11", hours_logged=4.0, source="manual")
        db_session.add(dh2)
        with pytest.raises(Exception, match="UNIQUE|IntegrityError"):
            db_session.commit()


class TestTempoHoursDailyModel:
    def test_create(self, db_session: Session) -> None:
        thd = TempoHoursDaily(
            work_date="2026-07-11",
            hours_logged=8.0,
        )
        db_session.add(thd)
        db_session.commit()
        assert thd.work_date == "2026-07-11"
        assert thd.hours_logged == 8.0
        assert thd.confirmed_at is None

    def test_confirmed_at(self, db_session: Session) -> None:
        from datetime import datetime

        now = datetime.utcnow()
        thd = TempoHoursDaily(
            work_date="2026-07-11",
            hours_logged=8.0,
            confirmed_at=now,
        )
        db_session.add(thd)
        db_session.commit()
        assert thd.confirmed_at is not None


# ── Relationship tests ────────────────────────────────────────────────────────


class TestRelationships:
    def test_project_has_users(self, db_session: Session) -> None:
        p = _create_project(db_session)
        u1 = _create_user(db_session, p, name="User 1", email="u1@test.com")
        u2 = _create_user(db_session, p, name="User 2", email="u2@test.com")

        assert len(p.users) == 2
        assert u1 in p.users
        assert u2 in p.users

    def test_project_has_issues(self, db_session: Session) -> None:
        p = _create_project(db_session)
        _create_issue(db_session, p, title="Issue 1")
        _create_issue(db_session, p, title="Issue 2")

        db_session.refresh(p)
        assert len(p.issues) == 2

    def test_issue_belongs_to_project(self, db_session: Session) -> None:
        p = _create_project(db_session)
        i = _create_issue(db_session, p)

        assert i.project is not None
        assert i.project.id == p.id

    def test_comment_belongs_to_user_and_issue(self, db_session: Session) -> None:
        p = _create_project(db_session)
        u = _create_user(db_session, p)
        i = _create_issue(db_session, p)
        c = Comment(body="Test", userId=u.id, issueId=i.id)
        db_session.add(c)
        db_session.commit()

        assert c.user is not None
        assert c.user.id == u.id
        assert c.issue is not None
        assert c.issue.id == i.id

    def test_issue_users_many_to_many(self, db_session: Session) -> None:
        p = _create_project(db_session)
        u1 = _create_user(db_session, p, name="Dev 1", email="dev1@test.com")
        u2 = _create_user(db_session, p, name="Dev 2", email="dev2@test.com")
        i = _create_issue(db_session, p)

        # Add users via association
        i.users.append(u1)
        i.users.append(u2)
        db_session.commit()

        db_session.refresh(i)
        assert len(i.users) == 2
        assert u1 in i.users
        assert u2 in i.users

        # Test back-populates from user
        db_session.refresh(u1)
        assert i in u1.issues

    def test_worklog_submission_has_results(self, db_session: Session) -> None:
        wls = WorklogSubmission(
            request_id="wlr_rel_test",
            target="BOTH",
            tempo_issue_key="VIS-2",
            work_date="2026-07-11",
            time_spent_seconds=3600,
            description="Rel test",
            overall_status="PENDING",
        )
        db_session.add(wls)
        db_session.commit()

        r1 = WorklogSubmissionResult(
            submission_id=wls.id,
            target_system="TEMPO",
            status="PENDING",
            request_payload="{}",
        )
        r2 = WorklogSubmissionResult(
            submission_id=wls.id,
            target_system="JIRA",
            status="PENDING",
            request_payload="{}",
        )
        db_session.add_all([r1, r2])
        db_session.commit()

        db_session.refresh(wls)
        assert len(wls.results) == 2
        assert r1 in wls.results
        assert r2 in wls.results
