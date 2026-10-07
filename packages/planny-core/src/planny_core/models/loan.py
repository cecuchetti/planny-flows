"""Loan records for the personal-loans domain.

``number`` carries a unique, sequential, zero-padded identifier. The column is
a plain integer holding the sequence value; the zero-padded form (``"00001"``)
is a serialization concern. The API always assigns the value, but the column
accepts an explicit one so the migration can backfill legacy numbers and the
sequence continues from the migrated maximum.

``borrower_id`` stays snake_case on purpose: ``borrowers/repository.py`` binds
that exact column name in its delete guard, so renaming it would silently
disable the guard.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planny_core.db.base import Base

if TYPE_CHECKING:
    from planny_core.models.borrower import Borrower


class Loan(Base):
    __tablename__ = "loan"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    number: Mapped[int] = mapped_column(unique=True)
    borrower_id: Mapped[int] = mapped_column(ForeignKey("borrower.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    advancePaid: Mapped[Decimal] = mapped_column(  # noqa: N815 — camelCase API/DB contract
        Numeric(14, 2), default=Decimal("0.00")
    )
    installmentAmount: Mapped[Decimal | None] = mapped_column(  # noqa: N815
        Numeric(14, 2), nullable=True
    )
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    date: Mapped[date] = mapped_column(Date)
    concept: Mapped[str] = mapped_column(String(500))
    lender: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(120), default="Córdoba")
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)  # noqa: N815
    updatedAt: Mapped[datetime] = mapped_column(  # noqa: N815
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ``joined`` so listing loans with their borrower stays a single query.
    borrower: Mapped[Borrower] = relationship(
        "Borrower", back_populates="loans", lazy="joined"
    )


Index("ix_loan_borrower_id", Loan.borrower_id)
