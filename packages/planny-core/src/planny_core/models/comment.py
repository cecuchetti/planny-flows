"""Comment model — mirrors ``api/src/entities/Comment.ts``.

Table name: ``comment``
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planny_core.database import Base

if TYPE_CHECKING:
    from planny_core.models.issue import Issue
    from planny_core.models.user import User


class Comment(Base):
    __tablename__ = "comment"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    body: Mapped[str] = mapped_column(Text)

    userId: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"))  # noqa: N815
    issueId: Mapped[int] = mapped_column(  # noqa: N815
        Integer,
        ForeignKey("issue.id", ondelete="CASCADE"),
    )

    createdAt: Mapped[datetime] = mapped_column(  # noqa: N815 — camelCase matches TypeORM
        DateTime,
        default=datetime.utcnow,
    )
    updatedAt: Mapped[datetime] = mapped_column(  # noqa: N815 — camelCase matches TypeORM
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # ── Relationships ──────────────────────────────────────────────────────
    user: Mapped[User] = relationship(
        "User",
        back_populates="comments",
    )
    issue: Mapped[Issue] = relationship(
        "Issue",
        back_populates="comments",
    )

    def __repr__(self) -> str:
        return f"<Comment id={self.id}>"
