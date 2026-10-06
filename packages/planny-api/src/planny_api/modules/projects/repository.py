"""Persistence for projects.

Every query that needs authorization takes the owning ``user_id`` and joins
through ``user_projects``, so a caller cannot accidentally read another user's
data by passing a raw id.
"""

from __future__ import annotations

from planny_core.models import Issue, Project, user_projects
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

__all__ = [
    "get_with_details",
    "get_with_users",
    "list_authorized_by_ids",
    "list_for_user",
]

_DETAIL_OPTIONS = (
    selectinload(Project.issues).selectinload(Issue.users),
    selectinload(Project.users),
)


async def list_for_user(db: AsyncSession, user_id: int) -> list[Project]:
    """Return every project the user belongs to, ordered by name, issues loaded.

    Issues are eager-loaded because the caller reports an issue count.
    """
    result = await db.execute(
        select(Project)
        .join(user_projects, user_projects.c.projectId == Project.id)
        .where(user_projects.c.userId == user_id)
        .options(selectinload(Project.issues))
        .order_by(Project.name)
    )
    return list(result.scalars().unique().all())


async def get_with_details(db: AsyncSession, project_id: int) -> Project | None:
    """Load one project with its users and its issues' users."""
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(*_DETAIL_OPTIONS)
    )
    return result.scalars().first()


async def get_with_users(db: AsyncSession, project_id: int) -> Project | None:
    """Load one project with only its users."""
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(selectinload(Project.users))
    )
    return result.scalars().first()


async def list_authorized_by_ids(
    db: AsyncSession,
    user_id: int,
    project_ids: set[int],
) -> list[Project]:
    """Load the subset of *project_ids* the user is a member of.

    Filtering by ``user_id`` here — rather than trusting the requested ids — is
    what keeps a caller from reading a project they do not belong to.
    """
    if not project_ids:
        return []

    result = await db.execute(
        select(Project)
        .join(user_projects, user_projects.c.projectId == Project.id)
        .where(Project.id.in_(project_ids))
        .where(user_projects.c.userId == user_id)
        .options(*_DETAIL_OPTIONS)
    )
    return list(result.scalars().unique().all())
