from __future__ import annotations

from decimal import Decimal

from planny_core.models import Loan, Payment


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
        "status": loan.status,
        "closedAt": loan.closedAt.isoformat() if loan.closedAt else None,
        "writtenOffAmount": money(loan.writtenOffAmount),
        "currency": loan.currency,
        "date": loan.date.isoformat(),
        "concept": loan.concept,
        "lender": loan.lender,
        "city": loan.city,
        "createdAt": loan.createdAt.isoformat(),
    }


def payment_to_dict(payment: Payment) -> dict[str, object]:
    """One payment, its reversal state and the snapshot it was frozen with.

    ``reversedAt`` is the row's own mark: an ISO timestamp once reversed, ``null``
    while the payment is in force.

    ``paymentsHistory`` is passed through as stored — the service froze it with
    the single ``history_entry`` builder, and the reversal annotation is applied
    to that stored list, so re-deriving it here would be a second builder and
    would silently drop whatever it did not think to copy (the reversal mark
    included).

    The one normalisation is the amount's type. Rows written by this build store
    the two-decimal string ``history_entry`` produces, but a row written earlier
    (or migrated in) may hold a bare JSON number, and a reader that echoed that
    back would hand the client a shape no other payment has.
    """
    return {
        "id": payment.id,
        "loanId": payment.loan_id,
        "amount": money(payment.amount),
        "date": payment.date.isoformat(),
        "createdAt": payment.createdAt.isoformat(),
        "reversedAt": payment.reversedAt.isoformat() if payment.reversedAt else None,
        "snapshot": {
            "pendingBalance": money(payment.pendingBalanceAtPayment),
            "totalPaid": money(payment.totalPaidAtPayment),
            "advancePaid": money(payment.advancePaidAtPayment),
            "paymentsHistory": [
                {
                    **entry,
                    "amount": f"{Decimal(str(entry['amount'])):.2f}",
                }
                for entry in payment.paymentsHistoryAtPayment
            ],
        },
    }
