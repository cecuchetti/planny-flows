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
    active = await repository.list_loans(db, status=service.ACTIVE)
    closed = await repository.list_loans(db, status=service.CLOSED)
    return {
        "loans": {
            "active": [await _loan_dict(db, loan) for loan in active],
            "closed": [await _loan_dict(db, loan) for loan in closed],
        }
    }


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


@router.post("/{loan_id}/close")
async def close_loan(loan_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    loan = await service.close_loan(db, loan_id)
    return {"loan": await _loan_dict(db, loan)}


@router.post("/{loan_id}/reopen")
async def reopen_loan(loan_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    loan = await service.reopen_loan(db, loan_id)
    return {"loan": await _loan_dict(db, loan)}


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
async def reverse_payment(
    loan_id: int, payment_id: int, db: AsyncSession = Depends(get_db)
) -> None:
    """Reverse a payment.

    The verb and the status are what they always were, because this is the
    endpoint the client already calls and the operation it wants; what changed is
    that the row is kept and marked instead of deleted.

    There is deliberately no ``POST`` twin for this: an unused alias on a route
    nobody calls is surface nobody tests. Undoing is the ``DELETE`` below, its
    inverse.
    """
    await service.reverse_payment(db, loan_id, payment_id)


@router.delete("/{loan_id}/payments/{payment_id}/reversal", status_code=204)
async def undo_reversal(
    loan_id: int, payment_id: int, db: AsyncSession = Depends(get_db)
) -> None:
    """Undo a reversal, so a mistaken one costs nothing."""
    await service.unreverse_payment(db, loan_id, payment_id)
