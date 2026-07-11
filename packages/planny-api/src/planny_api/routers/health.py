"""Health check router — liveness, readiness, and full health probes.

Matches the Node ``/health``, ``/health/ready``, ``/health/live`` endpoints.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends
from planny_core.config import settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.dependencies import get_db

logger = structlog.get_logger()
router = APIRouter(tags=["health"])


async def _check_database(db: AsyncSession) -> dict[str, Any]:
    """Check database connectivity with a simple ``SELECT 1``."""
    try:
        await db.execute(text("SELECT 1"))
        return {"name": "database", "status": "ok"}
    except Exception as exc:
        logger.warning("Health check: database unreachable", error=str(exc))
        return {"name": "database", "status": "error", "error": "Database connection failed"}


def _check_jira_integrations() -> dict[str, Any]:
    """Check whether Jira integrations are configured (non-empty env)."""
    internal_ok = bool(settings.internal_atlassian_base_url)
    external_ok = bool(settings.external_atlassian_base_url)
    status = "ok" if (internal_ok or external_ok) else "not_configured"
    return {
        "name": "jira_integrations",
        "status": status,
        "internal_configured": internal_ok,
        "external_configured": external_ok,
    }


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Full health check — database + Jira integration status."""
    db_check = await _check_database(db)
    jira_check = _check_jira_integrations()
    overall = "healthy" if db_check["status"] == "ok" else "unhealthy"

    return {
        "status": overall,
        "timestamp": datetime.now(UTC).isoformat(),
        "checks": [db_check, jira_check],
    }


@router.get("/health/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Readiness probe — database connectivity only."""
    db_check = await _check_database(db)
    status = "ready" if db_check["status"] == "ok" else "not_ready"

    return {
        "status": status,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/health/live")
async def liveness_check() -> dict[str, Any]:
    """Liveness probe — always returns OK."""
    return {
        "status": "alive",
        "timestamp": datetime.now(UTC).isoformat(),
    }
