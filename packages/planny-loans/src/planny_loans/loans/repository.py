from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import NamedTuple

from planny_core.models import Borrower, Loan, Payment
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.sql.selectable import Subquery


async def list_loans(
    db: AsyncSession, *, status: str | None = None
) -> list[Loan]:
    """Loans, optionally scoped to one lifecycle status.

    Without a ``status`` every loan is returned, newest first. With one, the
    ordering follows the section it feeds: active loans newest first, closed
    loans most-recently-closed first. The borrower is eagerly loaded by the
    model, and the router asks for the two sections rather than building either
    query itself.
    """
    query = select(Loan)
    if status == "closed":
        query = query.where(Loan.status == "closed").order_by(
            Loan.closedAt.desc(), Loan.id.desc()
        )
    elif status == "active":
        query = query.where(Loan.status == "active").order_by(
            Loan.createdAt.desc(), Loan.id.desc()
        )
    else:
        query = query.order_by(Loan.createdAt.desc(), Loan.id.desc())
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


class CurrencyTotals(NamedTuple):
    """One currency's portfolio aggregates, straight off the ``GROUP BY``."""

    currency: str
    principal: Decimal
    advance_paid: Decimal
    payments: Decimal
    written_off: Decimal
    active_count: int
    closed_count: int
    outstanding: Decimal


def _active_payments() -> Subquery:
    """Per-loan sum of the payments still in force.

    A reversed payment is not collection, so it is left out — the same rule the
    derived balance and the "collected" metric share.
    """
    return (
        select(
            Payment.loan_id.label("loan_id"),
            func.coalesce(func.sum(Payment.amount), 0).label("paid"),
        )
        .where(Payment.reversedAt.is_(None))
        .group_by(Payment.loan_id)
        .subquery()
    )


async def portfolio_totals(db: AsyncSession) -> list[CurrencyTotals]:
    """Per-currency portfolio aggregates: one row per currency, never combined.

    ``outstanding`` is the derived balance summed over every loan. Closed loans
    contribute zero by construction — their ``writtenOffAmount`` is exactly the
    balance that was condoned, so ``amount - advancePaid - payments - writtenOff``
    cancels to zero — which leaves only the active loans' balances in the total.
    The amounts are raw ``Decimal``; the service rounds them through ``_money``.
    """
    paid = _active_payments()
    stmt = (
        select(
            Loan.currency,
            func.sum(func.coalesce(Loan.amount, 0)).label("principal"),
            func.sum(func.coalesce(Loan.advancePaid, 0)).label("advance_paid"),
            func.sum(func.coalesce(paid.c.paid, 0)).label("payments"),
            func.sum(func.coalesce(Loan.writtenOffAmount, 0)).label("written_off"),
            func.sum(case((Loan.status == "active", 1), else_=0)).label("active_count"),
            func.sum(case((Loan.status == "closed", 1), else_=0)).label("closed_count"),
            func.sum(
                func.coalesce(Loan.amount, 0)
                - func.coalesce(Loan.advancePaid, 0)
                - func.coalesce(paid.c.paid, 0)
                - func.coalesce(Loan.writtenOffAmount, 0)
            ).label("outstanding"),
        )
        .outerjoin(paid, paid.c.loan_id == Loan.id)
        .group_by(Loan.currency)
        .order_by(Loan.currency)
    )
    rows = (await db.execute(stmt)).all()
    return [
        CurrencyTotals(
            currency=str(row.currency),
            principal=Decimal(row.principal),
            advance_paid=Decimal(row.advance_paid),
            payments=Decimal(row.payments),
            written_off=Decimal(row.written_off),
            active_count=int(row.active_count),
            closed_count=int(row.closed_count),
            outstanding=Decimal(row.outstanding),
        )
        for row in rows
    ]


async def near_completion(db: AsyncSession) -> list[tuple[Loan, Decimal]]:
    """Active loans with their recovered amount (``advancePaid + Σ active payments``).

    The threshold comparison is a business rule and is done by the service, in
    exact two-decimal ``Decimal`` arithmetic. SQLite computes these sums as floats,
    so filtering at the 80% boundary in SQL would misjudge an exact hit — the
    service rounds the raw value back through ``_money`` before comparing. The
    borrower is loaded eagerly so the serializer can read the name in one query.
    """
    paid = _active_payments()
    recovered = func.coalesce(Loan.advancePaid, 0) + func.coalesce(paid.c.paid, 0)
    stmt = (
        select(Loan, recovered.label("recovered"))
        .options(joinedload(Loan.borrower))
        .outerjoin(paid, paid.c.loan_id == Loan.id)
        .where(Loan.status == "active")
        .order_by(Loan.id)
    )
    result: list[tuple[Loan, Decimal]] = []
    for row in (await db.execute(stmt)).all():
        loan: Loan = row[0]
        result.append((loan, Decimal(row[1])))
    return result


async def recent_payments(db: AsyncSession, limit: int = 5) -> list[Payment]:
    """The most recent payments still in force, newest first.

    The loan and its borrower are loaded eagerly in one extra round trip each, so
    the serializer reaches ``payment.loan.number`` and the borrower name without
    the N+1 a lazy read would cost.
    """
    stmt = (
        select(Payment)
        .options(selectinload(Payment.loan).selectinload(Loan.borrower))
        .where(Payment.reversedAt.is_(None))
        .order_by(Payment.date.desc(), Payment.id.desc())
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def collected_this_month(db: AsyncSession) -> dict[str, Decimal]:
    """Payments still in force this calendar month, summed per currency.

    The month is the server's current UTC month, matching how payment dates are
    stamped. A payment from an earlier month is not "collected this month".
    """
    now = datetime.utcnow()
    start = datetime(now.year, now.month, 1)
    end = (
        datetime(now.year + 1, 1, 1)
        if now.month == 12
        else datetime(now.year, now.month + 1, 1)
    )
    result = await db.execute(
        select(
            Loan.currency,
            func.coalesce(func.sum(Payment.amount), 0).label("paid"),
        )
        .join(Payment, Payment.loan_id == Loan.id)
        .where(
            Payment.reversedAt.is_(None),
            Payment.date >= start,
            Payment.date < end,
        )
        .group_by(Loan.currency)
    )
    return {str(currency): Decimal(paid) for currency, paid in result.all()}
