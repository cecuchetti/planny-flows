"""Borrower records used by the personal-loans domain."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planny_core.db.base import Base

if TYPE_CHECKING:
    from planny_core.models.loan import Loan


class Borrower(Base):
    __tablename__ = "borrower"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    firstName: Mapped[str] = mapped_column(String(100))  # noqa: N815
    lastName: Mapped[str] = mapped_column(String(100))  # noqa: N815
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    nationalId: Mapped[str | None] = mapped_column(String(80), nullable=True)  # noqa: N815
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)  # noqa: N815
    updatedAt: Mapped[datetime] = mapped_column(  # noqa: N815
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    loans: Mapped[list[Loan]] = relationship("Loan", back_populates="borrower")


Index(
    "uq_borrower_normalized_name",
    func.lower(func.trim(Borrower.firstName)),
    func.lower(func.trim(Borrower.lastName)),
    unique=True,
)
