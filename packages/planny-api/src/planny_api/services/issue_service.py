"""Issue service — CRUD with project-scoped access control and search.

All functions operate on the caller's project scope (via ``project_id``).
Cross-project access is denied at the query level.
"""

from __future__ import annotations

from planny_core.errors import EntityNotFoundError, ForbiddenError
from planny_core.models.comment import Comment
from planny_core.models.issue import Issue
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from planny_api.schemas.issue import CreateIssueRequest, UpdateIssueRequest


async def search_by_project(
    db: AsyncSession,
    project_id: int,
    search_term: str | None = None,
) -> list[Issue]:
    """Return all issues for a project, optionally filtered by searchTerm.

    When ``search_term`` is provided, the filter is a case-insensitive
    ``LIKE`` match on ``title`` OR ``description_text`` (``ilike`` on
    PostgreSQL; SQLite's ``like`` is already case-insensitive).

    Results are ordered by ``list_position`` to preserve board order.
    """
    stmt = (
        select(Issue)
        .where(Issue.projectId == project_id)
        .options(selectinload(Issue.users))
        .order_by(Issue.listPosition)
    )

    if search_term:
        pattern = f"%{search_term}%"
        stmt = stmt.where(
            or_(
                Issue.title.ilike(pattern),
                Issue.descriptionText.ilike(pattern),
            )
        )

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def find_by_id_and_project(
    db: AsyncSession,
    issue_id: int,
    project_id: int | list[int] | set[int],
) -> Issue:
    """Find a single issue by ID, scoped to the given project(s).

    Eager-loads ``users``, ``comments``, and ``comments.user`` so the
    full issue detail response has all nested data without additional
    lazy-load queries.

    Raises ``EntityNotFoundError`` if the issue does not exist or
    belongs to a different project.
    """
    stmt = (
        select(Issue)
        .where(Issue.id == issue_id)
        .options(
            selectinload(Issue.users),
            selectinload(Issue.comments).selectinload(Comment.user),
        )
    )

    if isinstance(project_id, (list, set, tuple)):
        stmt = stmt.where(Issue.projectId.in_(project_id))
    else:
        stmt = stmt.where(Issue.projectId == project_id)

    result = await db.execute(stmt)
    issue = result.scalars().first()

    if not issue:
        raise EntityNotFoundError("Issue")

    return issue


async def create_issue(
    db: AsyncSession,
    data: CreateIssueRequest,
    project_id: int,
    reporter_id: int,
) -> Issue:
    """Create a new issue with auto-calculated ``listPosition``.

    ``listPosition`` is computed as ``MAX(existing list_position for
    project) + 1.0``, so new issues always appear at the end of the
    board. A float is used so issues can be inserted between positions
    later.
    """
    # Calculate max list_position for this project
    max_pos_result = await db.execute(
        select(func.max(Issue.listPosition)).where(
            Issue.projectId == project_id
        )
    )
    max_pos: float | None = max_pos_result.scalar()
    list_position: float = (max_pos or 0.0) + 1.0

    # Resolve reporter — use provided value or default to current user
    resolved_reporter_id = data.reporterId if data.reporterId is not None else reporter_id  # noqa: N815

    issue = Issue(
        title=data.title,
        type=data.type.value,
        status=data.status.value,
        priority=data.priority.value,
        listPosition=list_position,
        description=data.description,
        estimate=data.estimate,
        timeSpent=data.timeSpent,  # noqa: N815
        timeRemaining=data.timeRemaining,  # noqa: N815
        reporterId=resolved_reporter_id,
        projectId=project_id,
    )

    db.add(issue)
    await db.flush()

    # Re-fetch with eager-loaded users so the serializer can access
    # ``issue.users`` without triggering an async-incompatible lazy load.
    stmt = (
        select(Issue)
        .where(Issue.id == issue.id)
        .options(selectinload(Issue.users))
    )
    result = await db.execute(stmt)
    return result.scalars().first()


async def update_issue(
    db: AsyncSession,
    issue_id: int,
    project_id: int,
    data: UpdateIssueRequest,
) -> Issue:
    """Update an existing issue with the provided fields.

    Only the fields present in ``data`` are updated (``exclude_unset``).
    The issue must belong to ``project_id`` or ``EntityNotFoundError``
    is raised.
    """
    issue = await find_by_id_and_project(db, issue_id, project_id)

    # Readonly guard: reject mutations on Jira-sourced issues,
    # except for timeSpent (needed for worklog tracking).
    if issue.readonly:
        update_data = data.model_dump(exclude_unset=True)
        non_time_fields = {k for k in update_data if k != "timeSpent"}
        if non_time_fields:
            raise ForbiddenError(
                message="Cannot modify a read-only Jira issue",
                code="ISSUE_READONLY",
            )

    update_data = data.model_dump(exclude_unset=True)
    # Pydantic field names match model attrs (both camelCase)
    for key, value in update_data.items():
        if value is not None:
            # Enum values need .value to store as string
            if hasattr(value, "value"):
                setattr(issue, key, value.value)
            else:
                setattr(issue, key, value)

    await db.flush()
    await db.refresh(issue)

    return issue


async def delete_issue(
    db: AsyncSession,
    issue_id: int,
    project_id: int,
) -> Issue:
    """Delete an issue (cascades to comments) and return the deleted entity.

    The issue must belong to ``project_id`` or ``EntityNotFoundError``
    is raised. Comments are deleted via the ``cascade="all, delete-orphan"``
    relationship on the ``Issue`` model.
    """
    issue = await find_by_id_and_project(db, issue_id, project_id)

    # Readonly guard: reject deletion of Jira-sourced issues
    if issue.readonly:
        raise ForbiddenError(
            message="Cannot delete a read-only Jira issue",
            code="ISSUE_READONLY",
        )

    await db.delete(issue)
    await db.flush()

    return issue
