"""Domain enums matching the TypeScript constants.

All enums use ``StrEnum`` so they serialize as their string values
in JSON responses (matching the Node backend behaviour).
"""

from __future__ import annotations

from enum import StrEnum


class IssueType(StrEnum):
    """Issue type mirroring ``api/src/constants/issues.ts``."""

    TASK = "task"
    BUG = "bug"
    STORY = "story"


class IssueStatus(StrEnum):
    """Issue status mirroring ``api/src/constants/issues.ts``."""

    BACKLOG = "backlog"
    SELECTED = "selected"
    INPROGRESS = "inprogress"
    DONE = "done"


class IssuePriority(StrEnum):
    """Issue priority mirroring ``api/src/constants/issues.ts``.

    Stored as strings so they are JSON-safe and sortable.
    """

    HIGHEST = "5"
    HIGH = "4"
    MEDIUM = "3"
    LOW = "2"
    LOWEST = "1"


class ProjectCategory(StrEnum):
    """Project category mirroring ``api/src/constants/projects.ts``."""

    SOFTWARE = "software"
    MARKETING = "marketing"
    BUSINESS = "business"


class ProjectSourceType(StrEnum):
    """Source of a project/issue — local or synced from Jira."""

    LOCAL = "local"
    JIRA = "jira"
