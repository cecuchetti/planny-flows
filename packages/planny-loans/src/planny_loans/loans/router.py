from __future__ import annotations

from fastapi import APIRouter, Depends
from planny_api.dependencies import get_db
from planny_core.errors import EntityNotFoundError
from planny_core.models import Loan
from sqlalchemy.ext.asyncio import AsyncSession

from planny_loans.loans import repository, service
from planny_loans.loans.schemas import LoanRequest, PaymentRequest
from planny_loans.loans.serializers import loan_to_dict, payment_to_dict

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


async def _loan_dict(db: AsyncSession, loan: Loan) -> dict[str, object]:
    return loan_to_dict(loan, await service.pending_balance(db, loan))


@router.get("")
async def list_loans(db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    loans = await repository.list_loans(db)
    return {"loans": [await _loan_dict(db, loan) for loan in loans]}


@router.post("", status_code=201)
async def create_loan(body: LoanRequest, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    loan = await service.create(db, _values(body))
    return {"loan": await _loan_dict(db, loan)}


@router.get("/{loan_id}")
async def get_loan(loan_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    loan = await repository.get(db, loan_id)
    if loan is None:
        raise EntityNotFoundError("Loan", message="No encontramos ese préstamo.")
    return {"loan": await _loan_dict(db, loan)}


@router.put("/{loan_id}")
async def update_loan(
    loan_id: int, body: LoanRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    loan = await service.update(db, loan_id, _values(body))
    return {"loan": await _loan_dict(db, loan)}


@router.delete("/{loan_id}", status_code=204)
async def delete_loan(loan_id: int, db: AsyncSession = Depends(get_db)) -> None:
    await service.delete(db, loan_id)


@router.get("/{loan_id}/payments")
async def list_payments(loan_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    """The loan's payment history, oldest first.

    Nested under the loan, and its own request, so the loan list stays lean.
    """
    payments = await service.list_payments(db, loan_id)
    return {"payments": [payment_to_dict(payment) for payment in payments]}


@router.post("/{loan_id}/payments", status_code=201)
async def create_payment(
    loan_id: int, body: PaymentRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    payment = await service.create_payment(db, loan_id, {"amount": body.amount})
    return {"payment": payment_to_dict(payment)}


@router.delete("/{loan_id}/payments/{payment_id}", status_code=204)
async def delete_payment(
    loan_id: int, payment_id: int, db: AsyncSession = Depends(get_db)
) -> None:
    await service.delete_payment(db, loan_id, payment_id)
