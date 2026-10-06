"""Pydantic models for Project CRUD operations."""

from __future__ import annotations

from planny_core.enums import ProjectCategory
from pydantic import BaseModel


class UpdateProjectRequest(BaseModel):
    """Request body for ``PUT /project``.

    All fields are optional so callers can send a partial update.
    Validation ensures ``category`` is one of the allowed enum values.
    """

    name: str | None = None
    url: str | None = None
    description: str | None = None
    category: ProjectCategory | None = None
