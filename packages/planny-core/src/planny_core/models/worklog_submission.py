"""WorklogSubmission model — mirrors ``api/src/entities/WorklogSubmission.ts``.

Table name: ``worklog_submission``
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planny_core.database import Base

if TYPE_CHECKING:
    from planny_core.models.worklog_submission_result import WorklogSubmissionResult


class WorklogSubmission(Base):
    __tablename__ = "worklog_submission"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(
        String(255),
        unique=True,
    )
    target: Mapped[str] = mapped_column(String(10))
    tempo_issue_key: Mapped[str] = mapped_column(String(255))
    external_issue_key: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    work_date: Mapped[str] = mapped_column(String(10))
    started_at: Mapped[str | None] = mapped_column(String(50), nullable=True)
    time_spent_seconds: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text)
    overall_status: Mapped[str] = mapped_column(String(20))

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # ── Relationships ──────────────────────────────────────────────────────
    results: Mapped[list[WorklogSubmissionResult]] = relationship(
        "WorklogSubmissionResult",
        back_populates="submission",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<WorklogSubmission id={self.id} request_id={self.request_id!r}>"
