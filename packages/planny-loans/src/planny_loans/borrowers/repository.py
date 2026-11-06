from __future__ import annotations

from typing import NamedTuple

from planny_core.models import Borrower
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession


class BorrowerLoanStats(NamedTuple):
    """Per-borrower financial aggregates for the directory and detail views."""

    borrower_id: int
    active_loan_count: int
    total_amount: float
    remaining_balance: float
    recovery_percent: float


async def list_borrowers(db: AsyncSession, search: str | None = None) -> list[Borrower]:
    query = select(Borrower).order_by(func.lower(Borrower.lastName), func.lower(Borrower.firstName))
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.where(
            or_(func.lower(Borrower.firstName).like(term), func.lower(Borrower.lastName).like(term))
        )
    return list((await db.execute(query)).scalars().all())


async def get(db: AsyncSession, borrower_id: int) -> Borrower | None:
    return await db.get(Borrower, borrower_id)


async def find_by_name(db: AsyncSession, first_name: str, last_name: str) -> Borrower | None:
    result = await db.execute(
        select(Borrower).where(
            func.lower(func.trim(Borrower.firstName)) == first_name.strip().lower(),
            func.lower(func.trim(Borrower.lastName)) == last_name.strip().lower(),
        )
    )
    return result.scalars().first()


async def linked_loan_count(db: AsyncSession, borrower_id: int) -> int:
    """Count future loan links without coupling this domain to the loan model."""
    try:
        result = await db.execute(
            text("SELECT COUNT(*) FROM loan WHERE borrower_id = :borrower_id"),
            {"borrower_id": borrower_id},
        )
    except OperationalError as exc:
        detail = str(exc.orig).lower()
        if "no such table: loan" not in detail and 'relation "loan" does not exist' not in detail:
            raise
        return 0
    return int(result.scalar_one())


async def linked_loan_counts(db: AsyncSession) -> dict[int, int]:
    """Linked-loan counts for every borrower, in one query.

    A count per borrower rather than a query per row: the directory renders the
    count for each entry, and an N+1 here grows with the directory.
    """
    try:
        result = await db.execute(
            text("SELECT borrower_id, COUNT(*) FROM loan GROUP BY borrower_id")
        )
    except OperationalError as exc:
        detail = str(exc.orig).lower()
        if "no such table: loan" not in detail and 'relation "loan" does not exist' not in detail:
            raise
        return {}
    return {int(row[0]): int(row[1]) for row in result.all()}


async def borrower_loan_stats(db: AsyncSession, borrower_id: int) -> BorrowerLoanStats:
    """Financial aggregates for one borrower's loans.

    Uses raw SQL to avoid coupling the borrower domain to the ``Payment`` model.
    Falls back to empty stats when the ``loan`` or ``payment`` table does not
    exist (the loans domain is optional).
    """
    try:
        result = await db.execute(
            text(
                """
                SELECT
                    l.borrower_id,
                    COUNT(CASE WHEN l.status = 'active' THEN 1 END),
                    COALESCE(SUM(l.amount), 0),
                    COALESCE(SUM(l.amount - l.advancePaid
                        - COALESCE(p.paid, 0)
                        - COALESCE(l.writtenOffAmount, 0)), 0),
                    CASE
                        WHEN COALESCE(SUM(l.amount), 0) > 0
                        THEN COALESCE(SUM(l.advancePaid
                            + COALESCE(p.paid, 0)), 0)
                            * 100.0 / COALESCE(SUM(l.amount), 1)
                        ELSE 0
                    END
                FROM loan l
                LEFT JOIN (
                    SELECT loan_id, COALESCE(SUM(amount), 0) AS paid
                    FROM payment
                    WHERE reversedAt IS NULL
                    GROUP BY loan_id
                ) p ON p.loan_id = l.id
                WHERE l.borrower_id = :borrower_id
                GROUP BY l.borrower_id
                """,
            ),
            {"borrower_id": borrower_id},
        )
        row = result.one_or_none()
    except OperationalError as exc:
        detail = str(exc.orig).lower()
        if "no such table: loan" not in detail and "no such table: payment" not in detail:
            raise
        return BorrowerLoanStats(borrower_id, 0, 0.0, 0.0, 0.0)

    if row is None:
        return BorrowerLoanStats(borrower_id, 0, 0.0, 0.0, 0.0)

    return BorrowerLoanStats(
        borrower_id=int(row[0]),
        active_loan_count=int(row[1]),
        total_amount=float(row[2]),
        remaining_balance=float(row[3]),
        recovery_percent=float(row[4]),
    )


async def all_borrower_loan_stats(db: AsyncSession) -> dict[int, BorrowerLoanStats]:
    """Financial aggregates for all borrowers, in one query.

    Returns a dict keyed by ``borrower_id`` so the directory loop can look up
    each borrower's stats in O(1).
    """
    try:
        result = await db.execute(
            text(
                """
                SELECT
                    l.borrower_id,
                    COUNT(CASE WHEN l.status = 'active' THEN 1 END),
                    COALESCE(SUM(l.amount), 0),
                    COALESCE(SUM(l.amount - l.advancePaid
                        - COALESCE(p.paid, 0)
                        - COALESCE(l.writtenOffAmount, 0)), 0),
                    CASE
                        WHEN COALESCE(SUM(l.amount), 0) > 0
                        THEN COALESCE(SUM(l.advancePaid
                            + COALESCE(p.paid, 0)), 0)
                            * 100.0 / COALESCE(SUM(l.amount), 1)
                        ELSE 0
                    END
                FROM loan l
                LEFT JOIN (
                    SELECT loan_id, COALESCE(SUM(amount), 0) AS paid
                    FROM payment
                    WHERE reversedAt IS NULL
                    GROUP BY loan_id
                ) p ON p.loan_id = l.id
                GROUP BY l.borrower_id
                """,
            ),
        )
    except OperationalError as exc:
        detail = str(exc.orig).lower()
        if "no such table: loan" not in detail and "no such table: payment" not in detail:
            raise
        return {}

    return {
        int(row[0]): BorrowerLoanStats(
            borrower_id=int(row[0]),
            active_loan_count=int(row[1]),
            total_amount=float(row[2]),
            remaining_balance=float(row[3]),
            recovery_percent=float(row[4]),
        )
        for row in result.all()
    }
