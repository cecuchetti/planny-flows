"""Extract -> transform: legacy documents become a typed migration plan.

The transform is pure (no Mongo, no host database) so it can be unit-tested with
hand-built legacy documents and so a dry-run is exactly a real run minus the load.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from planny_loans.loans.service import ACTIVE, CLOSED
from planny_loans.migration import names
from planny_loans.migration.money import ZERO, money

__all__ = [
    "MigrationPlan",
    "PlannedLoan",
    "PlannedPayment",
    "SkippedLoan",
    "build_plan",
    "parse_datetime",
]

CURRENCIES = ("USD", "ARS")
DEFAULT_CITY = "Córdoba"
DEFAULT_CURRENCY = "USD"


@dataclass(frozen=True, slots=True)
class PlannedPayment:
    """One payment, with its source date preserved (AR4)."""

    amount: Decimal
    date: datetime


@dataclass
class PlannedLoan:
    """One loan and its payments, ready to load."""

    number: int
    source_name: str
    borrower_key: str
    amount: Decimal
    advance: Decimal
    currency: str
    date: date
    concept: str
    lender: str
    city: str
    payments: list[PlannedPayment] = field(default_factory=list)
    status: str = ACTIVE
    closed_at: datetime | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class SkippedLoan:
    """A legacy loan the migration refused, with the reason why."""

    source_number: str
    reason: str


@dataclass
class MigrationPlan:
    """Everything the load stage needs, plus the raw source counts."""

    borrowers: names.BorrowerPlan
    loans: list[PlannedLoan] = field(default_factory=list)
    skipped: list[SkippedLoan] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    source_loan_count: int = 0
    source_payment_count: int = 0


def _to_naive_utc(value: datetime) -> datetime:
    """Drop any timezone, normalising to the repo's naive-UTC convention."""
    if value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


def parse_datetime(value: Any) -> datetime | None:
    """Parse a legacy date, which the source stores as a ``"YYYY-MM-DD HH:MM:SS"`` string."""
    if isinstance(value, datetime):
        return _to_naive_utc(value)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    if isinstance(value, (int, float, bool)):
        return None
    if isinstance(value, str):
        text = value.strip()
        for fmt in (
            "%Y-%m-%d %H:%M:%S.%f",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
        ):
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            return None
    return None


def _parse_date(value: Any) -> date | None:
    parsed = parse_datetime(value)
    return parsed.date() if parsed is not None else None


def _decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return money(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _parse_loan(
    raw: dict[str, Any], borrower_plan: names.BorrowerPlan
) -> tuple[PlannedLoan | None, str | None]:
    """Parse one legacy document into a planned loan, or a skip reason."""
    warnings: list[str] = []

    try:
        number = int(str(raw.get("number") or "").strip())
    except (TypeError, ValueError):
        return None, f"número inválido: {raw.get('number')!r}"

    amount = _decimal(raw.get("amount"))
    if amount is None or amount <= ZERO:
        return None, f"monto inválido o ausente: {raw.get('amount')!r}"

    raw_currency = raw.get("currency")
    currency = (
        str(raw_currency).strip().upper()
        if raw_currency not in (None, "")
        else DEFAULT_CURRENCY
    )
    if currency not in CURRENCIES:
        return None, f"moneda no soportada: {raw_currency!r}"

    loan_date = _parse_date(raw.get("date")) or _parse_date(raw.get("createdAt")) or date.today()
    concept = str(raw.get("concept") or "").strip()
    lender = str(raw.get("lender") or "").strip()
    city = str(raw.get("city") or "").strip() or DEFAULT_CITY
    advance = _decimal(raw.get("manualPendingBalance")) or ZERO

    payments: list[PlannedPayment] = []
    for item in raw.get("payments") or []:
        if not isinstance(item, dict):
            warnings.append(f"pago inválido en el préstamo {number}: {item!r}")
            continue
        payment_amount = _decimal(item.get("amount"))
        if payment_amount is None or payment_amount <= ZERO:
            warnings.append(f"pago con monto inválido en el préstamo {number}; se omite.")
            continue
        payment_date = parse_datetime(item.get("date"))
        if payment_date is None:
            payment_date = datetime.combine(loan_date, datetime.min.time())
            warnings.append(
                f"pago sin fecha en el préstamo {number}; se usa la fecha del préstamo."
            )
        payments.append(PlannedPayment(payment_amount, payment_date))
    payments.sort(key=lambda item: item.date)

    source_name = names.normalize(raw.get("borrower"))
    mapping = borrower_plan.by_source_name.get(source_name)
    if mapping is None or mapping.ambiguous:
        return None, f"prestatario sin resolver: {source_name!r}"

    total_paid = sum((item.amount for item in payments), ZERO)
    balance = money(amount - advance - total_paid)
    if balance <= ZERO:
        status = CLOSED
        closed_at = max((item.date for item in payments), default=None)
    else:
        status = ACTIVE
        closed_at = None

    return (
        PlannedLoan(
            number=number,
            source_name=source_name,
            borrower_key=mapping.key,
            amount=amount,
            advance=advance,
            currency=currency,
            date=loan_date,
            concept=concept,
            lender=lender,
            city=city,
            payments=payments,
            status=status,
            closed_at=closed_at,
            warnings=warnings,
        ),
        None,
    )


def build_plan(
    raw_loans: list[dict[str, Any]],
    overrides: dict[str, tuple[str, str]] | None = None,
) -> MigrationPlan:
    """Turn raw legacy documents into a loadable plan.

    Loans are sorted by number so the report and the load are deterministic, and a
    duplicate number — impossible in the source by its unique index, but guarded
    anyway — is skipped rather than allowed to collide.
    """
    borrower_names = [str(raw.get("borrower") or "") for raw in raw_loans]
    borrower_plan = names.resolve_borrowers(borrower_names, overrides)

    loans: list[PlannedLoan] = []
    skipped: list[SkippedLoan] = []
    seen_numbers: set[int] = set()
    source_payment_count = 0

    for raw in raw_loans:
        source_payment_count += len(raw.get("payments") or [])
        loan, reason = _parse_loan(raw, borrower_plan)
        if loan is None:
            skipped.append(SkippedLoan(str(raw.get("number")), reason or "inválido"))
            continue
        if loan.number in seen_numbers:
            skipped.append(SkippedLoan(str(raw.get("number")), "número duplicado"))
            continue
        seen_numbers.add(loan.number)
        loans.append(loan)

    loans.sort(key=lambda item: item.number)
    return MigrationPlan(
        borrowers=borrower_plan,
        loans=loans,
        skipped=skipped,
        source_loan_count=len(raw_loans),
        source_payment_count=source_payment_count,
    )
