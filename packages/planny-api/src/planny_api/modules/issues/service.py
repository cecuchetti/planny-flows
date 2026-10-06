"""Issue business rules.

Authorization comes from :class:`~planny_api.core.security.policies.ProjectScope`
rather than a bespoke query per endpoint, so every operation enforces the same
rule.
"""

from __future__ import annotations

from planny_core.errors import EntityNotFoundError, ErrorCode, ForbiddenError
from planny_core.models import Issue
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.core.security.policies import ProjectScope
from planny_api.modules.issues import repository
from planny_api.modules.issues.schemas import CreateIssueRequest, UpdateIssueRequest

__all__ = ["create_issue", "delete_issue", "get_issue", "search_issues", "update_issue"]


async def search_issues(
    db: AsyncSession,
    scope: ProjectScope,
    search_term: str | None = None,
) -> list[Issue]:
    """Return issues for the caller's default project, optionally filtered.

    Note: the board's search is scoped to the *default* project, while the
    single-issue endpoints accept any project the caller belongs to. That
    asymmetry predates this refactor and is preserved deliberately — changing it
    would alter what the board search returns. It is recorded as a known
    inconsistency rather than silently "fixed" here.
    """
    if scope.default_project_id is None:
        return []
    return await repository.search_in_project(
        db, scope.default_project_id, search_term=search_term
    )


async def get_issue(db: AsyncSession, scope: ProjectScope, issue_id: int) -> Issue:
    """Return one issue with full detail.

    Raises:
        EntityNotFoundError: the issue does not exist or is outside the caller's
            projects.
    """
    issue = await repository.find_with_comments(db, issue_id, scope.project_ids)
    if issue is None:
        raise EntityNotFoundError("Issue")
    return issue


async def create_issue(
    db: AsyncSession,
    scope: ProjectScope,
    data: CreateIssueRequest,
) -> Issue:
    """Create an issue in the caller's default project.

    ``listPosition`` is ``MAX(existing) + 1`` so new issues land at the end of
    the board; a float leaves room to insert between positions later.

    Raises:
        EntityNotFoundError: the caller has no default project.
    """
    project_id = scope.require_default()
    list_position = await repository.max_list_position(db, project_id) + 1.0

    issue = Issue(
        title=data.title,
        type=data.type.value,
        status=data.status.value,
        priority=data.priority.value,
        listPosition=list_position,
        description=data.description,
        estimate=data.estimate,
        timeSpent=data.timeSpent,
        timeRemaining=data.timeRemaining,
        reporterId=data.reporterId if data.reporterId is not None else scope.user_id,
        projectId=project_id,
    )
    db.add(issue)
    await db.flush()

    created = await repository.find_with_users(db, issue.id)
    if created is None:  # pragma: no cover - the row was just inserted
        raise EntityNotFoundError("Issue")
    return created


async def update_issue(
    db: AsyncSession,
    scope: ProjectScope,
    issue_id: int,
    data: UpdateIssueRequest,
) -> Issue:
    """Apply a partial update to an issue in scope.

    Raises:
        EntityNotFoundError: the issue is missing or out of scope.
        ForbiddenError: the issue is Jira-sourced. ``timeSpent`` is the single
            exception, because worklog tracking writes to it.
    """
    issue = await get_issue(db, scope, issue_id)
    update_data = data.model_dump(exclude_unset=True)

    if issue.readonly and {key for key in update_data if key != "timeSpent"}:
        raise ForbiddenError(
            message="Cannot modify a read-only Jira issue",
            code=ErrorCode.ISSUE_READONLY,
        )

    for key, value in update_data.items():
        if value is None:
            continue
        # Enum members are stored as their string value.
        setattr(issue, key, value.value if hasattr(value, "value") else value)

    await db.flush()
    await db.refresh(issue)
    return issue


async def delete_issue(db: AsyncSession, scope: ProjectScope, issue_id: int) -> Issue:
    """Delete an issue in scope; comments cascade.

    Raises:
        EntityNotFoundError: the issue is missing or out of scope.
        ForbiddenError: the issue is Jira-sourced.
    """
    issue = await get_issue(db, scope, issue_id)

    if issue.readonly:
        raise ForbiddenError(
            message="Cannot delete a read-only Jira issue",
            code=ErrorCode.ISSUE_READONLY,
        )

    await db.delete(issue)
    await db.flush()
    return issue
