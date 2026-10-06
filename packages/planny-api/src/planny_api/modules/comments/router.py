"""Comment router — CRUD scoped to the caller's projects.

Validation and serialization only; queries live in
:mod:`planny_api.modules.comments.repository` and authorization in
:class:`~planny_api.core.security.policies.ProjectScope`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from planny_core.errors import EntityNotFoundError
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.core.security.policies import ProjectScope, get_project_scope
from planny_api.dependencies import get_db
from planny_api.modules.comments import repository
from planny_api.modules.comments.schemas import CreateCommentRequest, UpdateCommentRequest
from planny_api.modules.comments.serializers import comment_to_dict

router = APIRouter(prefix="/comments", tags=["comments"])


@router.post("", status_code=201)
async def create_comment(
    body: CreateCommentRequest,
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Add a comment to an issue the caller can see.

    Raises:
        EntityNotFoundError: the issue does not exist or is out of scope.
    """
    issue = await repository.find_issue(db, body.issue_id)
    if issue is None or not scope.allows(issue.projectId):
        raise EntityNotFoundError("Issue")

    comment = await repository.add(
        db, body=body.body, issue_id=body.issue_id, user_id=scope.user_id
    )
    return {"comment": comment_to_dict(comment)}


@router.put("/{comment_id}")
async def update_comment(
    comment_id: int,
    body: UpdateCommentRequest,
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Edit a comment the caller wrote.

    Raises:
        EntityNotFoundError: the comment does not exist or belongs to someone else.
    """
    comment = await repository.find_owned(db, comment_id, scope.user_id)
    if comment is None:
        raise EntityNotFoundError("Comment")

    comment.body = body.body
    await db.flush()
    return {"comment": comment_to_dict(comment)}


@router.delete("/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: int,
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a comment the caller wrote.

    Returns 204 with no body.

    Raises:
        EntityNotFoundError: the comment does not exist or belongs to someone else.
    """
    comment = await repository.find_owned(db, comment_id, scope.user_id)
    if comment is None:
        raise EntityNotFoundError("Comment")

    await db.delete(comment)
    await db.flush()
