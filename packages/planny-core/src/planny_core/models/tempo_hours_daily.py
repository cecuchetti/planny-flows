"""TempoHoursDaily model — mirrors ``api/src/entities/TempoHoursDaily.ts``.

Table name: ``tempo_hours_daily``
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from planny_core.database import Base


class TempoHoursDaily(Base):
    __tablename__ = "tempo_hours_daily"

    work_date: Mapped[str] = mapped_column(
        String(10),
        primary_key=True,
    )
    hours_logged: Mapped[float] = mapped_column(Numeric(6, 2), default=0)
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

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
        return f"<TempoHoursDaily work_date={self.work_date!r}>"
