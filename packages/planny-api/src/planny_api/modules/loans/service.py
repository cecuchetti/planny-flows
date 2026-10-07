"""Loan business rules.

Money is normalised through a single :func:`_money` helper so rounding is one
decision, not one per field. ``pendingBalance`` is never stored: it is derived
as ``amount - advancePaid`` here (payments add their sum in a later epic) and
the serializer exposes it.

The API never accepts or edits ``number``; the service assigns it from
``max(number) + 1`` so a backfilled legacy maximum continues the sequence.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from planny_core.errors import BadUserInputError, EntityNotFoundError
from planny_core.models import Loan
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.modules.loans import repository

CURRENCIES = ("USD", "ARS")
DEFAULT_CITY = "Córdoba"
DEFAULT_CURRENCY = "USD"

_CENT = Decimal("0.01")
_MISSING = object()
"""Sentinel distinguishing "field omitted" from "field explicitly cleared"."""


def _money(value: Decimal) -> Decimal:
    """Round a money value to two decimals."""
    return value.quantize(_CENT)


def _string(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _decimal(value: object, field: str, errors: dict[str, str]) -> Decimal | None:
    """Coerce a payload value to a two-decimal ``Decimal``."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        return _money(Decimal(str(value)))
    except (InvalidOperation, ValueError):
        errors[field] = "Ingresá un número válido."
        return None


def _date(value: object, field: str, errors: dict[str, str]) -> date | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip())
    except ValueError:
        errors[field] = "Ingresá una fecha válida."
        return None


def pending_balance(loan: Loan) -> Decimal:
    """The derived balance: amount minus advance-paid."""
    advance = loan.advancePaid or Decimal("0.00")
    return _money((loan.amount or Decimal("0.00")) - advance)


def _required(value: object, field: str, label: str, errors: dict[str, str]) -> str | None:
    text = (_string(value) or "").strip()
    if not text:
        errors[field] = f"{label} es obligatorio."
        return None
    return text


def _common_rules(
    values: dict[str, Any],
    current: Loan | None,
    errors: dict[str, str],
) -> dict[str, Any]:
    """Validate one loan payload and return its resolved field values.

    ``current`` is ``None`` on create and the stored loan on update, so a
    partial update is validated against the values it will actually leave
    behind (an amount lower than an existing advance-paid is refused).
    """

    def _effective(field: str) -> object:
        value = values.get(field, _MISSING)
        if value is _MISSING and current is not None:
            return getattr(current, field)
        return None if value is _MISSING else value

    concept = _required(_effective("concept"), "concept", "El concepto", errors)
    lender = _required(_effective("lender"), "lender", "El prestamista", errors)
    amount = _decimal(_effective("amount"), "amount", errors)
    advance = _decimal(_effective("advancePaid"), "advancePaid", errors)
    installment = _decimal(_effective("installmentAmount"), "installmentAmount", errors)

    raw_date = _effective("date")
    if isinstance(raw_date, str) and not raw_date.strip():
        errors["date"] = "La fecha es obligatoria."
        loan_date = current.date if current is not None else date.today()
    else:
        loan_date = _date(raw_date, "date", errors) or (
            current.date if current is not None else date.today()
        )

    raw_currency = _string(_effective("currency"))
    currency = (raw_currency or DEFAULT_CURRENCY).strip().upper() or DEFAULT_CURRENCY
    if currency not in CURRENCIES:
        errors["currency"] = "Elegí una moneda válida (USD o ARS)."

    supplied = set(values)
    resolved_advance = advance if advance is not None else Decimal("0.00")
    if "advancePaid" not in errors:
        if resolved_advance < 0:
            errors["advancePaid"] = "El pago adelantado no puede ser negativo."
        elif amount is not None and resolved_advance > amount:
            # Blame the field the request actually moved. When it moved both, the
            # advance is the specific culprit; when it left the amount alone,
            # reporting on ``amount`` would blame a value the operator never sent
            # and call it "already registered" on create, where nothing is.
            if "amount" in supplied and "advancePaid" not in supplied:
                errors["amount"] = "El monto no puede ser menor al pago adelantado del préstamo."
            else:
                errors["advancePaid"] = "El pago adelantado no puede superar el monto del préstamo."

    if "installmentAmount" not in errors and installment is not None and installment < 0:
        errors["installmentAmount"] = "La cuota no puede ser negativa."

    if amount is None:
        if "amount" not in errors:
            errors["amount"] = "El monto es obligatorio."
    elif amount <= 0:
        errors["amount"] = "El monto debe ser mayor a cero."

    if current is not None and currency != current.currency and resolved_advance > 0:
        errors["currency"] = (
            "No podés cambiar la moneda de un préstamo con pago adelantado registrado."
        )

    if errors:
        raise BadUserInputError({"fields": errors}, message="Revisá los datos del préstamo.")

    return {
        "amount": amount,
        "advancePaid": resolved_advance,
        "installmentAmount": installment,
        "currency": currency,
        "date": loan_date,
        "concept": concept,
        "lender": lender,
        "city": (_string(_effective("city")) or "").strip() or DEFAULT_CITY,
    }


def _borrower_key(value: object) -> int:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        raise BadUserInputError(
            {"fields": {"borrowerId": "Elegí una persona."}},
            message="Revisá los datos del préstamo.",
        ) from None


def _apply(loan: Loan, resolved: dict[str, Any]) -> None:
    loan.amount = resolved["amount"]
    loan.advancePaid = resolved["advancePaid"]
    loan.installmentAmount = resolved["installmentAmount"]
    loan.currency = resolved["currency"]
    loan.date = resolved["date"]
    loan.concept = resolved["concept"]
    loan.lender = resolved["lender"]
    loan.city = resolved["city"]


async def create(db: AsyncSession, values: dict[str, Any]) -> Loan:
    resolved = _common_rules(values, None, {})

    if values.get("borrowerId") is None:
        raise BadUserInputError(
            {"fields": {"borrowerId": "Elegí una persona."}},
            message="Revisá los datos del préstamo.",
        )
    borrower_key = _borrower_key(values["borrowerId"])
    if not await repository.borrower_exists(db, borrower_key):
        raise EntityNotFoundError("Borrower", message="No encontramos esa persona.")

    loan = Loan(borrower_id=borrower_key, number=await repository.next_number(db), **resolved)
    db.add(loan)
    await db.flush()
    # ``lazy="joined"`` covers a select(), not a newly added instance, and the
    # serializer needs the borrower on the response.
    await db.refresh(loan, ["borrower"])
    return loan


async def update(db: AsyncSession, loan_id: int, values: dict[str, Any]) -> Loan:
    loan = await repository.get(db, loan_id)
    if loan is None:
        raise EntityNotFoundError("Loan", message="No encontramos ese préstamo.")

    resolved = _common_rules(values, loan, {})

    if values.get("borrowerId") is not None:
        borrower_key = _borrower_key(values["borrowerId"])
        if not await repository.borrower_exists(db, borrower_key):
            raise EntityNotFoundError("Borrower", message="No encontramos esa persona.")
        loan.borrower_id = borrower_key

    _apply(loan, resolved)
    await db.flush()
    await db.refresh(loan, ["borrower"])
    return loan


async def delete(db: AsyncSession, loan_id: int) -> None:
    loan = await repository.get(db, loan_id)
    if loan is None:
        raise EntityNotFoundError("Loan", message="No encontramos ese préstamo.")
    await db.delete(loan)
    await db.flush()
