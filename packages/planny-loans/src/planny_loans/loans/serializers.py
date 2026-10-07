from __future__ import annotations

from decimal import Decimal

from planny_core.models import Loan


def padded_number(number: int) -> str:
    """Zero-padded five-digit form of a loan number (``1 -> "00001"``)."""
    return f"{number:05d}"


def money(value: Decimal | None) -> str | None:
    """Serialize a money value with exactly two decimals, as a string."""
    return None if value is None else f"{value:.2f}"


def loan_to_dict(loan: Loan, pending_balance: Decimal) -> dict[str, object]:
    borrower = loan.borrower
    return {
        "id": loan.id,
        "number": padded_number(loan.number),
        "borrowerId": loan.borrower_id,
        "borrower": {
            "id": borrower.id,
            "firstName": borrower.firstName,
            "lastName": borrower.lastName,
        },
        "amount": money(loan.amount),
        "advancePaid": money(loan.advancePaid),
        "installmentAmount": money(loan.installmentAmount),
        "pendingBalance": money(pending_balance),
        "currency": loan.currency,
        "date": loan.date.isoformat(),
        "concept": loan.concept,
        "lender": loan.lender,
        "city": loan.city,
        "createdAt": loan.createdAt.isoformat(),
    }
