"""WorklogSubmissionResult model — mirrors ``api/src/entities/WorklogSubmissionResult.ts``.

Table name: ``worklog_submission_result``
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planny_core.database import Base

if TYPE_CHECKING:
    from planny_core.models.worklog_submission import WorklogSubmission


class WorklogSubmissionResult(Base):
    __tablename__ = "worklog_submission_result"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    submission_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("worklog_submission.id", ondelete="CASCADE"),
    )

    target_system: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10))
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    request_payload: Mapped[str] = mapped_column(Text)
    response_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    submission: Mapped[WorklogSubmission] = relationship(
        "WorklogSubmission",
        back_populates="results",
    )

    def __repr__(self) -> str:
        return f"<WorklogSubmissionResult id={self.id}>"
