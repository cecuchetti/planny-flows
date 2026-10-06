"""Project business rules.

The router validates input and serializes output; everything else — loading,
authorization, the auto-sync decision, the Jira read-only guard — happens here.
"""

from __future__ import annotations

import httpx
import structlog
from fastapi import BackgroundTasks
from planny_core.database import get_database
from planny_core.errors import BadUserInputError, EntityNotFoundError, IntegrationUnavailableError
from planny_core.models import Project
from planny_jira.client import JiraHttpClient
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api import dependencies as api_dependencies
from planny_api.core.security.policies import ProjectScope
from planny_api.modules.jira.sync import service as jira_sync_service
from planny_api.modules.projects import repository
from planny_api.modules.projects.schemas import UpdateProjectRequest

__all__ = [
    "get_default_project",
    "get_projects_by_ids",
    "list_projects",
    "sync_all_projects",
    "sync_single_project",
    "update_default_project",
]

logger = structlog.get_logger(__name__)


# ── Background sync ──────────────────────────────────────────────────────────


async def run_sync_in_background(user_id: int, jira_client: JiraHttpClient) -> None:
    """Run the Jira sync outside the request transaction.

    Opens its own session: the request session is committed and closed when the
    response is sent, so reusing it here would couple the two lifecycles.
    Failures are logged and swallowed — a sync problem must not corrupt the
    response the client already received.
    """
    async with get_database().session() as sync_db:
        try:
            await jira_sync_service.sync_external_projects(user_id, sync_db, jira_client)
            await sync_db.commit()
        except Exception:
            await sync_db.rollback()
            logger.warning("auto_sync_failed", user_id=user_id, exc_info=True)


def _schedule_auto_sync_if_stale(
    projects: list[Project],
    scope: ProjectScope,
    background_tasks: BackgroundTasks,
) -> None:
    """Queue a background sync when any Jira project is stale.

    Jira being unconfigured must not fail the list endpoint, so this degrades to
    a debug log.
    """
    try:
        jira_client = api_dependencies.get_jira_issue_client()
    except Exception:
        logger.debug("auto_sync_skipped", reason="jira_not_configured")
        return

    if any(p.source_type == "jira" and jira_sync_service.should_auto_sync(p) for p in projects):
        background_tasks.add_task(run_sync_in_background, scope.user_id, jira_client)


# ── Reads ────────────────────────────────────────────────────────────────────


async def list_projects(
    db: AsyncSession,
    scope: ProjectScope,
    background_tasks: BackgroundTasks,
) -> list[Project]:
    """Return the user's projects, queueing a background sync if any are stale."""
    projects = await repository.list_for_user(db, scope.user_id)
    _schedule_auto_sync_if_stale(projects, scope, background_tasks)
    return projects


async def get_default_project(db: AsyncSession, scope: ProjectScope) -> Project:
    """Return the user's default project with full detail.

    Raises:
        EntityNotFoundError: the user has no default project, or it is missing.
    """
    project = await repository.get_with_details(db, scope.require_default())
    if project is None:
        raise EntityNotFoundError("Project")
    return project


async def get_projects_by_ids(
    db: AsyncSession,
    scope: ProjectScope,
    project_ids: set[int],
) -> list[Project]:
    """Return the requested projects the user may see.

    Raises:
        EntityNotFoundError: any requested id is missing or out of scope. Failing
            as a whole (rather than returning a partial list) keeps the endpoint
            from confirming which ids exist.
    """
    projects = await repository.list_authorized_by_ids(db, scope.user_id, project_ids)
    if len(projects) != len(project_ids):
        raise EntityNotFoundError("Project")
    return projects


# ── Writes ───────────────────────────────────────────────────────────────────


async def update_default_project(
    db: AsyncSession,
    scope: ProjectScope,
    body: UpdateProjectRequest,
) -> Project:
    """Apply a partial update to the user's default project.

    Raises:
        EntityNotFoundError: the project does not exist.
        BadUserInputError: the project is Jira-sourced and therefore read-only.
    """
    project = await repository.get_with_users(db, scope.require_default())
    if project is None:
        raise EntityNotFoundError("Project")

    if project.source_type == "jira":
        raise BadUserInputError({"project": "Cannot update Jira projects"})

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)

    await db.flush()
    return project


# ── Sync ─────────────────────────────────────────────────────────────────────


async def sync_all_projects(db: AsyncSession, scope: ProjectScope) -> dict[str, int]:
    """Discover and sync every Jira project for the user.

    Needed on first use, when no Jira projects exist locally yet.

    Raises:
        IntegrationUnavailableError: Jira is not configured.
    """
    try:
        jira_client = api_dependencies.get_jira_issue_client()
    except Exception as exc:
        raise IntegrationUnavailableError("Jira integration is not configured") from exc

    try:
        result = await jira_sync_service.sync_external_projects(scope.user_id, db, jira_client)
    except httpx.UnsupportedProtocol as exc:
        raise IntegrationUnavailableError(
            "Jira integration is not configured (missing base URL)"
        ) from exc

    return {
        "projects_synced": int(result.get("projects_synced", 0)),
        "issues_upserted": int(result.get("issues_upserted", 0)),
        "issues_closed": int(result.get("issues_closed", 0)),
    }


async def sync_single_project(
    db: AsyncSession,
    scope: ProjectScope,
    project_id: int,
) -> Project:
    """Sync one Jira project and return it refreshed.

    Raises:
        EntityNotFoundError: the project does not exist or is out of scope.
        BadUserInputError: the project is not Jira-sourced.
    """
    scope.require(project_id)

    project = await repository.get_with_details(db, project_id)
    if project is None:
        raise EntityNotFoundError("Project")

    if project.source_type != "jira":
        raise BadUserInputError({"source_type": "Only Jira projects can be synced"})

    await jira_sync_service.sync_external_projects(
        scope.user_id, db, api_dependencies.get_jira_issue_client()
    )
    await db.refresh(project)
    return project
