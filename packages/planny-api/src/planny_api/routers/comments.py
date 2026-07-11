"""Comment CRUD router — mirrors ``api/src/controllers/comments.ts``.

All endpoints require authentication and are scoped to the current
user's project. Users can only edit or delete their own comments.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from planny_core.errors import EntityNotFoundError
from planny_core.models import Comment, Issue, User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from planny_api.dependencies import get_current_user, get_db
from planny_api.schemas.comment import CreateCommentRequest, UpdateCommentRequest
from planny_api.serializers import user_to_dict

router = APIRouter(prefix="/comments", tags=["comments"])


# ── Serializer (kept here — only used for comments) ─────────────────────────


def comment_to_dict(comment: Comment) -> dict[str, object]:
    """Serialize a Comment with its nested user (camelCase keys).

    Matches the Node ``commentPartial`` response format exactly.
    """
    return {
        "id": comment.id,
        "body": comment.body,
        "userId": comment.userId,
        "issueId": comment.issueId,
        "createdAt": comment.createdAt.isoformat() if comment.createdAt else None,
        "updatedAt": comment.updatedAt.isoformat() if comment.updatedAt else None,
        "user": user_to_dict(comment.user) if comment.user else None,
    }


# ── POST /comments ──────────────────────────────────────────────────────────


@router.post("")
async def create_comment(
    body: CreateCommentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Create a comment on an issue in the current user's project.

    Verifies the issue exists and belongs to the user's project (404
    otherwise).  The ``user_id`` is always set to ``current_user.id``.
    Returns the comment with a nested ``user`` object.
    """
    # Verify issue exists and belongs to user's project
    issue = await db.get(Issue, body.issue_id)
    if not issue or issue.projectId != current_user.projectId:
        raise EntityNotFoundError("Issue")

    comment = Comment(
        body=body.body,
        userId=current_user.id,
        issueId=body.issue_id,
    )
    db.add(comment)
    await db.flush()

    # Reload with user relationship eagerly loaded for the response
    stmt = (
        select(Comment)
        .where(Comment.id == comment.id)
        .options(selectinload(Comment.user))
    )
    result = await db.execute(stmt)
    comment = result.scalars().one()

    return {"comment": comment_to_dict(comment)}


# ── PUT /comments/{comment_id} ──────────────────────────────────────────────


@router.put("/{comment_id}")
async def update_comment(
    comment_id: int,
    body: UpdateCommentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Update the body of a comment owned by the current user.

    Loads the comment (with issue and user relationships), verifies
    ownership, updates ``body``, and returns the updated comment.
    Returns 404 if the comment doesn't exist or belongs to another user.
    """
    stmt = (
        select(Comment)
        .where(Comment.id == comment_id)
        .options(joinedload(Comment.issue), selectinload(Comment.user))
    )
    result = await db.execute(stmt)
    comment = result.scalars().first()

    if not comment:
        raise EntityNotFoundError("Comment")
    if comment.userId != current_user.id:
        raise EntityNotFoundError("Comment")

    comment.body = body.body
    await db.flush()

    return {"comment": comment_to_dict(comment)}


# ── DELETE /comments/{comment_id} ────────────────────────────────────────────


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Delete a comment owned by the current user.

    Returns 404 if the comment doesn't exist or belongs to another user.
    """
    comment = await db.get(Comment, comment_id)

    if not comment:
        raise EntityNotFoundError("Comment")
    if comment.userId != current_user.id:
        raise EntityNotFoundError("Comment")

    await db.delete(comment)
    await db.flush()

    return {"message": "Comment deleted"}
