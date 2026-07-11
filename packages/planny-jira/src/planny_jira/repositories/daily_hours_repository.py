"""Repository for DailyHours.

Mirrors ``api/src/jira-integrations/persistence/dailyHoursRepository.ts``.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planny_core.models import DailyHours


class DailyHoursRepository:
    """CRUD operations for daily hours tracking."""

    async def get_by_date(
        self,
        db: AsyncSession,
        work_date: str,
    ) -> DailyHours | None:
        """Find a daily hours record by exact date."""
        stmt = select(DailyHours).where(DailyHours.work_date == work_date)
        result = await db.execute(stmt)
        return result.scalars().first()

    async def upsert_hours(
        self,
        db: AsyncSession,
        work_date: str,
        hours_logged: float,
        source: str = "tempo",
    ) -> DailyHours:
        """Insert or update daily hours for a date."""
        stmt = select(DailyHours).where(DailyHours.work_date == work_date)
        result = await db.execute(stmt)
        existing = result.scalars().first()

        if existing:
            existing.hours_logged = hours_logged
            existing.source = source
            existing.updated_at = datetime.now(timezone.utc)
            record = existing
        else:
            record = DailyHours(
                work_date=work_date,
                hours_logged=hours_logged,
                source=source,
            )
            db.add(record)

        await db.flush()
        return record

    async def get_week_hours(
        self,
        db: AsyncSession,
        start_date: str,
        end_date: str,
    ) -> list[DailyHours]:
        """Return records within a date range (inclusive), ordered by date ASC."""
        stmt = (
            select(DailyHours)
            .where(DailyHours.work_date >= start_date)
            .where(DailyHours.work_date <= end_date)
            .order_by(DailyHours.work_date.asc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def delete(
        self,
        db: AsyncSession,
        work_date: str,
    ) -> bool:
        """Delete a daily hours record. Returns True if anything was deleted."""
        stmt = select(DailyHours).where(DailyHours.work_date == work_date)
        result = await db.execute(stmt)
        existing = result.scalars().first()
        if existing is None:
            return False
        await db.delete(existing)
        await db.flush()
        return True
