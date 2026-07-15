"""Jira worklog routes — submission history, creation, and daily hours.

All routes require authentication and a configured Jira integration.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from planny_jira.worklog_service import WorklogService
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.dependencies import get_db, get_jira_worklog_service

router = APIRouter(prefix="/api/v1/jira/worklogs", tags=["jira-worklogs"])


# ── Request schemas ────────────────────────────────────────────────────────────


class CreateWorklogBody(BaseModel):
    """Request body for creating a worklog submission."""

    target: str = Field(..., description="Target system: TEMPO, JIRA, or BOTH")
    external_issue_key: str | None = Field(None, alias="externalIssueKey")
    work_date: str | None = Field(None, alias="workDate")
    started_at: str | None = Field(None, alias="startedAt")
    time_spent_seconds: int = Field(..., alias="timeSpentSeconds", ge=1)
    description: str = ""


class UpdateHoursBody(BaseModel):
    """Request body for updating daily hours."""

    total_seconds: int = Field(..., alias="totalSeconds", ge=0)
    source: str = "tempo"


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post("")
async def create_worklog(
    body: CreateWorklogBody,
    wls: Annotated[WorklogService, Depends(get_jira_worklog_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Create a worklog submission on one or both Jira instances."""
    from planny_jira.worklog_service import CreateWorklogRequest, WorklogTarget

    request = CreateWorklogRequest(
        target=WorklogTarget(body.target),
        external_issue_key=body.external_issue_key,
        work_date=body.work_date,
        started_at=body.started_at,
        time_spent_seconds=body.time_spent_seconds,
        description=body.description,
    )
    return await wls.create_worklog(request, db)


@router.get("")
async def get_submission_history(
    wls: Annotated[WorklogService, Depends(get_jira_worklog_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: Annotated[str | None, Query(alias="startDate")] = None,
    end_date: Annotated[str | None, Query(alias="endDate")] = None,
    target: str | None = None,
    status: str | None = None,
    external_issue_key: Annotated[str | None, Query(alias="externalIssueKey")] = None,
    page: int = 0,
    size: int = 20,
) -> dict[str, object]:
    """Return paginated submission history with optional date/target filters."""
    return await wls.get_submission_history(
        db,
        target=target,
        status=status,
        external_issue_key=external_issue_key,
        from_date=start_date,
        to_date=end_date,
        page=page,
        size=size,
    )


@router.get("/hours-by-date")
async def get_hours_by_date(
    wls: Annotated[WorklogService, Depends(get_jira_worklog_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end: str = Query(..., description="End date (YYYY-MM-DD)"),
) -> dict[str, object]:
    """Return aggregated daily hours within a date range."""
    items = await wls.get_hours_by_date(db, start, end)
    return {"items": items}


@router.patch("/hours-by-date/{date}")
async def update_hours_for_date(
    date: str,
    body: UpdateHoursBody,
    wls: Annotated[WorklogService, Depends(get_jira_worklog_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Manually override daily hours for a specific date."""
    return await wls.update_hours_for_date(db, date, body.total_seconds)
