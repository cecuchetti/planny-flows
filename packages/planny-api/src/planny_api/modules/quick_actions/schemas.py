"""Pydantic models for Quick Actions — Outlook clean + Tempo export.

Request schemas match the Node.js controller's expected input format.
All fields use camelCase aliases to match the frontend convention.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class UpdateHoursRequest(BaseModel):
    """Request body for ``PUT /quick-actions/actions/tempo-export/hours``."""

    date: str = Field(
        ...,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Date in YYYY-MM-DD format",
    )
    hours: float = Field(
        ...,
        ge=0,
        description="Number of hours worked",
    )


class TempoExportRequest(BaseModel):
    """Request body for ``POST /quick-actions/actions/tempo-export``."""

    date: str = Field(
        ...,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Date in YYYY-MM-DD format",
    )
    hours: float = Field(
        ...,
        ge=0,
        description="Number of hours to export",
    )
    description: str | None = Field(
        default=None,
        description="Optional worklog description",
    )
