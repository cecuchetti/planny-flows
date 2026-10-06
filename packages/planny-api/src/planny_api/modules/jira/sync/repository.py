"""Persistence for the Jira synchronisation.

Every statement the sync issues against the database lives here, so the service
reads as an algorithm and the queries are reviewable in one place.
"""

from __future__ import annotations

from collections.abc import Iterable

from planny_core.config import settings
from planny_core.enums import ProjectSourceType
from planny_core.models import Issue, Project, User, user_projects
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

__all__ = [
    "close_orphan_issues",
    "ensure_user_project_link",
    "existing_issue_keys",
    "find_issue_by_external_key",
    "get_or_create_project",
    "get_or_create_user",
    "get_user",
    "max_list_position",
]


async def get_user(db: AsyncSession, user_id: int) -> User | None:
    """Load a user by primary key."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalars().first()


async def get_or_create_user(
    db: AsyncSession,
    name: str,
    email: str,
    avatar_url: str | None = None,
) -> User:
    """Return the user with *email*, creating one if needed.

    Matching on email is what keeps a Jira account mapped to a single local row
    across syncs.
    """
    normalised = email.lower().strip()
    result = await db.execute(select(User).where(User.email == normalised))
    user = result.scalars().first()
    if user is not None:
        return user

    user = User(
        name=name,
        email=normalised,
        avatarUrl=avatar_url or settings.integration_default_avatar_url,
    )
    db.add(user)
    await db.flush()
    return user


async def ensure_user_project_link(db: AsyncSession, user_id: int, project_id: int) -> None:
    """Associate a user with a project if the association is missing."""
    existing = await db.execute(
        select(user_projects.c.userId).where(
            user_projects.c.userId == user_id,
            user_projects.c.projectId == project_id,
        )
    )
    if existing.first() is not None:
        return

    await db.execute(user_projects.insert().values(userId=user_id, projectId=project_id))


async def get_or_create_project(
    db: AsyncSession,
    *,
    external_key: str,
    name: str,
) -> Project:
    """Return the local project for a Jira project key, creating it if needed.

    The name is refreshed on every sync so a rename in Jira propagates.
    """
    result = await db.execute(select(Project).where(Project.external_key == external_key))
    project = result.scalars().first()

    if project is not None:
        project.name = name
        return project

    project = Project(
        name=name,
        source_type=ProjectSourceType.JIRA.value,
        external_key=external_key,
        category=settings.sync_default_project_category,
    )
    db.add(project)
    await db.flush()  # the caller needs project.id immediately
    return project


async def existing_issue_keys(db: AsyncSession, project_id: int) -> set[str]:
    """External keys of the Jira issues already tracked for a project."""
    result = await db.execute(
        select(Issue.external_key).where(
            Issue.projectId == project_id,
            Issue.source_type == ProjectSourceType.JIRA.value,
        )
    )
    return {row[0] for row in result.all() if row[0] is not None}


async def max_list_position(db: AsyncSession, project_id: int) -> float:
    """Highest ``listPosition`` in a project, or ``0.0`` when it is empty."""
    result = await db.execute(
        select(func.max(Issue.listPosition)).where(Issue.projectId == project_id)
    )
    return float(result.scalar() or 0.0)


async def find_issue_by_external_key(db: AsyncSession, external_key: str) -> Issue | None:
    """Load a Jira issue by its key, with its assignees eagerly loaded."""
    result = await db.execute(
        select(Issue)
        .where(Issue.external_key == external_key)
        .options(selectinload(Issue.users))
    )
    return result.scalars().first()


async def close_orphan_issues(
    db: AsyncSession,
    project_ids: Iterable[int],
    keep_keys: set[str],
) -> int:
    """Mark tracked issues absent from Jira as done.

    These are issues that were previously assigned to the user and no longer
    are, or that were closed upstream.

    Returns:
        How many issues were closed.
    """
    project_ids = list(project_ids)
    if not project_ids:
        return 0

    query = select(Issue).where(
        Issue.source_type == ProjectSourceType.JIRA.value,
        Issue.projectId.in_(project_ids),
    )
    if keep_keys:
        query = query.where(~Issue.external_key.in_(keep_keys))

    result = await db.execute(query)
    orphans = result.scalars().all()
    for orphan in orphans:
        orphan.status = "done"
    return len(orphans)
