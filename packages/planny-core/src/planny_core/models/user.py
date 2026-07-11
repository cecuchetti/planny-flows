"""User model — mirrors ``api/src/entities/User.ts``.

Table name: ``user``
Column ``avatarUrl`` uses camelCase to match TypeORM's auto-generated name.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planny_core.database import Base

if TYPE_CHECKING:
    from planny_core.models.comment import Comment
    from planny_core.models.issue import Issue
    from planny_core.models.project import Project


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200))
    avatarUrl: Mapped[str] = mapped_column(String(2000))  # noqa: N815 — camelCase matches TypeORM

    projectId: Mapped[int] = mapped_column(  # noqa: N815 — camelCase matches TypeORM
        Integer,
        ForeignKey("project.id"),
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
    project: Mapped[Project] = relationship(
        "Project",
        back_populates="users",
    )
    comments: Mapped[list[Comment]] = relationship(
        "Comment",
        back_populates="user",
    )
    issues: Mapped[list[Issue]] = relationship(
        "Issue",
        secondary="issue_users_user",
        back_populates="users",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} name={self.name!r}>"
