"""Jira synchronisation: pulls issues assigned to a user into the local database.

Orchestration only — field mapping lives in :mod:`mapping` and every query in
:mod:`repository`.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from planny_core.config import settings
from planny_core.models import Issue, Project, User
from planny_jira.client import JiraHttpClient
from planny_jira.constants import JIRA_SEARCH_FIELDS, JIRA_SEARCH_PATH
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.modules.jira.sync import repository
from planny_api.modules.jira.sync.mapping import (
    jira_user_identity,
    map_jira_issue_to_local,
)

__all__ = ["should_auto_sync", "sync_external_projects"]

logger = structlog.get_logger(__name__)

#: Jira fields refreshed on an existing issue. ``listPosition`` is deliberately
#: excluded: a sync must not reshuffle a board the user has arranged.
_SYNCED_ISSUE_FIELDS = (
    "title",
    "type",
    "status",
    "priority",
    "description",
    "estimate",
    "timeSpent",
    "timeRemaining",
    "createdAt",
    "reporterId",
)


def should_auto_sync(project: Project, *, now: datetime | None = None) -> bool:
    """Whether a Jira project is due for a refresh.

    A project qualifies when it has never been synced, or when the last sync is
    older than ``settings.sync_interval_minutes``.
    """
    if project.last_synced_at is None:
        return True

    reference = now or datetime.now(UTC).replace(tzinfo=None)
    stale_after = timedelta(minutes=settings.sync_interval_minutes)
    return (reference - project.last_synced_at) > stale_after


async def _fetch_assigned_issues(jira_client: JiraHttpClient) -> list[dict[str, Any]]:
    """Fetch every issue assigned to the current user, following pagination."""
    issues: list[dict[str, Any]] = []
    next_page_token: str | None = None

    while True:
        params: dict[str, Any] = {
            "jql": settings.sync_jql,
            "maxResults": settings.sync_page_size,
            "fields": JIRA_SEARCH_FIELDS,
        }
        if next_page_token:
            params["nextPageToken"] = next_page_token

        response: dict[str, Any] = await jira_client.get(JIRA_SEARCH_PATH, params=params)
        issues.extend(response.get("issues", []))

        next_page_token = response.get("nextPageToken")
        if response.get("isLast") or not next_page_token:
            break

    return issues


def _group_by_project(issues: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group Jira issues by their project key."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for issue in issues:
        project = (issue.get("fields") or {}).get("project") or {}
        key = project.get("key")
        if key:
            grouped.setdefault(key, []).append(issue)
    return grouped


def _project_display_name(issues: list[dict[str, Any]], fallback: str) -> str:
    """Read the project name from the first issue, falling back to its key."""
    project = (issues[0].get("fields") or {}).get("project") or {}
    return project.get("name") or fallback


async def _resolve_user(
    db: AsyncSession,
    user_data: dict[str, Any] | None,
    *,
    project_id: int,
) -> User | None:
    """Resolve a Jira user payload to a local user, creating and linking if needed.

    Returns ``None`` when the payload carries no usable identity, so the caller
    can fall back to the user performing the sync.
    """
    identity = jira_user_identity(user_data)
    if identity is None:
        return None

    name, email, avatar_url = identity
    user = await repository.get_or_create_user(db, name, email, avatar_url)
    await repository.ensure_user_project_link(db, user.id, project_id)
    return user


async def _upsert_issue(
    db: AsyncSession,
    jira_issue: dict[str, Any],
    *,
    project_id: int,
    reporter_id: int,
    position: float,
    already_tracked: bool,
    syncing_user: User | None,
    fallback_user_id: int,
) -> None:
    """Create or refresh the local row for one Jira issue."""
    fields = jira_issue.get("fields") or {}
    mapped = map_jira_issue_to_local(jira_issue, project_id, reporter_id, position)

    # An issue with no assignee in Jira stays assigned to the user syncing it,
    # which mirrors what the previous implementation did.
    assignee = await _resolve_user(db, fields.get("assignee"), project_id=project_id)
    first_assignee: User | None = assignee or syncing_user
    assignees: list[User] = [first_assignee] if first_assignee is not None else []

    if already_tracked:
        existing = await repository.find_issue_by_external_key(db, mapped["external_key"])
        if existing is None:  # pragma: no cover - the key came from the same query
            return
        for field in _SYNCED_ISSUE_FIELDS:
            setattr(existing, field, mapped[field])
        existing.users = assignees
        return

    created = Issue(**mapped)
    created.users = assignees
    db.add(created)


async def _resolve_reporter_id(
    db: AsyncSession,
    jira_issue: dict[str, Any],
    *,
    project_id: int,
    syncing_user: User | None,
    fallback_user_id: int,
) -> int:
    """Resolve the local reporter for an issue, defaulting to the syncing user."""
    reporter = await _resolve_user(
        db, (jira_issue.get("fields") or {}).get("reporter"), project_id=project_id
    )
    if reporter is not None:
        return reporter.id
    return syncing_user.id if syncing_user is not None else fallback_user_id


async def sync_external_projects(
    user_id: int,
    db: AsyncSession,
    jira_client: JiraHttpClient,
) -> dict[str, int]:
    """Synchronise the Jira issues assigned to *user_id*.

    Steps:

    1. Fetch the user's open issues from Jira, following pagination.
    2. Group them by Jira project key.
    3. For each project, upsert the local project and the user association.
    4. Upsert each issue: refresh a tracked one, create an unknown one.
    5. Mark tracked issues absent from the response as done.
    6. Stamp ``last_synced_at`` on every project that was touched.

    Returns:
        ``{"projects_synced", "issues_upserted", "issues_closed"}``.
    """
    syncing_user = await repository.get_user(db, user_id)
    issues = await _fetch_assigned_issues(jira_client)
    projects_map = _group_by_project(issues)

    synced_project_ids: list[int] = []
    issues_upserted = 0
    projects_synced = 0

    for project_key, project_issues in projects_map.items():
        project = await repository.get_or_create_project(
            db,
            external_key=project_key,
            name=_project_display_name(project_issues, project_key),
        )
        synced_project_ids.append(project.id)
        projects_synced += 1

        await repository.ensure_user_project_link(db, user_id, project.id)

        tracked_keys = await repository.existing_issue_keys(db, project.id)
        max_position = await repository.max_list_position(db, project.id)
        position_offset = 0

        for jira_issue in project_issues:
            issue_key = jira_issue.get("key")
            if issue_key is None:
                continue

            reporter_id = await _resolve_reporter_id(
                db,
                jira_issue,
                project_id=project.id,
                syncing_user=syncing_user,
                fallback_user_id=user_id,
            )

            await _upsert_issue(
                db,
                jira_issue,
                project_id=project.id,
                reporter_id=reporter_id,
                position=max_position + float(position_offset),
                already_tracked=issue_key in tracked_keys,
                syncing_user=syncing_user,
                fallback_user_id=user_id,
            )
            if issue_key not in tracked_keys:
                position_offset += 1
            issues_upserted += 1

        project.last_synced_at = datetime.now(UTC).replace(tzinfo=None)

    issues_closed = await repository.close_orphan_issues(
        db,
        synced_project_ids,
        {issue["key"] for issue in issues if issue.get("key")},
    )

    await db.flush()
    logger.info(
        "jira_sync.completed",
        user_id=user_id,
        projects_synced=projects_synced,
        issues_upserted=issues_upserted,
        issues_closed=issues_closed,
    )

    return {
        "projects_synced": projects_synced,
        "issues_upserted": issues_upserted,
        "issues_closed": issues_closed,
    }
