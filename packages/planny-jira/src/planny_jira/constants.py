"""Jira REST API constants.

The field list and the endpoint paths used to be duplicated: the search field
list appeared in both the sync engine and the issues router, and the paths were
spelled out at each call site. A change in one place silently left the other
behind, so they live here now.
"""

from __future__ import annotations

__all__ = [
    "ISSUE_PATH",
    "ISSUE_TRANSITIONS_PATH",
    "JIRA_SEARCH_FIELDS",
    "JIRA_SEARCH_PATH",
    "TEMPO_WORKLOG_PATH",
    "issue_path",
    "issue_transitions_path",
    "issue_worklog_path",
]

#: Endpoint that answers JQL searches.
#:
#: v3 is used deliberately: it returns only ``id`` unless fields are named
#: explicitly, unlike v2 which returned every navigable field.
JIRA_SEARCH_PATH = "/rest/api/3/search/jql"

#: Fields requested from the search endpoint. Omitting one means the sync sees
#: ``None`` for it and writes an empty local value.
JIRA_SEARCH_FIELDS = ",".join(
    [
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
    ]
)

#: Single-issue endpoint. Kept on v2: transitions and worklogs are not exposed
#: under the same shape in v3.
ISSUE_PATH = "/rest/api/2/issue/{issue_key}"

#: Available transitions for an issue.
ISSUE_TRANSITIONS_PATH = "/rest/api/2/issue/{issue_key}/transitions"

#: Tempo timesheet endpoint used by the internal instance.
TEMPO_WORKLOG_PATH = "/rest/tempo-timesheets/4/worklogs/"


def issue_path(issue_key: str) -> str:
    """Path for a single issue."""
    return ISSUE_PATH.format(issue_key=issue_key)


def issue_transitions_path(issue_key: str) -> str:
    """Path for an issue's transitions."""
    return ISSUE_TRANSITIONS_PATH.format(issue_key=issue_key)


def issue_worklog_path(issue_key: str) -> str:
    """Path for creating a worklog on an issue."""
    return f"{issue_path(issue_key)}/worklog"
