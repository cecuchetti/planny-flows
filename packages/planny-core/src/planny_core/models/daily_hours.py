"""DailyHours model — mirrors ``api/src/entities/DailyHours.ts``.

Table name: ``daily_hours``

Has a unique index on ``work_date`` matching TypeORM's
``@Index('IDX_daily_hours_work_date', ['workDate'], { unique: true })``.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from planny_core.database import Base


class DailyHours(Base):
    __tablename__ = "daily_hours"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    work_date: Mapped[str] = mapped_column(
        String(10),
        unique=True,
    )
    hours_logged: Mapped[float] = mapped_column(Numeric(6, 2))
    source: Mapped[str] = mapped_column(String(20))

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    def __repr__(self) -> str:
        return f"<DailyHours id={self.id} work_date={self.work_date!r}>"
