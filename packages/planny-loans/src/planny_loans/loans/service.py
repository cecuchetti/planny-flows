"""Loan and payment business rules.

Money is normalised through a single :func:`_money` helper so rounding is one
decision, not one per field. ``pendingBalance`` is never stored: it is derived
as ``amount - advancePaid - Σ active payments`` by :func:`pending_balance`, which
is the one place every balance-affecting path goes through.

The API never accepts or edits ``number``; the service assigns it from
``max(number) + 1`` so a backfilled legacy maximum continues the sequence.

Each payment stores its own immutable snapshot rather than recomputing it from
sibling rows: reversing a later payment must not rewrite a receipt that was
already handed over. A payment is never deleted either — reversing it stamps
``reversedAt``, and the same stamp is annotated onto the frozen snapshots that
name that row, so a receipt issued afterwards can say the collection was
reversed without any amount being rewritten. Undoing a reversal clears the stamp
and removes the annotation, which is what makes the operation safe to misclick.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from planny_core.errors import BadUserInputError, EntityNotFoundError
from planny_core.models import Loan, Payment
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from planny_loans.loans import repository

CURRENCIES = ("USD", "ARS")
DEFAULT_CITY = "Córdoba"
DEFAULT_CURRENCY = "USD"

_CENT = Decimal("0.01")
_ZERO = Decimal("0.00")
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


def history_entry(
    amount: Decimal, payment_id: int | None = None, reversed_at: datetime | None = None
) -> dict[str, object]:
    """The canonical payment-history entry.

    One builder, used for the entry a payment freezes into its own
    ``paymentsHistoryAtPayment`` and for the entries the API returns, so the
    stored snapshot and the response shape cannot drift apart. The amount is a
    two-decimal string: it is what the API returns and what the JSON column
    stores, so the frozen snapshot round-trips without a precision question.

    ``reversedAt`` is present only on an entry that was reversed. An entry that
    never carried the key is not an entry without a reversal — it is the exact
    shape the snapshot was frozen with, and undoing a reversal has to restore it,
    so the key is added and removed rather than set to ``None``.
    """
    entry: dict[str, object] = {"id": payment_id, "amount": f"{_money(amount):.2f}"}
    if reversed_at is not None:
        entry["reversedAt"] = reversed_at.isoformat()
    return entry


def payments_history(payments: list[Payment]) -> list[dict[str, object]]:
    """The canonical history of a list of active payments, oldest first."""
    return [
        history_entry(payment.amount, payment.id, payment.reversedAt)
        for payment in payments
        if payment.reversedAt is None
    ]


def _annotate_history(
    payments: list[Payment], payment_id: int, reversed_at: datetime | None
) -> None:
    """Mark (or unmark) ``payment_id`` in every snapshot that names it.

    Only the one entry for that payment is touched, and only its reversal mark:
    the frozen amounts are left exactly as they were. Removing the mark rather
    than setting it to ``None`` is what makes an undone reversal return the
    snapshot to the bytes it was frozen with.
    """
    for payment in payments:
        for entry in payment.paymentsHistoryAtPayment or []:
            if entry.get("id") != payment_id:
                continue
            if reversed_at is None:
                if "reversedAt" not in entry:
                    continue
                entry.pop("reversedAt")
            else:
                entry["reversedAt"] = reversed_at.isoformat()
            # SQLAlchemy cannot see a mutation made *inside* a ``JSON`` column, so
            # the attribute has to be flagged or the annotation is never written.
            flag_modified(payment, "paymentsHistoryAtPayment")


def _balance_of(loan: Loan, collected: Decimal) -> Decimal:
    advance = loan.advancePaid or _ZERO
    return _money((loan.amount or _ZERO) - advance - collected)


async def pending_balance(db: AsyncSession, loan: Loan) -> Decimal:
    """The derived balance: ``amount - advancePaid - Σ payments``.

    **This is the single recalculation point.** Every path that can move a
    balance — loan create, loan update, payment create, payment delete — ends
    here, and no path stores the result. Epic 3's status evaluation (``closed``
    with ``closedAt`` when the balance reaches zero, auto-reopen when it rises
    again) attaches here, so it sees each of those events exactly once.
    """
    # A loan being created has no id yet, and therefore no payments.
    collected = await repository.sum_payments(db, loan.id) if loan.id is not None else _ZERO
    return _balance_of(loan, collected)


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
    collected: Decimal,
) -> dict[str, Any]:
    """Validate one loan payload and return its resolved field values.

    ``current`` is ``None`` on create and the stored loan on update, so a
    partial update is validated against the values it will actually leave
    behind (an amount lower than an existing advance-paid is refused).
    ``collected`` is everything already paid against the loan, which the derived
    balance subtracts too.
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
    resolved_advance = advance if advance is not None else _ZERO
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

    # The guard against what was ever collected, reversed payments included.
    # It is deliberately not the balance's active-only term: a reversal lowers
    # the balance, so if the amount could be cut below money that was handed
    # over and then reversed, undoing that reversal would drive the derived
    # balance below zero and leave it stuck there — the next payment is then
    # larger than the outstanding balance and is refused, so nothing can ever
    # pay it down.
    if collected > 0 and "amount" not in errors and amount is not None:
        if amount < collected and not (resolved_advance > amount):
            # ``advancePaid <= amount`` already holds on this branch, so the
            # shortfall can only come from the amount — including when the
            # payload carried both fields and only the amount moved.
            errors["amount"] = "El monto no puede ser menor a lo ya cobrado del préstamo."

    if "installmentAmount" not in errors and installment is not None and installment < 0:
        errors["installmentAmount"] = "La cuota no puede ser negativa."

    if amount is None:
        if "amount" not in errors:
            errors["amount"] = "El monto es obligatorio."
    elif amount <= 0:
        errors["amount"] = "El monto debe ser mayor a cero."

    # FR4: currency is editable only while there is no advance-paid and no
    # payment. Either one would leave money of one currency inside a loan of
    # another.
    if (
        current is not None
        and currency != current.currency
        and (resolved_advance > 0 or collected > 0)
    ):
        errors["currency"] = (
            "No podés cambiar la moneda de un préstamo con pago adelantado "
            "o pagos registrados."
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


async def _require_loan(db: AsyncSession, loan_id: int) -> Loan:
    loan = await repository.get(db, loan_id)
    if loan is None:
        raise EntityNotFoundError("Loan", message="No encontramos ese préstamo.")
    return loan


async def create(db: AsyncSession, values: dict[str, Any]) -> Loan:
    resolved = _common_rules(values, None, {}, _ZERO)

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
    loan = await _require_loan(db, loan_id)

    resolved = _common_rules(values, loan, {}, await repository.sum_all_payments(db, loan_id))

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
    """Delete the loan and every payment collected against it (FR5)."""
    loan = await _require_loan(db, loan_id)
    # Explicit rather than left to the ORM cascade, so a backend that does not
    # enforce the foreign key cannot leave orphan rows behind.
    for payment in await repository.list_payments(db, loan_id):
        await db.delete(payment)
    await db.delete(loan)
    await db.flush()


async def list_payments(db: AsyncSession, loan_id: int) -> list[Payment]:
    """The loan's payments, oldest first, or a 404 if the loan is unknown."""
    await _require_loan(db, loan_id)
    return await repository.list_payments(db, loan_id)


async def create_payment(db: AsyncSession, loan_id: int, values: dict[str, Any]) -> Payment:
    """Register a payment and freeze the snapshot it will be read back from.

    The amount must be positive and no larger than the true outstanding balance
    (``amount - advancePaid - Σ payments``). The date is always the server's
    insert time, never a client-supplied one (FR10).
    """
    loan = await _require_loan(db, loan_id)

    # Only what is still in force counts: a reversed payment is not money the
    # loan holds any more, and it must not cap what can be collected now.
    payments = await repository.list_payments(db, loan_id, active_only=True)
    collected = _money(sum((item.amount for item in payments), _ZERO))
    outstanding = _balance_of(loan, collected)

    errors: dict[str, str] = {}
    amount = _decimal(values.get("amount"), "amount", errors)
    if errors:
        raise BadUserInputError({"fields": errors}, message="Revisá los datos del pago.")
    if amount is None:
        errors["amount"] = "Ingresá el monto del pago."
    elif amount <= 0:
        errors["amount"] = "El monto del pago debe ser mayor a cero."
    elif amount > outstanding:
        errors["amount"] = "El pago no puede superar el saldo pendiente."

    if errors or amount is None:
        raise BadUserInputError({"fields": errors}, message="Revisá los datos del pago.")

    history = payments_history(payments)
    entry = history_entry(amount)
    history.append(entry)

    payment = Payment(
        loan_id=loan_id,
        amount=amount,
        date=datetime.utcnow(),
        pendingBalanceAtPayment=_money(outstanding - amount),
        totalPaidAtPayment=_money(collected + amount),
        advancePaidAtPayment=loan.advancePaid if loan.advancePaid is not None else _ZERO,
        paymentsHistoryAtPayment=history,
    )
    db.add(payment)
    await db.flush()
    # The snapshot is part of the frozen record, so the row's own id belongs in
    # it — and only the row knows that id, which is why this happens after the
    # flush. SQLAlchemy cannot see a change made *inside* a ``JSON`` column and
    # leaves the instance clean, so the attribute has to be flagged explicitly;
    # otherwise the mutation is never written and every later read of this row
    # returns the ``None`` id it was inserted with.
    if entry["id"] is None:
        entry["id"] = payment.id
        flag_modified(payment, "paymentsHistoryAtPayment")
        await db.flush()
    return payment


async def _require_payment(db: AsyncSession, loan_id: int, payment_id: int) -> Payment:
    payment = await repository.get_payment(db, loan_id, payment_id)
    if payment is None:
        raise EntityNotFoundError("Payment", message="No encontramos ese pago.")
    return payment


async def reverse_payment(db: AsyncSession, loan_id: int, payment_id: int) -> None:
    """Reverse one payment: the row survives, marked and dated.

    Nothing is deleted. The row is stamped with the server's ``reversedAt``, which
    takes it out of the sum the balance is derived from through the single
    recalculation point, and the reversal is annotated onto every frozen snapshot
    that names it so an already-issued receipt can show that collection was
    reversed. No frozen amount is rewritten.

    Reversing an already-reversed payment is refused rather than treated as
    idempotent: a second reversal is an operator error, and silently accepting it
    would move a date the receipt may already be quoting.
    """
    payment = await _require_payment(db, loan_id, payment_id)
    if payment.reversedAt is not None:
        raise BadUserInputError(
            {"fields": {"paymentId": "Este pago ya está revertido."}},
            message="Este pago ya está revertido.",
        )

    reversed_at = datetime.utcnow()
    payment.reversedAt = reversed_at
    # The row's own snapshot is the receipt for this very collection, so it is
    # annotated along with the later ones — without it the receipt a payee holds
    # still claims the collection is in force while every later one says it was
    # reversed. ``list_payments`` returns the row already stamped above.
    _annotate_history(await repository.list_payments(db, loan_id), payment_id, reversed_at)
    await db.flush()


async def unreverse_payment(db: AsyncSession, loan_id: int, payment_id: int) -> None:
    """Undo a reversal: the payment counts again, exactly as it did before.

    The stamp is cleared and the annotation removed from the snapshots that
    carried it, so a mistaken reversal costs nothing. A payment that is not
    reversed has no reversal to undo, and that is refused like any other edit
    that does not apply.
    """
    payment = await _require_payment(db, loan_id, payment_id)
    if payment.reversedAt is None:
        raise BadUserInputError(
            {"fields": {"paymentId": "Este pago no está revertido."}},
            message="Este pago no está revertido.",
        )

    payment.reversedAt = None
    _annotate_history(await repository.list_payments(db, loan_id), payment_id, None)
    await db.flush()

