from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from planny_api.dependencies import get_db
from planny_core.models import Payment
from sqlalchemy.ext.asyncio import AsyncSession

from planny_loans.borrowers import repository, service
from planny_loans.borrowers.schemas import BorrowerRequest
from planny_loans.borrowers.serializers import (
    borrower_detail_fields,
    borrower_to_dict,
    build_activity,
)
from planny_loans.loans import repository as loans_repository
from planny_loans.loans.serializers import loan_to_dict


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


async def _borrower_detail(db: AsyncSession, borrower_id: int) -> dict[str, object] | None:
    """Fetch a borrower with every field the detail page renders.

    Includes the stats from ``_borrower_with_stats``, plus mocked profile
    fields, the borrower's loans (with their pending balances) and an activity
    timeline from real payments.
    """
    borrower = await repository.get(db, borrower_id)
    if borrower is None:
        return None
    count = await repository.linked_loan_count(db, borrower_id)
    stats = await repository.borrower_loan_stats(db, borrower_id)
    result = borrower_to_dict(
        borrower,
        loan_count=count,
        active_loan_count=stats.active_loan_count,
        total_historical_amount=_to_decimal(stats.total_amount) if stats.total_amount else None,
        remaining_balance=_to_decimal(stats.remaining_balance) if stats.remaining_balance else None,
        recovery_percent=stats.recovery_percent,
    )

    # Enrich with detail-only fields.
    result.update(borrower_detail_fields(borrower))

    # Loans with pending balances (computed locally from eagerly-loaded payments).
    loans = await loans_repository.list_loans_by_borrower(db, borrower_id)
    loan_dicts = []
    all_payments: list[Payment] = []
    for loan in loans:
        collected = sum(
            (p.amount for p in loan.payments if p.reversedAt is None),
            Decimal("0.00"),
        )
        advance = loan.advancePaid or Decimal("0.00")
        written_off = loan.writtenOffAmount or Decimal("0.00")
        balance = Decimal("0.00")
        if loan.amount:
            balance = (loan.amount - advance - collected - written_off).quantize(
                Decimal("0.01")
            )
        loan_dicts.append(loan_to_dict(loan, balance))
        all_payments.extend(loan.payments)

    result["loans"] = loan_dicts
    result["activity"] = build_activity(loans, all_payments)

    return result


@router.get("/{borrower_id}")
async def get_borrower(borrower_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    result = await _borrower_detail(db, borrower_id)
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
