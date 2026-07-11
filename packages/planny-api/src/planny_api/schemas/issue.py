"""Pydantic models for Issue CRUD operations.

Request schemas match the Node.js controller's expected input format.
All fields use camelCase aliases to match the frontend convention.
"""

from __future__ import annotations

from planny_core.enums import IssuePriority, IssueStatus, IssueType
from pydantic import BaseModel, Field


class CreateIssueRequest(BaseModel):
    """Request body for ``POST /issues``.

    ``title``, ``type``, ``status``, and ``priority`` are required.
    ``description``, ``estimate``, ``timeSpent``, and ``timeRemaining``
    are optional. ``reporterId`` is optional — if omitted the current
    user's ID will be used.
    """

    title: str = Field(min_length=1, max_length=200)
    type: IssueType
    status: IssueStatus
    priority: IssuePriority
    description: str | None = None
    estimate: int | None = None
    timeSpent: int | None = None  # noqa: N815
    timeRemaining: int | None = None  # noqa: N815
    reporterId: int | None = None  # noqa: N815


class UpdateIssueRequest(BaseModel):
    """Request body for ``PUT /issues/:issueId``.

    All fields are optional so callers can send a partial update.
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    type: IssueType | None = None
    status: IssueStatus | None = None
    priority: IssuePriority | None = None
    description: str | None = None
    estimate: int | None = None
    timeSpent: int | None = None  # noqa: N815
    timeRemaining: int | None = None  # noqa: N815
