"""Payments collected against a loan, each carrying its own frozen snapshot.

``paymentsHistoryAtPayment`` holds the full history *up to and including this
payment*, and the three balance columns hold the figures in effect at that
moment. The snapshot is stored on the row rather than recomputed from sibling
payments: deleting a later payment must not rewrite a receipt that was already
handed to a borrower.

``loan_id`` stays snake_case on purpose, matching ``loan.borrower_id`` — the
borrowers count guard binds those exact column names.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from planny_core.db.base import Base

if TYPE_CHECKING:
    from planny_core.models.loan import Loan


class Payment(Base):
    __tablename__ = "payment"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loan.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # The frozen snapshot: everything a historical receipt is rendered from.
    # History amounts are stored as two-decimal strings, the same representation
    # the API returns, so the snapshot round-trips exactly.
    pendingBalanceAtPayment: Mapped[Decimal] = mapped_column(Numeric(14, 2))  # noqa: N815
    totalPaidAtPayment: Mapped[Decimal] = mapped_column(Numeric(14, 2))  # noqa: N815
    advancePaidAtPayment: Mapped[Decimal] = mapped_column(Numeric(14, 2))  # noqa: N815
    paymentsHistoryAtPayment: Mapped[list[dict[str, Any]]] = mapped_column(JSON)  # noqa: N815
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)  # noqa: N815

    # Deleting a loan removes its payments: the service deletes them explicitly
    # before the loan, and ``passive_deletes`` keeps the ORM from nulling the
    # foreign key behind it.
    loan: Mapped[Loan] = relationship(
        "Loan",
        back_populates="payments",
        lazy="joined",
        passive_deletes=True,
    )


Index("ix_payment_loan_id", Payment.loan_id)
