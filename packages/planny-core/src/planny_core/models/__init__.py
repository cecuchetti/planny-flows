"""SQLAlchemy 2.0 models mirroring TypeORM entities exactly.

All 9 models plus the ``issue_users_user`` junction table are exported here.
Import directly from this module:

.. code:: python

    from planny_core.models import Project, User, Issue
"""

from __future__ import annotations

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
]
