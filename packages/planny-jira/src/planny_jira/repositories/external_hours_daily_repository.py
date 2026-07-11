"""Repository for ExternalHoursDaily.

Mirrors ``api/src/jira-integrations/persistence/externalHoursDailyRepository.ts``.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planny_core.models import ExternalHoursDaily


class ExternalHoursDailyRepository:
    """CRUD operations for external hours daily tracking."""

    async def upsert_hours(
        self,
        db: AsyncSession,
        *,
        work_date: str,
        total_seconds: int,
        source: str = "tempo",
    ) -> ExternalHoursDaily:
        """Insert or update hours for a given date.

        If a record exists, overwrite total_seconds and source.
        If not, create a new record.
        """
        stmt = select(ExternalHoursDaily).where(
            ExternalHoursDaily.work_date == work_date
        )
        result = await db.execute(stmt)
        existing = result.scalars().first()

        if existing:
            existing.total_seconds = total_seconds
            existing.source = source
            existing.updated_at = datetime.now(timezone.utc)
            record = existing
        else:
            record = ExternalHoursDaily(
                work_date=work_date,
                total_seconds=total_seconds,
                source=source,
            )
            db.add(record)

        await db.flush()
        return record

    async def add_hours(
        self,
        db: AsyncSession,
        work_date: str,
        seconds_to_add: int,
    ) -> ExternalHoursDaily:
        """Add seconds to an existing record or create a new one."""
        stmt = select(ExternalHoursDaily).where(
            ExternalHoursDaily.work_date == work_date
        )
        result = await db.execute(stmt)
        existing = result.scalars().first()

        if existing:
            existing.total_seconds += seconds_to_add
            existing.updated_at = datetime.now(timezone.utc)
            record = existing
        else:
            record = ExternalHoursDaily(
                work_date=work_date,
                total_seconds=seconds_to_add,
                source="tempo",
            )
            db.add(record)

        await db.flush()
        return record

    async def get_by_date_range(
        self,
        db: AsyncSession,
        start_date: str,
        end_date: str,
    ) -> list[dict[str, object]]:
        """Return daily hours within a date range as dicts."""
        stmt = (
            select(ExternalHoursDaily)
            .where(ExternalHoursDaily.work_date >= start_date)
            .where(ExternalHoursDaily.work_date <= end_date)
            .order_by(ExternalHoursDaily.work_date.asc())
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()

        return [
            {
                "work_date": r.work_date,
                "total_seconds": r.total_seconds,
                "source": r.source,
            }
            for r in rows
        ]

    async def get_by_date(
        self,
        db: AsyncSession,
        work_date: str,
    ) -> ExternalHoursDaily | None:
        """Find a record by exact date."""
        stmt = select(ExternalHoursDaily).where(
            ExternalHoursDaily.work_date == work_date
        )
        result = await db.execute(stmt)
        return result.scalars().first()
