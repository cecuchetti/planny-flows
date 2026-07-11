"""SQLAlchemy 2.0 models mirroring TypeORM entities exactly.

All 9 models plus the ``issue_users_user`` and ``user_projects`` junction
tables are exported here. Import directly from this module:

.. code:: python

    from planny_core.models import Project, User, Issue
"""

from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, Table

from planny_core.database import Base
from planny_core.models.comment import Comment
from planny_core.models.daily_hours import DailyHours
from planny_core.models.external_hours_daily import ExternalHoursDaily
from planny_core.models.issue import (
    Issue,  # noqa: F811 — re-export
    issue_users,  # noqa: F401 — register junction table
)
from planny_core.models.project import Project
from planny_core.models.tempo_hours_daily import TempoHoursDaily
from planny_core.models.user import User
from planny_core.models.worklog_submission import WorklogSubmission
from planny_core.models.worklog_submission_result import WorklogSubmissionResult

# ── Join table: User <-> Project (many-to-many) ──────────────────────────────
# Uses camelCase column names to match the rest of the TypeORM-sourced schema.
user_projects = Table(
    "user_projects",
    Base.metadata,
    Column("userId", Integer, ForeignKey("user.id"), primary_key=True),
    Column("projectId", Integer, ForeignKey("project.id"), primary_key=True),
)

__all__ = [
    "Base",
    "Comment",
    "DailyHours",
    "ExternalHoursDaily",
    "Issue",
    "Project",
    "TempoHoursDaily",
    "User",
    "WorklogSubmission",
    "WorklogSubmissionResult",
    "issue_users",
    "user_projects",
]
