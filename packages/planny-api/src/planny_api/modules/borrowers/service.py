from __future__ import annotations

from planny_core.errors import BadUserInputError, ConflictError, EntityNotFoundError
from planny_core.models import Borrower
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.modules.borrowers import repository


def _clean(value: str | None) -> str:
    return (value or "").strip()


def _string(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _validate(first_name: str | None, last_name: str | None) -> tuple[str, str]:
    first, last = _clean(first_name), _clean(last_name)
    fields: dict[str, str] = {}
    if not first:
        fields["firstName"] = "El nombre es obligatorio."
    if not last:
        fields["lastName"] = "El apellido es obligatorio."
    if fields:
        raise BadUserInputError({"fields": fields}, message="Revisá los datos de la persona.")
    return first, last


async def create(db: AsyncSession, values: dict[str, object]) -> Borrower:
    first, last = _validate(_string(values.get("firstName")), _string(values.get("lastName")))
    if await repository.find_by_name(db, first, last):
        raise ConflictError("Ya existe una persona con ese nombre.")
    optional = {k: v for k, v in values.items() if k not in {"firstName", "lastName"}}
    borrower = Borrower(firstName=first, lastName=last, **optional)
    db.add(borrower)
    await db.flush()
    return borrower


async def update(db: AsyncSession, borrower_id: int, values: dict[str, object]) -> Borrower:
    borrower = await repository.get(db, borrower_id)
    if borrower is None:
        raise EntityNotFoundError("Borrower", message="No encontramos esa persona.")
    first, last = _validate(
        borrower.firstName if values.get("firstName") is None else _string(values.get("firstName")),
        borrower.lastName if values.get("lastName") is None else _string(values.get("lastName")),
    )
    duplicate = await repository.find_by_name(db, first, last)
    if duplicate is not None and duplicate.id != borrower_id:
        raise ConflictError("Ya existe una persona con ese nombre.")
    borrower.firstName, borrower.lastName = first, last
    for key in ("email", "phone", "address", "nationalId", "notes"):
        if key in values:
            setattr(borrower, key, values[key])
    await db.flush()
    return borrower


async def delete(db: AsyncSession, borrower_id: int) -> None:
    borrower = await repository.get(db, borrower_id)
    if borrower is None:
        raise EntityNotFoundError("Borrower", message="No encontramos esa persona.")
    if await repository.linked_loan_count(db, borrower_id):
        raise ConflictError("No se puede eliminar una persona que tiene préstamos vinculados.")
    await db.delete(borrower)
    await db.flush()
