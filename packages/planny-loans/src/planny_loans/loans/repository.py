from __future__ import annotations

from decimal import Decimal

from planny_core.models import Borrower, Loan, Payment
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def list_loans(db: AsyncSession) -> list[Loan]:
    """Every loan, newest first. The borrower is eagerly loaded by the model."""
    query = select(Loan).order_by(Loan.createdAt.desc(), Loan.id.desc())
    return list((await db.execute(query)).scalars().all())


async def get(db: AsyncSession, loan_id: int) -> Loan | None:
    return await db.get(Loan, loan_id)


async def borrower_exists(db: AsyncSession, borrower_id: int) -> bool:
    result = await db.execute(select(Borrower.id).where(Borrower.id == borrower_id))
    return result.first() is not None


async def next_number(db: AsyncSession) -> int:
    """The next sequence value: ``max(number) + 1``.

    Deriving the next number from the current maximum lets a backfilled legacy
    maximum continue the sequence without any extra bookkeeping.
    """
    result = await db.execute(select(func.max(Loan.number)))
    return int(result.scalar_one() or 0) + 1


async def list_payments(
    db: AsyncSession, loan_id: int, *, active_only: bool = False
) -> list[Payment]:
    """Every payment of the loan, oldest first — the order a receipt reads in.

    Reversed rows are included by default: the history has to show them, marked,
    rather than let them disappear. ``active_only`` is for the paths that must
    count only what is still in force — the frozen history of a new payment, and
    the sum the derived balance is built from.
    """
    query = select(Payment).where(Payment.loan_id == loan_id)
    if active_only:
        query = query.where(Payment.reversedAt.is_(None))
    query = query.order_by(Payment.date.asc(), Payment.id.asc())
    return list((await db.execute(query)).scalars().all())


async def sum_payments(db: AsyncSession, loan_id: int) -> Decimal:
    """Everything collected and still in force, rounded like every other sum.

    A reversed payment is not collected money any more, so it is left out of the
    one aggregate the derived balance is built from.
    """
    result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.loan_id == loan_id, Payment.reversedAt.is_(None)
        )
    )
    return Decimal(result.scalar_one())


async def get_payment(db: AsyncSession, loan_id: int, payment_id: int) -> Payment | None:
    """One payment, scoped to its loan so an id from another loan is a 404."""
    query = select(Payment).where(Payment.id == payment_id, Payment.loan_id == loan_id)
    return (await db.execute(query)).scalars().first()


async def sum_all_payments(db: AsyncSession, loan_id: int) -> Decimal:
    """Every payment ever collected, reversed ones included.

    This is not the balance term — the balance counts only what is in force —
    but it is the money that actually changed hands. A loan's ``amount`` has to
    cover it, otherwise undoing a reversal would push the derived balance below
    zero with no way back, since the outstanding balance would then be negative
    and every new payment would be refused.
    """
    result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.loan_id == loan_id)
    )
    return Decimal(result.scalar_one())
