"""Issue model — mirrors ``api/src/entities/Issue.ts``.

Table name: ``issue``

Junction table ``issue_users_user`` is defined here and imported via
``__init__.py`` so it is registered on ``Base.metadata``.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

import bleach
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Table, Text, event
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planny_core.database import Base

if TYPE_CHECKING:
    from planny_core.models.comment import Comment
    from planny_core.models.project import Project
    from planny_core.models.user import User


# TypeORM auto-generates this junction table for @JoinTable() on Issue.users
issue_users = Table(
    "issue_users_user",
    Base.metadata,
    Column("issueId", Integer, ForeignKey("issue.id"), primary_key=True),
    Column("userId", Integer, ForeignKey("user.id"), primary_key=True),
)


class Issue(Base):
    __tablename__ = "issue"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50))
    priority: Mapped[str] = mapped_column(String(10))
    listPosition: Mapped[float] = mapped_column(Float)  # noqa: N815 — camelCase matches TypeORM

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    descriptionText: Mapped[str | None] = mapped_column(Text, nullable=True)  # noqa: N815

    estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timeSpent: Mapped[int | None] = mapped_column(Integer, nullable=True)  # noqa: N815
    timeRemaining: Mapped[int | None] = mapped_column(Integer, nullable=True)  # noqa: N815

    reporterId: Mapped[int] = mapped_column(Integer)  # noqa: N815
    projectId: Mapped[int] = mapped_column(Integer, ForeignKey("project.id"))  # noqa: N815

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
        back_populates="issues",
    )
    comments: Mapped[list[Comment]] = relationship(
        "Comment",
        back_populates="issue",
        cascade="all, delete-orphan",
    )
    users: Mapped[list[User]] = relationship(
        "User",
        secondary="issue_users_user",
        back_populates="issues",
    )

    def __repr__(self) -> str:
        return f"<Issue id={self.id} title={self.title!r}>"


# ── Striptags hook ───────────────────────────────────────────────────────────
# Replicates TypeORM's @BeforeInsert/@BeforeUpdate setDescriptionText()


@event.listens_for(Issue, "before_insert")
@event.listens_for(Issue, "before_update")
def set_description_text(mapper: object, connection: object, target: Issue) -> None:
    """Strip HTML tags from ``description`` into ``descriptionText``.

    Mirrors the striptags behaviour in the TypeScript Issue entity.
    """
    if target.description:
        target.descriptionText = bleach.clean(
            target.description,
            tags=[],
            strip=True,
        )
