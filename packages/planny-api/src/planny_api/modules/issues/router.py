"""Issue router — CRUD with search and project-scoped access.

Validation and serialization only; the rules live in
:mod:`planny_api.modules.issues.service` and authorization in
:class:`~planny_api.core.security.policies.ProjectScope`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from planny_core.models import Issue
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.core.security.policies import ProjectScope, get_project_scope
from planny_api.dependencies import get_db
from planny_api.modules.issues import service
from planny_api.modules.issues.schemas import CreateIssueRequest, UpdateIssueRequest
from planny_api.modules.issues.serializers import issue_detail
from planny_api.serializers import issue_partial

router = APIRouter(prefix="/issues", tags=["issues"])


@router.get("")
async def get_project_issues(
    search_term: str | None = Query(default=None, alias="searchTerm"),
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """List the caller's issues, optionally filtered by a search term."""
    issues = await service.search_issues(db, scope, search_term=search_term)
    return {"issues": [issue_partial(issue) for issue in issues]}


@router.get("/{issue_id}")
async def get_issue(
    issue_id: int,
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Return a single issue with its users and comments."""
    issue: Issue = await service.get_issue(db, scope, issue_id)
    return {"issue": issue_detail(issue)}


@router.post("", status_code=201)
async def create_issue(
    body: CreateIssueRequest,
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Create an issue in the caller's default project."""
    issue = await service.create_issue(db, scope, body)
    return {"issue": issue_partial(issue)}


@router.put("/{issue_id}")
async def update_issue(
    issue_id: int,
    body: UpdateIssueRequest,
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Partially update an issue."""
    issue = await service.update_issue(db, scope, issue_id, body)
    return {"issue": issue_partial(issue)}


@router.delete("/{issue_id}", status_code=204)
async def delete_issue(
    issue_id: int,
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an issue and its comments.

    Returns 204 with no body: the resource is gone, so there is nothing to
    describe.
    """
    await service.delete_issue(db, scope, issue_id)
