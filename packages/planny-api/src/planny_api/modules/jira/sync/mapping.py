"""Pure mapping between Jira payloads and local fields.

No database, no configuration, no network: every function here is a pure
transformation, which is what makes the field mapping unit-testable in isolation.

The hardcoded reporter mapping that used to live here is gone. It matched on the
display name and returned local user ids ``1``/``2``/``3``:

    if "rick" in display_name: return 3

Those ids refer to whatever rows happen to exist, so a Jira user called "Rick"
was silently attributed to an unrelated local account. The caller now resolves
the reporter through the Jira account itself.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from planny_core.enums import ProjectSourceType

__all__ = [
    "adf_to_text",
    "jira_user_identity",
    "map_jira_issue_to_local",
    "map_jira_status",
    "seconds_to_hours",
]

TYPE_MAP: dict[str, str] = {
    "bug": "bug",
    "task": "task",
    "story": "story",
}

PRIORITY_MAP: dict[str, str] = {
    "highest": "5",
    "high": "4",
    "medium": "3",
    "low": "2",
    "lowest": "1",
}

#: Local priority used when Jira reports one we do not map.
DEFAULT_PRIORITY = "3"

#: Local issue type used when Jira reports one we do not map.
DEFAULT_ISSUE_TYPE = "task"


def map_jira_status(jira_status: str) -> str:
    """Map a Jira status name to a local issue status.

    Jira statuses are free-form per instance, so this matches on substrings
    rather than an exact table.
    """
    if not jira_status:
        return "backlog"

    status = jira_status.lower().strip()
    if any(word in status for word in ("backlog", "todo", "to do", "open")):
        return "backlog"
    if any(word in status for word in ("selected", "ready", "approved")):
        return "selected"
    if any(
        word in status
        for word in (
            "progress",
            "doing",
            "active",
            "development",
            "implementation",
            "review",
            "qa",
            "testing",
            "deploy",
        )
    ):
        return "inprogress"
    if any(
        word in status
        for word in ("done", "complete", "closed", "resolved", "finished", "verified")
    ):
        return "done"
    return "backlog"


def seconds_to_hours(seconds: int | None) -> float | int | None:
    """Convert Jira time-tracking seconds to hours.

    Whole hours come back as ``int`` to keep the stored values tidy; anything
    else is rounded to two decimals.
    """
    if seconds is None:
        return None

    hours = seconds / 3600.0
    return int(hours) if hours.is_integer() else round(hours, 2)


def adf_to_text(adf: Any) -> str:
    """Flatten Atlassian Document Format into plain text.

    Block-level nodes get a trailing newline so paragraph structure survives.
    """
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
    if not isinstance(content, list):
        return ""

    parts = [text for child in content if (text := adf_to_text(child))]
    joined = "".join(parts)
    if node_type in ("paragraph", "heading", "listItem"):
        return joined.strip() + "\n"
    return joined


def jira_user_identity(user: dict[str, Any] | None) -> tuple[str, str, str | None] | None:
    """Extract ``(name, email, avatar_url)`` from a Jira user payload.

    Returns ``None`` when there is no usable identity. Jira omits ``emailAddress``
    for users who hide it, so ``accountId`` is used to synthesise a stable,
    obviously-synthetic address.
    """
    if not user:
        return None

    email = user.get("emailAddress")
    if not email and user.get("accountId"):
        email = f"{user['accountId']}@jira.placeholder"
    if not email:
        return None

    return (
        user.get("displayName") or "Jira User",
        email,
        (user.get("avatarUrls") or {}).get("24x24"),
    )


def _parse_created(value: Any) -> datetime:
    """Parse Jira's ISO timestamp into a naive UTC datetime."""
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.astimezone(UTC).replace(tzinfo=None)
        except ValueError:
            pass
    return datetime.now(UTC).replace(tzinfo=None)


def map_jira_issue_to_local(
    jira_issue: dict[str, Any],
    project_id: int,
    reporter_id: int,
    max_list_position: float,
) -> dict[str, Any]:
    """Map one Jira issue payload to local ``Issue`` keyword arguments.

    Args:
        jira_issue: A single issue from the Jira search response.
        project_id: Local project the issue belongs to.
        reporter_id: Local user to record as reporter.
        max_list_position: Highest position in the project; the mapped issue is
            placed one step further along.
    """
    fields: dict[str, Any] = jira_issue.get("fields") or {}
    timetracking: dict[str, Any] = fields.get("timetracking") or {}

    def named(key: str) -> str:
        value = fields.get(key)
        return value.get("name", "") if isinstance(value, dict) else ""

    return {
        "external_key": jira_issue.get("key"),
        "source_type": ProjectSourceType.JIRA.value,
        "readonly": True,
        "title": fields.get("summary", ""),
        "type": TYPE_MAP.get(named("issuetype").lower(), DEFAULT_ISSUE_TYPE),
        "status": map_jira_status(named("status")),
        "priority": PRIORITY_MAP.get(named("priority").lower(), DEFAULT_PRIORITY),
        "description": adf_to_text(fields.get("description")),
        "estimate": seconds_to_hours(timetracking.get("originalEstimateSeconds")),
        "timeSpent": seconds_to_hours(timetracking.get("timeSpentSeconds")),
        "timeRemaining": seconds_to_hours(timetracking.get("remainingEstimateSeconds")),
        "listPosition": max_list_position + 1.0,
        "reporterId": reporter_id,
        "projectId": project_id,
        "createdAt": _parse_created(fields.get("created")),
    }
