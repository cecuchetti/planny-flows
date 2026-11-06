from __future__ import annotations

import unicodedata
from decimal import Decimal

from planny_core.models import Borrower

# Deterministic mock address pool (Córdoba, Argentina).
_MOCK_ADDRESSES: list[str] = [
    "B° Nueva Córdoba, Córdoba Capital",
    "Cerro de las Rosas, Córdoba",
    "General Paz, Córdoba Capital",
    "Barrio Alberdi, Córdoba",
    "Villa Belgrano, Córdoba",
    "Centro, Córdoba Capital",
]


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
