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

import html
from datetime import UTC, datetime
from typing import Any

from planny_core.enums import ProjectSourceType

__all__ = [
    "adf_to_html",
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


#: Every mark type the client renderer supports, mapped to its HTML tag.
_MARK_TAGS: dict[str, str] = {
    "strong": "strong",
    "em": "em",
    "code": "code",
    "underline": "u",
    "strike": "s",
}

#: Marks are applied in this order, so the produced nesting is deterministic.
_MARK_ORDER: tuple[str, ...] = ("strong", "em", "code", "underline", "strike")


def _render_adf_text(node: dict[str, Any]) -> str:
    """Render one ADF ``text`` node: escaped content wrapped by its marks."""
    text = html.escape(str(node.get("text", "")))
    if not text:
        return ""

    marks = [mark for mark in node.get("marks", []) if isinstance(mark, dict)]
    for mark_type in _MARK_ORDER:
        if not any(mark.get("type") == mark_type for mark in marks):
            continue
        tag = _MARK_TAGS[mark_type]
        text = f"<{tag}>{text}</{tag}>"

    link = next((mark for mark in marks if mark.get("type") == "link"), None)
    if isinstance(link, dict):
        attrs = link.get("attrs")
        href = html.escape(str(attrs.get("href", ""))) if isinstance(attrs, dict) else ""
        text = f'<a href="{href}" target="_blank" rel="noopener noreferrer">{text}</a>'
    return text


def _adf_heading_tag(adf: dict[str, Any]) -> str:
    """Resolve a heading node to ``h1``..``h6``, clamping bogus levels."""
    attrs = adf.get("attrs")
    level = attrs.get("level") if isinstance(attrs, dict) else None
    try:
        resolved = int(level)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        resolved = 1
    return f"h{min(max(resolved, 1), 6)}"


def _adf_code_block_text(content: list[Any]) -> str:
    """Code blocks hold raw text: escape it, render no inner marks."""
    return html.escape("".join(_raw_adf_text(child) for child in content))


def _raw_adf_text(node: Any) -> str:
    if not isinstance(node, dict):
        return ""
    if node.get("type") == "text":
        return str(node.get("text", ""))
    inner = node.get("content")
    if not isinstance(inner, list):
        return ""
    return "".join(_raw_adf_text(child) for child in inner)


def adf_to_html(adf: Any) -> str:
    """Convert Atlassian Document Format to the HTML the client renders.

    Only tags the client's rich-text sanitizer allows are emitted (``p, br,
    strong, em, u, s, a, ol, ul, li, h1-h6, blockquote, code, pre, span``).
    Every piece of text content is escaped with :func:`html.escape` — Jira
    content is never trusted raw.

    Edge cases match :func:`adf_to_text`: ``None``, ``""`` and non-dict input
    yield ``""``; a string is passed through unchanged, since it is already
    text or HTML (older local issues were stored that way).
    """
    if not adf:
        return ""
    if isinstance(adf, str):
        return adf
    if not isinstance(adf, dict):
        return ""

    node_type = adf.get("type")
    if node_type == "text":
        return _render_adf_text(adf)
    if node_type == "hardBreak":
        return "<br>"

    content = adf.get("content")
    if not isinstance(content, list):
        return ""
    inner = "".join(adf_to_html(child) for child in content)

    if node_type in (None, "doc"):
        return inner
    if node_type == "paragraph":
        return f"<p>{inner}</p>"
    if node_type == "heading":
        tag = _adf_heading_tag(adf)
        return f"<{tag}>{inner}</{tag}>"
    if node_type == "bulletList":
        return f"<ul>{inner}</ul>"
    if node_type == "orderedList":
        return f"<ol>{inner}</ol>"
    if node_type == "listItem":
        return f"<li>{inner}</li>"
    if node_type == "blockquote":
        return f"<blockquote>{inner}</blockquote>"
    if node_type == "codeBlock":
        return f"<pre><code>{_adf_code_block_text(content)}</code></pre>"
    return inner


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
        "description": adf_to_html(fields.get("description")),
        "estimate": seconds_to_hours(timetracking.get("originalEstimateSeconds")),
        "timeSpent": seconds_to_hours(timetracking.get("timeSpentSeconds")),
        "timeRemaining": seconds_to_hours(timetracking.get("remainingEstimateSeconds")),
        "listPosition": max_list_position + 1.0,
        "reporterId": reporter_id,
        "projectId": project_id,
        "createdAt": _parse_created(fields.get("created")),
    }
