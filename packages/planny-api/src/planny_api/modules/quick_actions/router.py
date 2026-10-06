"""Quick Actions router — Outlook clean + Tempo hours + Tempo export.

All endpoints require authentication. Tempo endpoints are additionally
rate-limited to 10 requests per minute per IP.

Routes
------
    GET    /outlook-clean/status   — current job status (idle/running/…)
    POST   /outlook-clean          — trigger async Outlook clean
    GET    /tempo-export/hours     — hours logged for ?date=YYYY-MM-DD
    GET    /tempo-export/week      — week hours for ?startDate=YYYY-MM-DD
    PUT    /tempo-export/hours     — manual override of daily hours
    POST   /tempo-export           — create Tempo worklog

Reference: ``api/src/controllers/quickActions.ts``
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from planny_core.errors import ConflictError, ErrorCode
from planny_core.models.user import User
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.dependencies import (
    get_current_user,
    get_db,
    get_outlook_clean_service,
    get_tempo_service,
)
from planny_api.middleware.rate_limiter import create_rate_limiter_dependency
from planny_api.modules.quick_actions.outlook import OutlookCleanService
from planny_api.modules.quick_actions.schemas import (
    TempoExportRequest,
    UpdateHoursRequest,
)
from planny_api.modules.quick_actions.tempo import TempoService

router = APIRouter(prefix="/quick-actions/actions", tags=["quick-actions"])

# Rate limiter: 10 requests per minute per IP on all Tempo endpoints
tempo_rate_limiter = create_rate_limiter_dependency(
    window_ms=60_000,
    max_requests=10,
)

# ── Outlook Clean ────────────────────────────────────────────────────────────


@router.get("/outlook-clean/status")
async def get_outlook_clean_status(
    current_user: User = Depends(get_current_user),  # noqa: ARG001
    service: OutlookCleanService = Depends(get_outlook_clean_service),
) -> dict[str, object]:
    """Return current Outlook clean job status.

    Possible statuses: idle, running, success, failed.
    """
    return service.status()


@router.post("/outlook-clean")
async def trigger_outlook_clean(
    current_user: User = Depends(get_current_user),  # noqa: ARG001
    service: OutlookCleanService = Depends(get_outlook_clean_service),
) -> dict[str, str]:
    """Start an async Outlook clean background job.

    Returns immediately with ``{"status": "running"}``. Poll
    ``GET /outlook-clean/status`` for completion.
    """
    try:
        service.trigger()
    except RuntimeError as exc:
        # A ConflictError (an AppError) keeps the response in the standard
        # envelope, unlike HTTPException which FastAPI wraps in {"detail": ...}.
        raise ConflictError(
            "An Outlook clean is already running. Check status or wait for it to finish.",
            code=ErrorCode.ALREADY_RUNNING,
        ) from exc

    return {"status": "running"}


# ── Tempo Export ─────────────────────────────────────────────────────────────


@router.get("/tempo-export/hours")
async def get_tempo_hours(
    date: str = Query(
        ...,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Date in YYYY-MM-DD format",
    ),
    current_user: User = Depends(get_current_user),  # noqa: ARG001
    service: TempoService = Depends(get_tempo_service),
    _rate_limit: None = Depends(tempo_rate_limiter),
) -> dict[str, object]:
    """Return hours logged for a specific date.

    Currently returns stub data (0h). Real integration in FEATURE-012
    will query the Tempo API.
    """
    return await service.get_hours(date)


@router.get("/tempo-export/week")
async def get_tempo_week(
    startDate: str = Query(  # noqa: N803
        ...,
        alias="startDate",
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Start date (Monday) of the week in YYYY-MM-DD format",
    ),
    current_user: User = Depends(get_current_user),  # noqa: ARG001
    service: TempoService = Depends(get_tempo_service),
    _rate_limit: None = Depends(tempo_rate_limiter),
) -> dict[str, list[dict[str, object]]]:
    """Return an array of daily hours for the week starting at ``startDate``.

    Returns 7 entries (Mon–Sun) with hours and source for each day.
    """
    return await service.get_week_hours(startDate)


@router.put("/tempo-export/hours")
async def update_tempo_hours(
    body: UpdateHoursRequest,
    current_user: User = Depends(get_current_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    service: TempoService = Depends(get_tempo_service),
    _rate_limit: None = Depends(tempo_rate_limiter),
) -> dict[str, object]:
    """Update manual hours override for a specific date.

    Persists to the ``DailyHours`` table and returns the updated record
    with computed ``isComplete`` flag.
    """
    return await service.update_hours(body.date, body.hours, db)


@router.post("/tempo-export")
async def export_to_tempo(
    body: TempoExportRequest,
    current_user: User = Depends(get_current_user),  # noqa: ARG001
    service: TempoService = Depends(get_tempo_service),
    _rate_limit: None = Depends(tempo_rate_limiter),
) -> dict[str, object]:
    """Create a Tempo worklog entry.

    Stub: returns a success response immediately. Real worklog creation
    via ``planny-jira`` ``WorklogService`` will be wired in FEATURE-012.
    """
    return await service.export_worklog(
        date_str=body.date,
        hours=body.hours,
        description=body.description,
    )
