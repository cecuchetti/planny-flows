"""Persistence for issues.

Queries that need authorization take the caller's project ids and filter by them,
so an issue outside the caller's scope is simply not found.
"""

from __future__ import annotations

from collections.abc import Iterable

from planny_core.models import Comment, Issue
from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

__all__ = [
    "find_with_comments",
    "find_with_users",
    "max_list_position",
    "search_in_project",
]


def _scope_filter(project_ids: int | Iterable[int]) -> ColumnElement[bool]:
    """Build the project filter for *project_ids*."""
    if isinstance(project_ids, int):
        return Issue.projectId == project_ids
    return Issue.projectId.in_(list(project_ids))


async def search_in_project(
    db: AsyncSession,
    project_ids: int | Iterable[int],
    search_term: str | None = None,
) -> list[Issue]:
    """Return issues in scope, optionally filtered by *search_term*.

    The search is a case-insensitive match on title OR description text.
    Results keep board order.
    """
    stmt = (
        select(Issue)
        .where(_scope_filter(project_ids))
        .options(selectinload(Issue.users))
        .order_by(Issue.listPosition)
    )

    if search_term:
        pattern = f"%{search_term}%"
        stmt = stmt.where(
            or_(Issue.title.ilike(pattern), Issue.descriptionText.ilike(pattern))
        )

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def find_with_comments(
    db: AsyncSession,
    issue_id: int,
    project_ids: int | Iterable[int],
) -> Issue | None:
    """Load one issue with its users, comments and comment authors.

    Eager loading avoids the async lazy-load trap when serializing the detail
    response.
    """
    result = await db.execute(
        select(Issue)
        .where(Issue.id == issue_id)
        .where(_scope_filter(project_ids))
        .options(
            selectinload(Issue.users),
            selectinload(Issue.comments).selectinload(Comment.user),
        )
    )
    return result.scalars().first()


async def find_with_users(db: AsyncSession, issue_id: int) -> Issue | None:
    """Load one issue with its assigned users eagerly loaded."""
    result = await db.execute(
        select(Issue).where(Issue.id == issue_id).options(selectinload(Issue.users))
    )
    return result.scalars().first()


async def max_list_position(db: AsyncSession, project_id: int) -> float:
    """Return the highest ``listPosition`` in the project, or ``0.0``."""
    result = await db.execute(
        select(func.max(Issue.listPosition)).where(Issue.projectId == project_id)
    )
    return float(result.scalar() or 0.0)
