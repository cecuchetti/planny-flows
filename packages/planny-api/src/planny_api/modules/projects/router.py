"""Project router — list, load, update and Jira sync.

Validation and serialization only; the rules live in
:mod:`planny_api.modules.projects.service`.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from planny_core.config import settings as default_settings
from planny_core.errors import BadUserInputError
from planny_jira.client import JiraHttpClient
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.app.context import AppContext
from planny_api.core.security.policies import ProjectScope, get_project_scope
from planny_api.dependencies import get_context, get_db, get_jira_issue_client
from planny_api.modules.projects import service
from planny_api.modules.projects.schemas import UpdateProjectRequest
from planny_api.modules.projects.serializers import project_summary
from planny_api.serializers import project_to_dict

router = APIRouter(tags=["projects"])


def _parse_ids(raw: str) -> set[int]:
    """Parse a comma-separated id list from the query string.

    Raises:
        BadUserInputError: the value is not a comma-separated list of integers.
    """
    try:
        ids = {int(part.strip()) for part in raw.split(",") if part.strip()}
    except ValueError as exc:
        raise BadUserInputError({"ids": "Must be a comma-separated list of integers"}) from exc

    if not ids:
        raise BadUserInputError({"ids": "Must contain at least one project id"})
    return ids


@router.get("/projects")
async def list_projects(
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    context: AppContext = Depends(get_context),
) -> dict[str, object]:
    """List the projects the current user belongs to, ordered by name.

    Stale Jira projects trigger a background sync, which runs *after* this
    response. ``syncScheduled`` says so, and ``syncIntervalMinutes`` is the
    cadence the client should refresh at, so an open board picks the changes up
    instead of showing stale issues until something else refetches.
    """
    projects, sync_scheduled = await service.list_projects(
        db, scope, background_tasks, context.jira_issue_client
    )
    return {
        "projects": [project_summary(p) for p in projects],
        "syncScheduled": sync_scheduled,
        "syncIntervalMinutes": default_settings.sync_interval_minutes,
    }


@router.get("/project")
async def get_project(
    ids: str | None = Query(None),
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Return one or more projects.

    * ``ids`` — comma-separated ids → ``{"projects": [...]}`` with full data.
    * omitted — the caller's default project → ``{"project": {...}}``.
    """
    if ids is not None:
        projects = await service.get_projects_by_ids(db, scope, _parse_ids(ids))
        return {"projects": [project_to_dict(p, include_issues=True) for p in projects]}

    project = await service.get_default_project(db, scope)
    return {"project": project_to_dict(project)}


@router.put("/project")
async def update_project(
    body: UpdateProjectRequest,
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Partially update the caller's default project.

    Returns the project without its issues, matching the legacy client contract.
    Jira-sourced projects are read-only.
    """
    project = await service.update_default_project(db, scope, body)
    return {"project": project_to_dict(project, include_issues=False)}


# Registered before the parameterized route below so that "/projects/sync"
# is not captured as a project id.
@router.post("/projects/sync")
async def sync_all_projects(
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
    jira_client: JiraHttpClient = Depends(get_jira_issue_client),
) -> dict[str, object]:
    """Discover and sync every Jira project for the caller.

    Synchronous on purpose: the client refetches as soon as this returns, so the
    user sees the new issues instead of a sync they have to wait to observe.
    """
    result = await service.sync_all_projects(db, scope, jira_client)
    return {"synced": True, **result}


@router.post("/projects/{project_id}/sync")
async def sync_project(
    project_id: int,
    scope: ProjectScope = Depends(get_project_scope),
    db: AsyncSession = Depends(get_db),
    jira_client: JiraHttpClient = Depends(get_jira_issue_client),
) -> dict[str, object]:
    """Sync a single Jira project the caller belongs to."""
    project = await service.sync_single_project(db, scope, project_id, jira_client)
    return {"synced": True, "project": project_to_dict(project, include_issues=True)}
