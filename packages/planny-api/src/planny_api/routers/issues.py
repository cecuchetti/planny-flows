"""Issues router — CRUD with search, project-scoped access, full detail.

All endpoints require authentication and operate within the caller's
project scope. Cross-project access returns 404 (``ENTITY_NOT_FOUND``).

Responses use camelCase keys matching the Node.js backend format exactly.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from planny_core.models.issue import Issue
from planny_core.models.user import User
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.dependencies import get_current_user, get_db
from planny_api.schemas.issue import CreateIssueRequest, UpdateIssueRequest
from planny_api.serializers import issue_partial, user_to_dict
from planny_api.services import issue_service

router = APIRouter(prefix="/issues", tags=["issues"])


def _issue_full_dict(issue: Issue) -> dict[str, object]:
    """Serialize an Issue with full detail: users, comments, comment authors.

    Builds on ``issue_partial`` and adds the ``users`` array (full user
    objects) and ``comments`` array (with nested ``user`` partials).
    This matches the Node ``GET /issues/:issueId`` response format.
    """
    result: dict[str, object] = dict(issue_partial(issue))

    # Users array — full user dicts (matches Node eager-load format)
    result["users"] = [user_to_dict(u) for u in issue.users] if issue.users else []

    # Comments array — with nested user partial
    comments_list: list[dict[str, object]] = []
    for comment in issue.comments or []:
        comment_dict: dict[str, object] = {
            "id": comment.id,
            "body": comment.body,
            "userId": comment.userId,
            "issueId": comment.issueId,
            "createdAt": comment.createdAt.isoformat() if comment.createdAt else None,
            "updatedAt": comment.updatedAt.isoformat() if comment.updatedAt else None,
        }
        if comment.user:
            comment_dict["user"] = user_to_dict(comment.user)
        comments_list.append(comment_dict)
    result["comments"] = comments_list

    return result


@router.get("")
async def get_project_issues(
    searchTerm: str | None = Query(default=None, alias="searchTerm"),  # noqa: N803
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Return all issues for the user's project, optionally filtered.

    When ``searchTerm`` is provided, issues are matched case-insensitively
    against ``title`` OR ``description_text`` (``LIKE`` semantics).
    Results are ordered by ``listPosition``.
    """
    issues = await issue_service.search_by_project(
        db,
        project_id=current_user.projectId,
        search_term=searchTerm,
    )
    return {"issues": [issue_partial(i) for i in issues]}


@router.get("/{issue_id}")
async def get_issue(
    issue_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Return a single issue with full detail.

    Includes eager-loaded ``users``, ``comments``, and comment ``user``
    objects. Cross-project access raises 404.
    """
    from planny_core.models import user_projects
    from sqlalchemy import select

    project_ids_result = await db.execute(
        select(user_projects.c.projectId).where(user_projects.c.userId == current_user.id)
    )
    user_project_ids = [int(row[0]) for row in project_ids_result.all()]

    issue = await issue_service.find_by_id_and_project(
        db,
        issue_id=issue_id,
        project_id=user_project_ids,
    )
    return {"issue": _issue_full_dict(issue)}


@router.post("", status_code=200)
async def create_issue(
    body: CreateIssueRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Create a new issue with auto-calculated ``listPosition``.

    ``listPosition`` is ``MAX(existing for project) + 1.0``. If
    ``reporterId`` is omitted in the request body, the current user's
    ID is used as the reporter.
    """
    new_issue = await issue_service.create_issue(
        db,
        data=body,
        project_id=current_user.projectId,
        reporter_id=current_user.id,
    )
    return {"issue": issue_partial(new_issue)}


@router.put("/{issue_id}")
async def update_issue(
    issue_id: int,
    body: UpdateIssueRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Update an existing issue's fields.

    Only the fields present in the request body are updated (partial
    update semantics). Returns the updated issue partial.
    Cross-project access raises 404.
    """
    from planny_core.models import user_projects
    from sqlalchemy import select

    project_ids_result = await db.execute(
        select(user_projects.c.projectId).where(user_projects.c.userId == current_user.id)
    )
    user_project_ids = [int(row[0]) for row in project_ids_result.all()]

    updated = await issue_service.update_issue(
        db,
        issue_id=issue_id,
        project_id=user_project_ids,
        data=body,
    )
    return {"issue": issue_partial(updated)}


@router.delete("/{issue_id}")
async def delete_issue(
    issue_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Delete an issue (cascades to comments).

    Returns a success message. Cross-project access raises 404.
    """
    from planny_core.models import user_projects
    from sqlalchemy import select

    project_ids_result = await db.execute(
        select(user_projects.c.projectId).where(user_projects.c.userId == current_user.id)
    )
    user_project_ids = [row[0] for row in project_ids_result.all()]

    await issue_service.delete_issue(
        db,
        issue_id=issue_id,
        project_id=user_project_ids,
    )
    return {"message": "Issue deleted"}
