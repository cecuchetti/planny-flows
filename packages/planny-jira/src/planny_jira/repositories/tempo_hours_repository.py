"""Repository for TempoHoursDaily.

Mirrors ``api/src/jira-integrations/persistence/tempoHoursRepository.ts``.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planny_core.models import TempoHoursDaily


class TempoHoursRepository:
    """CRUD operations for Tempo hours daily tracking."""

    async def get_by_date(
        self,
        db: AsyncSession,
        work_date: str,
    ) -> TempoHoursDaily | None:
        """Find a Tempo hours record by exact date."""
        stmt = select(TempoHoursDaily).where(
            TempoHoursDaily.work_date == work_date
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    async def upsert_hours(
        self,
        db: AsyncSession,
        work_date: str,
        hours_logged: float,
    ) -> TempoHoursDaily:
        """Insert or update Tempo hours for a date.

        Sets confirmed_at to now on upsert.
        """
        stmt = select(TempoHoursDaily).where(
            TempoHoursDaily.work_date == work_date
        )
        result = await db.execute(stmt)
        existing = result.scalars().first()

        now = datetime.now(timezone.utc)

        if existing:
            existing.hours_logged = hours_logged
            existing.confirmed_at = now
            existing.updated_at = now
            record = existing
        else:
            record = TempoHoursDaily(
                work_date=work_date,
                hours_logged=hours_logged,
                confirmed_at=now,
            )
            db.add(record)

        await db.flush()
        return record

    async def get_by_date_range(
        self,
        db: AsyncSession,
        from_date: str,
        to_date: str,
    ) -> list[TempoHoursDaily]:
        """Return records within a date range (inclusive)."""
        stmt = (
            select(TempoHoursDaily)
            .where(TempoHoursDaily.work_date >= from_date)
            .where(TempoHoursDaily.work_date <= to_date)
            .order_by(TempoHoursDaily.work_date.asc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
