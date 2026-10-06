"""Health check router — liveness, readiness, and full health probes.

The probes themselves live in :mod:`planny_api.modules.health.checks`; this
module only maps them onto routes.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.dependencies import get_db
from planny_api.modules.health.checks import check_capabilities, check_database

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Full health check — database plus every capability's own report."""
    db_check = await check_database(db)
    return {
        "status": "healthy" if db_check["status"] == "ok" else "unhealthy",
        "timestamp": datetime.now(UTC).isoformat(),
        "checks": [db_check, *check_capabilities()],
    }


@router.get("/health/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Readiness probe — database connectivity only."""
    db_check = await check_database(db)
    return {
        "status": "ready" if db_check["status"] == "ok" else "not_ready",
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/health/live")
async def liveness_check() -> dict[str, Any]:
    """Liveness probe — always OK."""
    return {
        "status": "alive",
        "timestamp": datetime.now(UTC).isoformat(),
    }
