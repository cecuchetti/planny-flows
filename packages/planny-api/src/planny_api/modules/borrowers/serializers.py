from __future__ import annotations

from planny_core.models import Borrower


def borrower_to_dict(borrower: Borrower, loan_count: int = 0) -> dict[str, object]:
    return {
        "id": borrower.id,
        "firstName": borrower.firstName,
        "lastName": borrower.lastName,
        "email": borrower.email,
        "phone": borrower.phone,
        "address": borrower.address,
        "nationalId": borrower.nationalId,
        "notes": borrower.notes,
        "loanCount": loan_count,
    }
