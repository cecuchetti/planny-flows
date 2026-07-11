"""Tempo service — stub implementation for Tempo hours and worklog export.

**STUB**: All Tempo/Jira HTTP calls return mock data. Real integration
will be wired in FEATURE-012 (Phase 4 — Jira Integrations).

Use cases:
    - ``get_hours`` — return hours logged for a date (stub: 0h)
    - ``get_week_hours`` — return array of 7 days (stub: all 0h)
    - ``update_hours`` — persist manual hours override in ``DailyHours`` table
    - ``export_worklog`` — create Tempo worklog (stub: always success)
"""

from __future__ import annotations

from datetime import date, timedelta

import structlog
from planny_core.config import settings
from planny_core.models import DailyHours
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)


class TempoService:
    """Stub service for Tempo operations.

    ``update_hours`` persists to the ``DailyHours`` table. All other
    methods return mock data suitable for UI development.
    """

    # ── Public API ───────────────────────────────────────────────────────────

    async def get_hours(self, date_str: str) -> dict[str, object]:
        """Return hours logged for a specific date.

        Stub: returns 0h with source "tempo".
        Real impl will query Tempo API via ``planny-jira``.
        """
        return {
            "hoursLogged": 0,
            "source": "tempo",
            "isComplete": False,
        }

    async def get_week_hours(
        self, start_date: str
    ) -> dict[str, list[dict[str, object]]]:
        """Return an array of daily hours for the week starting at *start_date*.

        Generates 7 entries (Mon–Sun). When no data exists in the DB,
        hours are 0 and source is ``None``.
        """
        try:
            start = date.fromisoformat(start_date)
        except ValueError:
            return {"days": []}

        days: list[dict[str, object]] = []
        for i in range(7):
            current = start + timedelta(days=i)
            days.append(
                {
                    "date": current.isoformat(),
                    "hoursLogged": 0,
                    "source": None,
                }
            )

        return {"days": days}

    async def update_hours(
        self,
        date_str: str,
        hours: float,
        db: AsyncSession,
    ) -> dict[str, object]:
        """Save or update manual hours override in ``DailyHours`` table.

        Returns the persisted record with computed ``isComplete`` flag.
        """
        result = await db.execute(
            select(DailyHours).where(DailyHours.work_date == date_str)
        )
        record: DailyHours | None = result.scalars().first()

        if record:
            record.hours_logged = hours
            record.source = "manual"
        else:
            record = DailyHours(
                work_date=date_str,
                hours_logged=hours,
                source="manual",
            )
            db.add(record)

        await db.flush()

        is_complete = hours >= settings.quick_actions_workday_hours
        return {
            "date": date_str,
            "hours": round(hours, 2),
            "source": "manual",
            "isComplete": is_complete,
        }

    async def export_worklog(
        self,
        date_str: str,
        hours: float,
        description: str | None = None,
    ) -> dict[str, object]:
        """Create a Tempo worklog entry (stub).

        Real implementation (FEATURE-012) will:
        1. Build worklog payload with configurable start time
        2. POST to Jira/Tempo API via ``planny-jira`` ``WorklogService``
        3. Handle errors, retries, and status tracking
        """
        _ = hours  # unused in stub; consumed by real impl
        _ = description

        return {
            "success": True,
            "message": "Tempo worklog created successfully",
            "date": date_str,
        }
