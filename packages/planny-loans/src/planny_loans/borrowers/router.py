from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from planny_api.dependencies import get_db
from sqlalchemy.ext.asyncio import AsyncSession

from planny_loans.borrowers import repository, service
from planny_loans.borrowers.schemas import BorrowerRequest
from planny_loans.borrowers.serializers import borrower_to_dict


def _to_decimal(value: float) -> Decimal | None:
    return Decimal(str(value))

router = APIRouter(prefix="/borrowers", tags=["borrowers"])


def _values(body: BorrowerRequest) -> dict[str, object]:
    return {
        "firstName": body.first_name,
        "lastName": body.last_name,
        "email": body.email,
        "phone": body.phone,
        "address": body.address,
        "nationalId": body.national_id,
        "notes": body.notes,
    }


@router.get("")
async def list_borrowers(
    search: str | None = Query(default=None), db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    borrowers = await repository.list_borrowers(db, search)
    counts = await repository.linked_loan_counts(db)
    stats_by_borrower = await repository.all_borrower_loan_stats(db)
    return {
        "borrowers": [
            borrower_to_dict(
                item,
                loan_count=counts.get(item.id or 0, 0),
                active_loan_count=(
                    stats_by_borrower[item.id].active_loan_count
                    if item.id in stats_by_borrower
                    else 0
                ),
                total_historical_amount=(
                    _to_decimal(stats_by_borrower[item.id].total_amount)
                    if item.id in stats_by_borrower
                    else None
                ),
                remaining_balance=(
                    _to_decimal(stats_by_borrower[item.id].remaining_balance)
                    if item.id in stats_by_borrower
                    else None
                ),
                recovery_percent=(
                    stats_by_borrower[item.id].recovery_percent
                    if item.id in stats_by_borrower
                    else 0.0
                ),
            )
            for item in borrowers
        ]
    }


@router.post("", status_code=201)
async def create_borrower(
    body: BorrowerRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    borrower = await service.create(db, _values(body))
    return {"borrower": borrower_to_dict(borrower)}


async def _borrower_with_stats(
    db: AsyncSession, borrower_id: int
) -> dict[str, object] | None:
    """Fetch a borrower with its enriched loan stats.

    Returns ``None`` when the borrower does not exist.
    """
    borrower = await repository.get(db, borrower_id)
    if borrower is None:
        return None
    count = await repository.linked_loan_count(db, borrower_id)
    stats = await repository.borrower_loan_stats(db, borrower_id)
    return borrower_to_dict(
        borrower,
        loan_count=count,
        active_loan_count=stats.active_loan_count,
        total_historical_amount=_to_decimal(stats.total_amount) if stats.total_amount else None,
        remaining_balance=_to_decimal(stats.remaining_balance) if stats.remaining_balance else None,
        recovery_percent=stats.recovery_percent,
    )


@router.get("/{borrower_id}")
async def get_borrower(borrower_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    result = await _borrower_with_stats(db, borrower_id)
    if result is None:
        from planny_core.errors import EntityNotFoundError
        raise EntityNotFoundError("Borrower", message="No encontramos esa persona.")
    return {"borrower": result}


@router.put("/{borrower_id}")
async def update_borrower(
    borrower_id: int, body: BorrowerRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    await service.update(db, borrower_id, _values(body))
    result = await _borrower_with_stats(db, borrower_id)
    assert result is not None  # just updated, must exist
    return {"borrower": result}


@router.delete("/{borrower_id}", status_code=204)
async def delete_borrower(borrower_id: int, db: AsyncSession = Depends(get_db)) -> None:
    await service.delete(db, borrower_id)
