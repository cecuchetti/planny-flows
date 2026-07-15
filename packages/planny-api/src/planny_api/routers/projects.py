"""Project router — GET/PUT /project, GET /projects, POST /projects/{id}/sync.

New endpoints (list, multi-load, manual sync) coexist with the old
backward-compatible ``GET /project`` and ``PUT /project`` routes.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, Query
from planny_core.database import async_session_factory
from planny_core.errors import BadUserInputError, EntityNotFoundError, IntegrationUnavailableError
from planny_core.models import Issue, Project, User, user_projects
from planny_jira.client import JiraHttpClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from planny_api.dependencies import get_current_user, get_db
from planny_api.schemas.project import UpdateProjectRequest
from planny_api.serializers import project_to_dict

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["projects"])


# ── Internal helpers ─────────────────────────────────────────────────────────


async def _run_sync_background(user_id: int, jira_client: JiraHttpClient) -> None:
    """Run ``sync_external_projects`` as a background task.

    Uses its own DB session so sync work is independent from the request
    transaction. ALL exceptions are caught so a sync failure never breaks
    the HTTP response.
    """
    from planny_api.services.jira_sync_service import sync_external_projects

    async with async_session_factory() as sync_db:
        try:
            await sync_external_projects(user_id, sync_db, jira_client)
            await sync_db.commit()
        except Exception:
            await sync_db.rollback()
            logger.warning("auto_sync_failed", user_id=user_id, exc_info=True)


# ── GET /projects (list) ─────────────────────────────────────────────────────


@router.get("/projects")
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> dict[str, object]:
    """List all projects associated with the current user.

    Returns summary objects (``id``, ``name``, ``source_type``,
    ``external_key``, ``last_synced_at``, ``issue_count``) ordered by name.

    Auto-sync: stale Jira projects (``last_synced_at`` > 24h ago or ``NULL``)
    trigger a background sync via ``sync_external_projects``.
    """
    stmt = (
        select(Project)
        .join(user_projects, user_projects.c.projectId == Project.id)
        .where(user_projects.c.userId == current_user.id)
        .options(selectinload(Project.issues))
        .order_by(Project.name)
    )
    result = await db.execute(stmt)
    projects = list(result.scalars().unique().all())

    # ── Auto-sync stale Jira projects ──────────────────────────────────────
    try:
        from planny_api.dependencies import get_jira_issue_client
        from planny_api.services.jira_sync_service import should_auto_sync

        jira_client = get_jira_issue_client()
        stale = [p for p in projects if p.source_type == "jira" and should_auto_sync(p)]
        if stale:
            background_tasks.add_task(
                _run_sync_background, current_user.id, jira_client
            )
    except Exception:
        logger.debug("auto_sync_skipped", exc_info=True)

    return {
        "projects": [
            {
                "id": p.id,
                "name": p.name,
                "source_type": p.source_type,
                "external_key": p.external_key,
                "last_synced_at": (
                    p.last_synced_at.isoformat() if p.last_synced_at else None
                ),
                "issue_count": len(p.issues) if p.issues else 0,
            }
            for p in projects
        ]
    }


# ── GET /project (backward-compat + multi-load) ──────────────────────────────


@router.get("/project")
async def get_project(
    ids: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Return one or more projects for the current user.

    * ``ids`` — comma-separated project IDs → ``{"projects": [...]}``
      with full project data including issues.
    * No ``ids`` — backward-compatible → ``{"project": project}``
      for the user's default project via ``current_user.projectId``.
    """
    if ids:
        # Multi-project load
        id_list = [int(i.strip()) for i in ids.split(",")]
        requested_ids = set(id_list)
        stmt = (
            select(Project)
            .join(user_projects, user_projects.c.projectId == Project.id)
            .where(Project.id.in_(requested_ids))
            .where(user_projects.c.userId == current_user.id)
            .options(
                selectinload(Project.issues).selectinload(Issue.users),
                selectinload(Project.users),
            )
        )
        result = await db.execute(stmt)
        projects = result.scalars().unique().all()
        if len(projects) != len(requested_ids):
            raise EntityNotFoundError("Project")
        return {
            "projects": [project_to_dict(p, include_issues=True) for p in projects]
        }

    # Single-project (backward compat)
    stmt = (
        select(Project)
        .where(Project.id == current_user.projectId)
        .options(
            selectinload(Project.issues).selectinload(Issue.users),
            selectinload(Project.users),
        )
    )
    result = await db.execute(stmt)
    project = result.scalars().first()

    if not project:
        raise EntityNotFoundError("Project")

    return {"project": project_to_dict(project)}


# ── PUT /project (backward-compat, with Jira guard) ─────────────────────────


@router.put("/project")
async def update_project(
    body: UpdateProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Update the user's project fields and return the updated project.

    Only the fields present in the request body are updated.
    Returns the full project dict (with users, without issues
    to match Node ``PUT /project`` behaviour).

    Raises 400 if the project has ``source_type='jira'`` (read-only).
    """
    stmt = (
        select(Project)
        .where(Project.id == current_user.projectId)
        .options(selectinload(Project.users))
    )
    result = await db.execute(stmt)
    project = result.scalars().first()

    if not project:
        raise EntityNotFoundError("Project")

    # Guard: Jira projects cannot be updated via PUT
    if project.source_type == "jira":
        raise BadUserInputError({"project": "Cannot update Jira projects"})

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    await db.flush()
    return {"project": project_to_dict(project, include_issues=False)}


# ── POST /projects/sync (bootstrap — MUST be before {project_id} route) ────


@router.post("/projects/sync")
async def sync_all_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Bootstrap: discover and sync all Jira projects for the current user.

    This is needed on first use when no Jira projects exist in the local DB yet.
    """
    import httpx

    from planny_api.dependencies import get_jira_issue_client
    from planny_api.services.jira_sync_service import sync_external_projects

    # Validate Jira is configured before attempting sync
    try:
        jira_client = get_jira_issue_client()
    except Exception:
        raise IntegrationUnavailableError("Jira integration is not configured")

    try:
        result = await sync_external_projects(current_user.id, db, jira_client)
    except httpx.UnsupportedProtocol:
        raise IntegrationUnavailableError(
            "Jira integration is not configured (missing base URL)"
        )

    return {
        "synced": True,
        "projects_synced": result.get("projects_synced", 0),
        "issues_upserted": result.get("issues_upserted", 0),
        "issues_closed": result.get("issues_closed", 0),
    }


# ── POST /projects/{project_id}/sync ────────────────────────────────────────


@router.post("/projects/{project_id}/sync")
async def sync_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Manually sync a specific Jira project.

    Verifies the project exists, is associated with the current user
    (via ``user_projects``), and has ``source_type='jira'``.

    Returns ``{"synced": True, "project": {...}}`` on success.
    """
    stmt = (
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.users),
            selectinload(Project.issues).selectinload(Issue.users),
        )
    )
    result = await db.execute(stmt)
    project = result.scalars().first()

    if not project:
        raise EntityNotFoundError("Project")

    # Verify user association
    if current_user not in project.users:
        raise EntityNotFoundError("Project")

    # Only Jira projects can be synced
    if project.source_type != "jira":
        raise BadUserInputError({"source_type": "Only Jira projects can be synced"})

    from planny_api.dependencies import get_jira_issue_client
    from planny_api.services.jira_sync_service import sync_external_projects

    jira_client = get_jira_issue_client()
    await sync_external_projects(current_user.id, db, jira_client)

    await db.refresh(project)
    return {
        "synced": True,
        "project": project_to_dict(project, include_issues=True),
    }
