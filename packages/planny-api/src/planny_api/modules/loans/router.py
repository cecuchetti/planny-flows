from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.dependencies import get_db
from planny_api.modules.loans import repository, service
from planny_api.modules.loans.schemas import LoanRequest
from planny_api.modules.loans.serializers import loan_to_dict

router = APIRouter(prefix="/loans", tags=["loans"])


_FIELD_NAMES = {
    "borrower_id": "borrowerId",
    "amount": "amount",
    "currency": "currency",
    "date": "date",
    "concept": "concept",
    "lender": "lender",
    "city": "city",
    "advance_paid": "advancePaid",
    "installment_amount": "installmentAmount",
}


def _values(body: LoanRequest) -> dict[str, object]:
    """Only the fields the request actually sent.

    ``model_fields_set`` separates an omitted field (keep the stored value) from
    an explicit ``null`` (clear it). Emitting every key unconditionally made the
    service's ``_MISSING`` sentinel unreachable, so a ``PUT`` that left a
    required field out was rejected instead of keeping the stored value.
    """
    return {
        key: getattr(body, field)
        for field, key in _FIELD_NAMES.items()
        if field in body.model_fields_set
    }


@router.get("")
async def list_loans(db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    loans = await repository.list_loans(db)
    return {"loans": [loan_to_dict(loan, service.pending_balance(loan)) for loan in loans]}


@router.post("", status_code=201)
async def create_loan(body: LoanRequest, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    loan = await service.create(db, _values(body))
    return {"loan": loan_to_dict(loan, service.pending_balance(loan))}


@router.get("/{loan_id}")
async def get_loan(loan_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    loan = await repository.get(db, loan_id)
    if loan is None:
        from planny_core.errors import EntityNotFoundError

        raise EntityNotFoundError("Loan", message="No encontramos ese préstamo.")
    return {"loan": loan_to_dict(loan, service.pending_balance(loan))}


@router.put("/{loan_id}")
async def update_loan(
    loan_id: int, body: LoanRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    loan = await service.update(db, loan_id, _values(body))
    return {"loan": loan_to_dict(loan, service.pending_balance(loan))}


@router.delete("/{loan_id}", status_code=204)
async def delete_loan(loan_id: int, db: AsyncSession = Depends(get_db)) -> None:
    await service.delete(db, loan_id)
