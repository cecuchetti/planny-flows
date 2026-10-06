"""Health probes.

Database connectivity is checked here; integration status comes from the
capability registry, so adding a capability that declares a probe makes it appear
in ``/health`` without touching this module.
"""

from __future__ import annotations

from typing import Any

import structlog
from planny_core.config import Settings
from planny_core.config import settings as default_settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.kernel.capabilities import capability_health

__all__ = ["check_capabilities", "check_database"]

logger = structlog.get_logger()


async def check_database(db: AsyncSession) -> dict[str, Any]:
    """Check database connectivity with a trivial query."""
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - any failure means "unreachable"
        logger.warning("Health check: database unreachable", error=str(exc))
        return {
            "name": "database",
            "status": "error",
            "error": "Database connection failed",
        }
    return {"name": "database", "status": "ok"}


def check_capabilities(settings: Settings | None = None) -> list[dict[str, Any]]:
    """Report the status of every capability that declares a health probe."""
    return capability_health(settings or default_settings)
