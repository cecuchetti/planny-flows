from __future__ import annotations

from planny_core.models import Borrower
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession


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
