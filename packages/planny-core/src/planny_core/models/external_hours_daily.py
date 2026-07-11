"""ExternalHoursDaily model — mirrors ``api/src/entities/ExternalHoursDaily.ts``.

Table name: ``external_hours_daily``
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from planny_core.database import Base


class ExternalHoursDaily(Base):
    __tablename__ = "external_hours_daily"

    work_date: Mapped[str] = mapped_column(
        String(10),
        primary_key=True,
    )
    total_seconds: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(20), default="tempo")

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
        return f"<ExternalHoursDaily work_date={self.work_date!r}>"
