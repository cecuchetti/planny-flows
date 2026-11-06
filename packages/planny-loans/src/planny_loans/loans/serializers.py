from __future__ import annotations

from decimal import Decimal

from planny_core.models import Loan, Payment

from planny_loans.borrowers.serializers import mock_national_id

_ZERO = Decimal("0.00")
_SIX = Decimal("6")
_CENT = Decimal("0.01")


def _money(value: Decimal) -> Decimal:
    """Round a money value to two decimals."""
    return value.quantize(_CENT)


def padded_number(number: int) -> str:
    """Zero-padded five-digit form of a loan number (``1 -> "00001"``)."""
    return f"{number:05d}"


def money(value: Decimal | None) -> str | None:
    """Serialize a money value with exactly two decimals, as a string."""
    return None if value is None else f"{value:.2f}"


def _full_name(loan: Loan) -> str:
    return f"{loan.borrower.firstName} {loan.borrower.lastName}"


def summary_currency(
    currency: str,
    principal: Decimal,
    collected: Decimal,
    outstanding: Decimal,
    written_off: Decimal,
    active_count: int,
    closed_count: int,
    collected_this_month: Decimal,
) -> dict[str, object]:
    """One currency's portfolio card, every amount as a two-decimal string.

    ``recoveryRate`` is ``collected / principal`` and ``0.00`` when nothing was
    lent; ``averageOutstanding`` is over the active loans and ``0.00`` when there
    are none. Currencies are never combined here — the service calls this once per
    ``GROUP BY`` row.
    """
    recovery_rate = collected / principal if principal > 0 else _ZERO
    average = outstanding / Decimal(active_count) if active_count > 0 else _ZERO
    return {
        "currency": currency,
        "principal": money(principal),
        "collected": money(collected),
        "outstanding": money(outstanding),
        "writtenOff": money(written_off),
        "recoveryRate": money(recovery_rate),
        "activeCount": active_count,
        "closedCount": closed_count,
        "averageOutstanding": money(average),
        "collectedThisMonth": money(collected_this_month),
    }


def near_completion_entry(loan: Loan, remaining_balance: Decimal) -> dict[str, object]:
    """One near-completion row: the borrower, the number and what is left."""
    return {
        "loanId": loan.id,
        "number": padded_number(loan.number),
        "borrower": _full_name(loan),
        "remainingBalance": money(remaining_balance),
        "currency": loan.currency,
    }


def recent_payment_entry(payment: Payment) -> dict[str, object]:
    """One recent-activity row: who paid, against which loan, and how much.

    ``loanId`` rides along so the client can drill through to the loan the payment
    belongs to; ``loanNumber`` is the human-facing reference.
    """
    loan = payment.loan
    return {
        "paymentId": payment.id,
        "loanId": loan.id,
        "date": payment.date.isoformat(),
        "borrower": _full_name(loan),
        "loanNumber": padded_number(loan.number),
        "amount": money(payment.amount),
        "currency": loan.currency,
    }


def _total_collected(loan: Loan, pending_balance: Decimal) -> Decimal:
    """Derive the total collected (advance + payments) from the loan and the pending balance.

    ``pending_balance = amount - advancePaid - payments - writtenOffAmount``,
    so the sum of what was collected (advance + payments) is
    ``amount - pending_balance - writtenOffAmount``.
    """
    return _money((loan.amount or _ZERO) - pending_balance - (loan.writtenOffAmount or _ZERO))


def _mock_installments_count(loan: Loan) -> int:
    """A mock installment count — not stored in the database yet."""
    return 6


def _mock_installment_amount(loan: Loan) -> Decimal:
    """Compute a mock installment amount from amount and default installments count.

    Used when the database value is ``None``.
    """
    return _money((loan.amount or _ZERO) / _SIX)


def loan_to_dict(loan: Loan, pending_balance: Decimal) -> dict[str, object]:
    borrower = loan.borrower
    collected = _total_collected(loan, pending_balance)
    installments_count = _mock_installments_count(loan)
    inst_amount = (  # noqa: E501
        _mock_installment_amount(loan) if loan.installmentAmount is None else loan.installmentAmount
    )
    installments_paid = (
        int(collected / inst_amount)
        if inst_amount > _ZERO
        else 0
    )
    progress_pct = (
        float(collected / (loan.amount or _ZERO) * 100)
        if loan.amount and loan.amount > _ZERO
        else 0.0
    )
    return {
        "id": loan.id,
        "number": padded_number(loan.number),
        "borrowerId": loan.borrower_id,
        "borrower": {
            "id": borrower.id,
            "firstName": borrower.firstName,
            "lastName": borrower.lastName,
            "nationalId": (
                borrower.nationalId
                if borrower.nationalId is not None and borrower.nationalId != ""
                else mock_national_id(borrower.id)
            ),
        },
        "amount": money(loan.amount),
        "advancePaid": money(loan.advancePaid),
        "installmentAmount": money(inst_amount),
        "installmentsCount": installments_count,
        "installmentsPaid": installments_paid,
        "pendingBalance": money(pending_balance),
        "progressPercent": progress_pct,
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
