"""Project model — mirrors ``api/src/entities/Project.ts``.

Table name: ``project``

New columns (source_type, external_key, external_id, last_synced_at) use
snake_case naming to distinguish them as Python-only columns that do not
mirror TypeORM.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planny_core.database import Base

if TYPE_CHECKING:
    from planny_core.models.issue import Issue
    from planny_core.models.user import User


class Project(Base):
    __tablename__ = "project"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(50))

    createdAt: Mapped[datetime] = mapped_column(  # noqa: N815 — camelCase matches TypeORM
        DateTime,
        default=datetime.utcnow,
    )
    updatedAt: Mapped[datetime] = mapped_column(  # noqa: N815 — camelCase matches TypeORM
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # ── New source-aware columns (Python-only, snake_case) ──────────────────
    source_type: Mapped[str] = mapped_column(String(20), default="local")
    external_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # ── Relationships ──────────────────────────────────────────────────────
    issues: Mapped[list[Issue]] = relationship(
        "Issue",
        back_populates="project",
    )
    users: Mapped[list[User]] = relationship(
        "User",
        secondary="user_projects",
        back_populates="projects",
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id} name={self.name!r}>"
