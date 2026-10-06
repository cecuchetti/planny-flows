"""Persistence for comments.

Ownership is enforced in the query itself, so a comment belonging to someone
else is simply not found.
"""

from __future__ import annotations

from planny_core.models import Comment, Issue
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

__all__ = ["add", "find_issue", "find_owned", "get_with_user"]


async def add(db: AsyncSession, *, body: str, issue_id: int, user_id: int) -> Comment:
    """Insert a comment and return it with its author loaded."""
    comment = Comment(body=body, issueId=issue_id, userId=user_id)
    db.add(comment)
    await db.flush()

    loaded = await get_with_user(db, comment.id)
    # The row was just inserted, so it exists; keep the contract honest anyway.
    return loaded if loaded is not None else comment


async def get_with_user(db: AsyncSession, comment_id: int) -> Comment | None:
    """Load a comment with its author eagerly loaded.

    Eager loading matters: serializing a lazily-loaded relationship inside an
    async session raises.
    """
    result = await db.execute(
        select(Comment).where(Comment.id == comment_id).options(selectinload(Comment.user))
    )
    return result.scalars().first()


async def find_owned(db: AsyncSession, comment_id: int, user_id: int) -> Comment | None:
    """Load a comment only if *user_id* is its author.

    Returning ``None`` for someone else's comment is deliberate: the caller
    answers 404 rather than 403, so the API does not confirm that the comment
    exists.
    """
    result = await db.execute(
        select(Comment)
        .where(Comment.id == comment_id)
        .where(Comment.userId == user_id)
        .options(selectinload(Comment.user))
    )
    return result.scalars().first()


async def find_issue(db: AsyncSession, issue_id: int) -> Issue | None:
    """Load an issue by primary key."""
    return await db.get(Issue, issue_id)
