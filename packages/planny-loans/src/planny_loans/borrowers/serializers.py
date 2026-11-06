from __future__ import annotations

import unicodedata
from decimal import Decimal

from planny_core.models import Borrower, Loan, Payment

# Deterministic mock address pool (Córdoba, Argentina).
_MOCK_ADDRESSES: list[str] = [
    "B° Nueva Córdoba, Córdoba Capital",
    "Cerro de las Rosas, Córdoba",
    "General Paz, Córdoba Capital",
    "Barrio Alberdi, Córdoba",
    "Villa Belgrano, Córdoba",
    "Centro, Córdoba Capital",
]

_MOCK_NEIGHBORHOODS: list[str] = [
    "Córdoba Capital, Córdoba",
    "Nueva Córdoba, Córdoba",
    "Cerro de las Rosas, Córdoba",
    "Barrio Alberdi, Córdoba",
    "Villa Belgrano, Córdoba",
    "Centro, Córdoba Capital",
    "General Paz, Córdoba",
    "Barrio Güemes, Córdoba",
]

_MOCK_OCCUPATIONS: list[str] = [
    "Empleado/a en relación de dependencia",
    "Comerciante independiente",
    "Profesional independiente (monotributo)",
    "Jubilado/a",
    "Bancaria - Banco de Córdoba (BANCOR)",
]

_MOCK_FISCAL_STATUSES: list[str] = [
    "Monotributista Cat. D",
    "Relación de dependencia (Exclusivo)",
    "Responsable Inscripto",
    "Monotributista Cat. E o Superior",
]

_MOCK_POSTAL_CODES: list[str] = [
    "5000", "5000", "5000",
    "5001", "5002", "X5000",
]

_ZERO = Decimal("0.00")


def _strip_accents(text: str) -> str:
    """Remove diacritics from *text* (e.g. ``"Verónica" → "Veronica"``)."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def mock_national_id(borrower_id: int) -> str:
    """Deterministic CUIT-like identifier derived from the borrower id.

    Prefix alternates between 20 and 27 (both valid CUIT person prefixes) based
    on id parity; the middle 8 digits are derived from the id mixed with a
    prime multiplier to produce varied numbers across small ids; the check
    digit is the last digit of the sum of the middle digits modulo 10.
    """
    prefix = "20" if borrower_id % 2 == 0 else "27"
    middle = str((borrower_id * 7919) % 100_000_000).zfill(8)
    check = sum(int(d) for d in middle) % 10
    return f"{prefix}-{middle}-{check}"


def _mock_email(borrower: Borrower) -> str:
    """Deterministic email derived from the borrower's name."""
    first = _strip_accents(borrower.firstName).lower()
    last = _strip_accents(borrower.lastName).lower().replace(" ", "")
    return f"{first}.{last}@example.com"


def _mock_phone(borrower_id: int) -> str:
    """Deterministic Córdoba-style phone derived from the borrower id.

    Uses area code 351, then a 3-digit block and a 4-digit block derived from
    the id. The 4-digit block ranges 0000-9999; the 3-digit block wraps at 999.
    """
    ddd = f"{borrower_id % 1000:03d}"
    dddd = f"{(borrower_id * 7) % 10000:04d}"
    return f"+54 9 351 {ddd}-{dddd}"


def _mock_alt_phone(borrower_id: int) -> str:
    """Deterministic alt phone that never collides with the main phone mock.

    Uses a different multiplier so the suffix digits differ from _mock_phone
    for any borrower id.
    """
    ddd = f"{(borrower_id * 17) % 1000:03d}"
    dddd = f"{(borrower_id * 11) % 10000:04d}"
    return f"+54 9 351 {ddd}-{dddd}"


def _mock_address(borrower_id: int) -> str:
    """Deterministic Córdoba address from a fixed pool."""
    return _MOCK_ADDRESSES[borrower_id % len(_MOCK_ADDRESSES)]


def _mock_contact(borrower: Borrower) -> tuple[str, str, str, str]:
    """Return deterministic mock contact fields for a borrower.

    Each field is derived solely from the borrower's id and name, making the
    result stable across requests.  The tuple order is
    ``(national_id, email, phone, address)`` — exactly the keys in the dict
    below, so the caller can unpack them together.
    """
    borrower_id = borrower.id
    return (
        mock_national_id(borrower_id),
        _mock_email(borrower),
        _mock_phone(borrower_id),
        _mock_address(borrower_id),
    )


def _value_or_mock(value: str | None, mock: str) -> str | None:
    """Return *mock* when *value* is ``None`` or empty, otherwise *value*."""
    return mock if value is None or value == "" else value


# ── Detail-only mocked fields ─────────────────────────────────────────────


def mock_dni(borrower: Borrower) -> str:
    """Deterministic DNI from the borrower's ``nationalId`` or id.

    If ``nationalId`` matches ``NN-NNNNNNNN-M``, extract the middle 8 digits
    and format as ``XX.XXX.XXX``. Otherwise derive from the id.
    """
    nid = borrower.nationalId
    if nid and len(nid) > 4 and nid[2] == "-" and nid[-2] == "-":
        middle = nid[3:-2]
        if len(middle) == 8 and middle.isdigit():
            return f"{middle[:2]}.{middle[2:5]}.{middle[5:]}"
    # Fallback: mock from id
    raw = f"{(borrower.id or 0) * 7919 % 100_000_000:08d}"
    return f"{raw[:2]}.{raw[2:5]}.{raw[5:]}"


def mock_city(borrower_id: int) -> str:
    """Deterministic city/neighbourhood, pure function of id."""
    return _MOCK_NEIGHBORHOODS[borrower_id % len(_MOCK_NEIGHBORHOODS)]


def mock_occupation(borrower_id: int) -> str:
    """Deterministic occupation, pure function of id."""
    return _MOCK_OCCUPATIONS[borrower_id % len(_MOCK_OCCUPATIONS)]


def mock_fiscal_status(borrower_id: int) -> str:
    """Deterministic fiscal status, pure function of id."""
    return _MOCK_FISCAL_STATUSES[borrower_id % len(_MOCK_FISCAL_STATUSES)]


def mock_postal_code(borrower_id: int) -> str:
    """Deterministic postal code, pure function of id."""
    return _MOCK_POSTAL_CODES[borrower_id % len(_MOCK_POSTAL_CODES)]


def mock_monthly_income(borrower_id: int) -> str:
    """Deterministic monthly income as a two-decimal string."""
    base = Decimal("450000")
    variation = Decimal(str((borrower_id * 7919) % 900_000))
    return f"{base + variation:.2f}"


def mock_income_certification(borrower_id: int) -> dict[str, str]:
    """Deterministic income certification info."""
    return {
        "updatedAt": "2026-10-15",
        "detail": "Recibo de sueldo cargado el 15 Octubre 2026.",
        "nextUpdate": "2027-05-15",
    }


def borrower_detail_fields(borrower: Borrower) -> dict[str, object]:
    """Deterministic mocked profile fields for the borrower detail view.

    Every value is a pure function of the borrower's id / existing data, so the
    same request always returns the same mock.  Real contact data is never
    overridden.
    """
    borrower_id = borrower.id or 0
    return {
        "dni": mock_dni(borrower),
        "fiscalStatus": mock_fiscal_status(borrower_id),
        "altPhone": _mock_alt_phone(borrower_id),
        "city": mock_city(borrower_id),
        "postalCode": mock_postal_code(borrower_id),
        "occupation": mock_occupation(borrower_id),
        "monthlyIncome": mock_monthly_income(borrower_id),
        "enabledForLoans": True,
        "notifyWhatsApp": True,
        "incomeCertification": mock_income_certification(borrower_id),
    }


# ── Activity timeline ────────────────────────────────────────────────────


def _activity_from_loan_creation(loan: Loan) -> dict[str, object]:
    """One ``modificacion`` event for the creation of a loan."""
    from planny_loans.loans.serializers import money, padded_number

    installments = 6  # mock — not stored in the DB yet
    return {
        "id": f"loan-{loan.id}",
        "category": "modificacion",
        "title": f"Préstamo #{padded_number(loan.number)} formalizado",
        "detail": (
            f"Otorgado por $ {money(loan.amount)} en {installments} "
            f"cuotas mensuales."
        ),
        "date": loan.date.isoformat(),
        "tags": [],
        "amount": str(loan.amount) if loan.amount else None,
        "installments": installments,
    }


def _activity_from_payment(
    payment: Payment, loan: Loan, *, cuota: int | None = None, cuota_total: int | None = None
) -> dict[str, object]:
    """One ``cobro`` event from a real payment.

    *cuota* is the 1-based index of this payment among the loan's payments sorted
    by date (then id).  When unknown, it is omitted from the title.
    """
    from planny_loans.loans.serializers import money

    detail = f"Recibo #{payment.id} · Confirmado en caja."
    tags: list[str] = []
    if payment.reversedAt is not None:
        tags.append("Reversado")

    return {
        "id": f"payment-{payment.id}",
        "category": "cobro",
        "title": f"Pago registrado Cuota — $ {money(payment.amount)} {loan.currency}",
        "detail": detail,
        "date": payment.date.isoformat(),
        "tags": tags,
        "amount": str(payment.amount),
        "currency": loan.currency,
        "cuota": cuota,
        "cuotaTotal": cuota_total,
    }


def build_activity(
    loans: list[Loan],
    payments: list[Payment],
    *,
    max_events: int = 25,
) -> list[dict[str, object]]:
    """Build the activity timeline, newest first, capped at *max_events*.

    One ``modificacion`` event per loan (from loan creation) and one ``cobro``
    event per payment.  Reversed payments are kept but tagged.  Tiebreak by id
    descending when dates are equal.
    """
    loan_map = {loan.id: loan for loan in loans}
    # Build a lookup of payment position per loan (1-based index ordered by date, then id)
    payments_by_loan: dict[int, list[Payment]] = {}
    for payment in payments:
        payments_by_loan.setdefault(payment.loan_id, []).append(payment)
    for pid in payments_by_loan:
        payments_by_loan[pid].sort(key=lambda p: (p.date, p.id))

    events: list[dict[str, object]] = []

    for loan in loans:
        events.append(_activity_from_loan_creation(loan))

    for payment in payments:
        loan = loan_map.get(payment.loan_id)
        if loan is None:
            continue
        pidx = payments_by_loan.get(payment.loan_id, [])
        try:
            cuota = pidx.index(payment) + 1
        except ValueError:
            cuota = None
        from planny_loans.loans.serializers import _mock_installments_count
        cuota_total = _mock_installments_count(loan)
        events.append(
            _activity_from_payment(payment, loan, cuota=cuota, cuota_total=cuota_total)
        )

    events.sort(key=lambda e: (e["date"], e["id"]), reverse=True)
    return events[:max_events]


# ── List / detail serializer ──────────────────────────────────────────────


def borrower_to_dict(
    borrower: Borrower,
    loan_count: int = 0,
    active_loan_count: int = 0,
    total_historical_amount: Decimal | None = None,
    remaining_balance: Decimal | None = None,
    recovery_percent: float = 0.0,
) -> dict[str, object]:
    mock_nid, mock_email, mock_phone, mock_addr = _mock_contact(borrower)
    return {
        "id": borrower.id,
        "firstName": borrower.firstName,
        "lastName": borrower.lastName,
        "email": _value_or_mock(borrower.email, mock_email),
        "phone": _value_or_mock(borrower.phone, mock_phone),
        "address": _value_or_mock(borrower.address, mock_addr),
        "nationalId": _value_or_mock(borrower.nationalId, mock_nid),
        "notes": borrower.notes,
        "loanCount": loan_count,
        "activeLoanCount": active_loan_count,
        "totalHistoricalAmount": str(total_historical_amount) if total_historical_amount is not None else None,  # noqa: E501
        "remainingBalance": str(remaining_balance) if remaining_balance is not None else None,  # noqa: E501
        "recoveryPercent": recovery_percent,
    }
