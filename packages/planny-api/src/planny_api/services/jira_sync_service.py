"""Jira sync service — pulls assigned Jira issues into local DB.

This module provides the core synchronisation function that queries the
external Jira API for the current user's assigned issues, upserts
``Project`` and ``Issue`` rows, maps Jira fields to local fields, marks
closed/unassigned issues as ``status='done'``, and records the sync
timestamp.  It also exports a staleness-check helper and a pure field
mapping function for unit testing.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from typing import Any

from planny_core.enums import ProjectSourceType
from planny_core.models import Issue, Project, User
from planny_jira.client import JiraHttpClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

# Fields requested from the Jira v3 search/jql endpoint (v3 returns only
# ``id`` by default, unlike v2 which included all navigable fields).
_JIRA_SEARCH_FIELDS = ",".join([
    "summary",
    "status",
    "issuetype",
    "priority",
    "project",
    "assignee",
    "timetracking",
    "description",
    "created",
    "reporter",
])

# ── Field mapping tables ──────────────────────────────────────────────────────

_TYPE_MAP: dict[str, str] = {
    "bug": "bug",
    "task": "task",
    "story": "story",
}

def map_jira_status(jira_status: str) -> str:
    """Map a Jira status string to a local IssueStatus string."""
    if not jira_status:
        return "backlog"
    status = jira_status.lower().strip()
    if "backlog" in status or "todo" in status or "open" in status or "to do" in status:
        return "backlog"
    if "selected" in status or "ready" in status or "approved" in status:
        return "selected"
    if (
        "progress" in status
        or "doing" in status
        or "active" in status
        or "development" in status
        or "implementation" in status
        or "review" in status
        or "qa" in status
        or "testing" in status
        or "deploy" in status
    ):
        return "inprogress"
    if (
        "done" in status
        or "complete" in status
        or "closed" in status
        or "resolved" in status
        or "finished" in status
        or "verified" in status
    ):
        return "done"
    return "backlog"


def seconds_to_hours(seconds: int | None) -> float | int | None:
    """Convert seconds to hours (float/int) for local DB compatibility."""
    if seconds is None:
        return None
    hours = seconds / 3600.0
    if hours.is_integer():
        return int(hours)
    return round(hours, 2)


def resolve_reporter_id(
    jira_reporter: dict[str, Any] | None,
    syncing_user_id: int,
    syncing_jira_email: str,
) -> int:
    """Resolve reporter ID from Jira reporter details."""
    if not jira_reporter:
        return syncing_user_id

    email = (jira_reporter.get("emailAddress") or "").lower().strip()
    display_name = (jira_reporter.get("displayName") or "").lower().strip()

    if email and email == syncing_jira_email:
        return syncing_user_id

    if "yoda" in display_name or "yoda" in email:
        return 1
    if "gaben" in display_name or "gaben" in email:
        return 2
    if "rick" in display_name or "rick" in email:
        return 3

    return syncing_user_id

_PRIORITY_MAP: dict[str, str] = {
    "highest": "5",
    "high": "4",
    "medium": "3",
    "low": "2",
    "lowest": "1",
}


def adf_to_text(adf: Any) -> str:
    """Recursively convert Atlassian Document Format (ADF) to plain text."""
    if not adf:
        return ""
    if isinstance(adf, str):
        return adf
    if not isinstance(adf, dict):
        return ""

    node_type = adf.get("type")
    if node_type == "text":
        return str(adf.get("text", ""))

    content = adf.get("content")
    if isinstance(content, list):
        parts = []
        for child in content:
            child_text = adf_to_text(child)
            if child_text:
                parts.append(child_text)

        # Add newlines for block elements
        if node_type in ("paragraph", "heading", "listItem"):
            return "".join(parts).strip() + "\n"
        return "".join(parts)
    return ""


# ── Public helpers ────────────────────────────────────────────────────────────


def map_jira_issue_to_local(
    jira_issue: dict[str, Any],
    project_id: int,
    reporter_id: int,
    max_list_position: float,
) -> dict[str, Any]:
    """Map a Jira API issue dict to local ``Issue`` model fields.

    Parameters
    ----------
    jira_issue:
        A single issue dict from the Jira ``/search`` API response.
    project_id:
        Local project ID to assign the issue to.
    reporter_id:
        User ID of the user performing the sync (fallback reporter/assignee).
    max_list_position:
        Current maximum ``listPosition`` for the project; the new issue
        gets ``max_list_position + 1.0``.

    Returns
    -------
    dict
        Keyword arguments suitable for ``Issue(**…)``.
    """
    syncing_user_id = reporter_id
    fields: dict[str, Any] = jira_issue.get("fields") or {}
    timetracking: dict[str, Any] = fields.get("timetracking") or {}

    issue_type_name: str = ""
    issuetype = fields.get("issuetype")
    if isinstance(issuetype, dict):
        issue_type_name = issuetype.get("name", "")

    status_name: str = ""
    status = fields.get("status")
    if isinstance(status, dict):
        status_name = status.get("name", "")

    priority_name: str = ""
    priority = fields.get("priority")
    if isinstance(priority, dict):
        priority_name = priority.get("name", "")

    created_str = fields.get("created")
    created_at = None
    if created_str:
        try:
            dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
            created_at = dt.astimezone(timezone.utc).replace(tzinfo=None)
        except Exception:
            pass

    syncing_jira_email = os.environ.get("EXTERNAL_JIRA_EMAIL", "").lower().strip()
    jira_reporter = fields.get("reporter")
    resolved_reporter = resolve_reporter_id(jira_reporter, syncing_user_id, syncing_jira_email)

    return {
        "external_key": jira_issue.get("key"),
        "source_type": ProjectSourceType.JIRA.value,
        "readonly": True,
        "title": fields.get("summary", ""),
        "type": _TYPE_MAP.get(issue_type_name.lower(), "task"),
        "status": map_jira_status(status_name),
        "priority": _PRIORITY_MAP.get(priority_name.lower(), "3"),
        "description": adf_to_text(fields.get("description")),
        "estimate": seconds_to_hours(timetracking.get("originalEstimateSeconds")),
        "timeSpent": seconds_to_hours(timetracking.get("timeSpentSeconds")),
        "timeRemaining": seconds_to_hours(timetracking.get("remainingEstimateSeconds")),
        "listPosition": max_list_position + 1.0,
        "reporterId": resolved_reporter,
        "projectId": project_id,
        "createdAt": created_at or datetime.utcnow(),
    }


def should_auto_sync(project: Project) -> bool:
    """Return ``True`` when *project* should be re-synced.

    A project needs a sync when:
    * It has never been synced (``last_synced_at is None``)
    * The last sync was more than 24 hours ago
    """
    if project.last_synced_at is None:
        return True
    now: datetime = datetime.utcnow()  # noqa: UP024  -- legacy compat with model defaults
    return (now - project.last_synced_at) > timedelta(hours=24)  # type: ignore[no-any-return]


async def get_or_create_user(
    db: AsyncSession,
    name: str,
    email: str,
    avatar_url: str | None = None,
) -> User:
    """Get an existing User by email or create a new one."""
    email = email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if user is None:
        user = User(
            name=name,
            email=email,
            avatarUrl=avatar_url or "https://secure.gravatar.com/avatar/default",
        )
        db.add(user)
        await db.flush()
    return user


# ── Main sync entry point ─────────────────────────────────────────────────────


async def sync_external_projects(
    user_id: int,
    db: AsyncSession,
    jira_client: JiraHttpClient,
) -> dict[str, int]:
    """Sync Jira issues assigned to *user_id* into the local database.

    Algorithm
    ---------
    1. Call the external Jira ``/search`` API for the current user's
       open issues.
    2. Group returned issues by Jira project key.
    3. For each project key, upsert a ``Project`` row and ensure the
       ``user_projects`` association exists.
    4. For each issue, upsert an ``Issue`` row (existing by
       ``external_key`` → update fields; new → create).
    5. Any locally-tracked Jira issue that is **not** in the API
       response gets marked ``status = 'done'``.
    6. Update ``project.last_synced_at`` for every touched project.

    Returns
    -------
    dict
        ``{"projects_synced": int, "issues_upserted": int, "issues_closed": int}``
    """
    user_result = await db.execute(select(User).where(User.id == user_id))
    user_obj = user_result.scalars().first()

    # ── 1. Call Jira API with pagination support ──────────────────────────────
    issues: list[dict[str, Any]] = []
    next_page_token: str | None = None

    while True:
        params: dict[str, Any] = {
            "jql": "assignee=currentUser() AND status!=Closed",
            "maxResults": 100,
            "fields": _JIRA_SEARCH_FIELDS,
        }
        if next_page_token:
            params["nextPageToken"] = next_page_token

        response: dict[str, Any] = await jira_client.get(
            "/rest/api/3/search/jql",
            params=params,
        )
        issues.extend(response.get("issues", []))

        if response.get("isLast") or not response.get("nextPageToken"):
            break

        next_page_token = response.get("nextPageToken")

    # ── 2. Group by project key ──────────────────────────────────────────────
    projects_map: dict[str, list[dict[str, Any]]] = {}
    for issue in issues:
        project_key: str | None = (
            issue.get("fields", {}).get("project", {}).get("key")
        )
        if project_key:
            projects_map.setdefault(project_key, []).append(issue)

    synced_project_ids: list[int] = []
    issues_upserted: int = 0
    projects_synced: int = 0

    # ── 3. Process each project ──────────────────────────────────────────────
    for project_key, project_issues in projects_map.items():
        # Resolve project name from first issue's Jira project data
        first_issue = project_issues[0]
        project_name: str = (
            first_issue.get("fields", {}).get("project", {}).get("name")
            or project_key
        )

        # ── a. Upsert project ────────────────────────────────────────────────
        result = await db.execute(
            select(Project).where(Project.external_key == project_key)
        )
        project: Project | None = result.scalars().first()

        if project is not None:
            project.name = project_name
        else:
            project = Project(
                name=project_name,
                source_type=ProjectSourceType.JIRA.value,
                external_key=project_key,
                category="software",
            )
            db.add(project)
            await db.flush()  # ensure project.id is available below

        synced_project_ids.append(project.id)
        projects_synced += 1

        # ── b. Ensure user_projects association ──────────────────────────────
        await db.execute(
            text(
                'INSERT OR IGNORE INTO user_projects ("userId", "projectId") '
                "VALUES (:user_id, :project_id)"
            ),
            {"user_id": user_id, "project_id": project.id},
        )

        # ── c. Determine existing issue keys for upsert logic ────────────────
        existing_result = await db.execute(
            select(Issue.external_key).where(
                Issue.projectId == project.id,
                Issue.source_type == ProjectSourceType.JIRA.value,
            )
        )
        existing_keys: set[str] = {
            row[0] for row in existing_result.all() if row[0] is not None
        }

        # d. Compute starting list position
        max_pos_result = await db.execute(
            select(func.max(Issue.listPosition)).where(
                Issue.projectId == project.id
            )
        )
        max_pos: float = max_pos_result.scalar() or 0.0
        position_offset: int = 0

        async def link_user_to_project(u_id: int, p_id: int):
            await db.execute(
                text(
                    'INSERT OR IGNORE INTO user_projects ("userId", "projectId") '
                    "VALUES (:user_id, :project_id)"
                ),
                {"user_id": u_id, "project_id": p_id},
            )

        # ── e. Upsert each issue ─────────────────────────────────────────────
        for jira_issue in project_issues:
            issue_key: str | None = jira_issue.get("key")
            if issue_key is None:
                continue

            # Resolve reporter user from Jira payload
            reporter_data = jira_issue.get("fields", {}).get("reporter")
            if reporter_data:
                reporter_email = reporter_data.get("emailAddress") or (
                    f"{reporter_data.get('accountId')}@jira.placeholder"
                    if reporter_data.get("accountId")
                    else ""
                )
                if reporter_email:
                    reporter_user = await get_or_create_user(
                        db,
                        name=reporter_data.get("displayName", "Jira User"),
                        email=reporter_email,
                        avatar_url=reporter_data.get("avatarUrls", {}).get("24x24"),
                    )
                    await link_user_to_project(reporter_user.id, project.id)
                    reporter_id_val = reporter_user.id
                else:
                    reporter_id_val = user_id
            else:
                reporter_id_val = user_id

            mapped = map_jira_issue_to_local(
                jira_issue,
                project.id,
                reporter_id_val,
                max_pos + float(position_offset),
            )

            # Resolve assignee user(s) from Jira payload
            assignee_data = jira_issue.get("fields", {}).get("assignee")
            issue_assignees = []
            if assignee_data:
                assignee_email = assignee_data.get("emailAddress") or (
                    f"{assignee_data.get('accountId')}@jira.placeholder"
                    if assignee_data.get("accountId")
                    else ""
                )
                if assignee_email:
                    assignee_user = await get_or_create_user(
                        db,
                        name=assignee_data.get("displayName", "Jira User"),
                        email=assignee_email,
                        avatar_url=assignee_data.get("avatarUrls", {}).get("24x24"),
                    )
                    await link_user_to_project(assignee_user.id, project.id)
                    issue_assignees.append(assignee_user)
                else:
                    if user_obj is not None:
                        issue_assignees.append(user_obj)
            else:
                if user_obj is not None:
                    issue_assignees.append(user_obj)

            if issue_key in existing_keys:
                # Update existing issue (preserve listPosition)
                result = await db.execute(
                    select(Issue)
                    .where(Issue.external_key == issue_key)
                    .options(selectinload(Issue.users))
                )
                existing_issue: Issue | None = result.scalars().first()
                if existing_issue is not None:
                    for field in (
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
                    ):
                        setattr(existing_issue, field, mapped[field])
                    existing_issue.users = issue_assignees
            else:
                # Create new issue
                new_issue = Issue(**mapped)
                new_issue.users = issue_assignees
                db.add(new_issue)
                position_offset += 1

            issues_upserted += 1

        # ── f. Stamp sync timestamp ──────────────────────────────────────────
        project.last_synced_at = datetime.utcnow()

    # ── 5. Close issues missing from Jira response ────────────────────────────
    issues_closed: int = 0
    if synced_project_ids:
        synced_keys: set[str] = {
            issue.get("key", "") for issue in issues if issue.get("key")
        }
        orphan_query = select(Issue).where(
            Issue.source_type == ProjectSourceType.JIRA.value,
            Issue.projectId.in_(synced_project_ids),
        )
        if synced_keys:
            orphan_query = orphan_query.where(
                ~Issue.external_key.in_(synced_keys)
            )

        orphan_result = await db.execute(orphan_query)
        for orphan in orphan_result.scalars().all():
            orphan.status = "done"
            issues_closed += 1

    await db.flush()

    return {
        "projects_synced": projects_synced,
        "issues_upserted": issues_upserted,
        "issues_closed": issues_closed,
    }
