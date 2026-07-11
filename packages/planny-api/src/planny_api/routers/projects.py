"""Project router — ``GET /project`` and ``PUT /project``.

These endpoints require authentication and return project data
matching the Node ``GET /project`` and ``PUT /project`` formats.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from planny_core.errors import EntityNotFoundError
from planny_core.models.issue import Issue
from planny_core.models.project import Project
from planny_core.models.user import User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from planny_api.dependencies import get_current_user, get_db
from planny_api.schemas.project import UpdateProjectRequest
from planny_api.serializers import project_to_dict

router = APIRouter(prefix="/project", tags=["projects"])


@router.get("")
async def get_project(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Return the user's project with issues (as partials) and users.

    Eager-loads ``issues`` -> ``issues.users`` and ``project.users``
    to avoid lazy-loading issues in async mode.
    """
    stmt = (
        select(Project)
        .where(Project.id == current_user.projectId)
        .options(
            selectinload(Project.issues).selectinload(Issue.users),
            selectinload(Project.users),
        )
    )
    result = await db.execute(stmt)
    project = result.scalars().first()

    if not project:
        raise EntityNotFoundError("Project")

    return {"project": project_to_dict(project)}


@router.put("")
async def update_project(
    body: UpdateProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Update the user's project fields and return the updated project.

    Only the fields present in the request body are updated.
    Returns the full project dict (with users, without issues
    to match Node ``PUT /project`` behaviour).
    """
    # Load project with users eager-loaded for serialization
    stmt = (
        select(Project)
        .where(Project.id == current_user.projectId)
        .options(selectinload(Project.users))
    )
    result = await db.execute(stmt)
    project = result.scalars().first()

    if not project:
        raise EntityNotFoundError("Project")

    # Apply partial updates from the validated request body
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    await db.flush()
    # onupdate for updated_at runs at flush time, so the entity
    # already has the new timestamp — no refresh needed.

    return {"project": project_to_dict(project, include_issues=False)}
