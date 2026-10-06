"""Jira issue routes — search, detail, and transitions.

All routes require authentication and a configured Jira integration.
These routes call the external Jira REST API directly via JiraHttpClient.
"""

from __future__ import annotations

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Query
from planny_core.errors import ExternalServiceError
from planny_jira.client import JiraHttpClient
from planny_jira.constants import (
    JIRA_SEARCH_FIELDS,
    JIRA_SEARCH_PATH,
    issue_path,
    issue_transitions_path,
)
from pydantic import BaseModel, Field

from planny_api.dependencies import get_jira_issue_client

# Paths are RELATIVE. The module registry adds the /api/v1 prefix when mounting.
# Hardcoding it here produced a doubled prefix (/api/v1/api/v1/...) once the
# router was wrapped as a module -- see blueprint section 4.4, Pitfall 1.
router = APIRouter(prefix="/jira/issues", tags=["jira-issues"])


# ── Request schemas ────────────────────────────────────────────────────────────


class TransitionBody(BaseModel):
    """Request body for executing a Jira issue transition."""

    transition_id: str = Field(..., alias="transitionId")




@router.get("")
async def search_issues(
    client: Annotated[JiraHttpClient, Depends(get_jira_issue_client)],
    jql: str = Query(..., description="JQL query string"),
    max_results: int = Query(50, alias="maxResults", ge=1, le=100),
    fields: str = Query(JIRA_SEARCH_FIELDS, description="Comma-separated Jira fields"),
) -> dict[str, object]:
    """Search Jira issues using JQL."""
    try:
        data = await client.get(
            JIRA_SEARCH_PATH,
            params={"jql": jql, "maxResults": max_results, "fields": fields},
        )
    except Exception as exc:
        raise ExternalServiceError(
            f"Jira issue search failed: {exc}", service="Jira"
        ) from exc

    issues = data.get("issues", [])
    return {"items": issues, "count": len(issues)}


@router.get("/{issue_key}")
async def get_issue_by_key(
    client: Annotated[JiraHttpClient, Depends(get_jira_issue_client)],
    issue_key: str,
) -> dict[str, object]:
    """Get a single issue by its key."""
    try:
        return cast(dict[str, object], await client.get(issue_path(issue_key)))
    except Exception as exc:
        msg = str(exc)
        if "not found" in msg.lower():
            from planny_core.errors import EntityNotFoundError

            raise EntityNotFoundError(f"Issue {issue_key}") from exc
        raise ExternalServiceError(
            f"Failed to retrieve issue {issue_key}: {exc}", service="Jira"
        ) from exc


@router.get("/{issue_key}/transitions")
async def get_transitions(
    client: Annotated[JiraHttpClient, Depends(get_jira_issue_client)],
    issue_key: str,
) -> dict[str, object]:
    """Get available transitions for an issue."""
    try:
        data = await client.get(issue_transitions_path(issue_key))
        transitions = data.get("transitions", [])
        return {"transitions": transitions}
    except Exception as exc:
        raise ExternalServiceError(
            f"Failed to get transitions for {issue_key}: {exc}", service="Jira"
        ) from exc


@router.post("/{issue_key}/transitions")
async def transition_issue(
    client: Annotated[JiraHttpClient, Depends(get_jira_issue_client)],
    issue_key: str,
    body: TransitionBody,
) -> dict[str, object]:
    """Execute a transition on an issue."""
    try:
        await client.post(
            issue_transitions_path(issue_key),
            json_data={"transition": {"id": body.transition_id}},
        )
    except Exception as exc:
        raise ExternalServiceError(
            f"Failed to transition issue {issue_key}: {exc}", service="Jira"
        ) from exc
    return {"success": True}
