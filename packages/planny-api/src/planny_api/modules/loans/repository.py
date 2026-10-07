from __future__ import annotations

from planny_core.models import Borrower, Loan
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
