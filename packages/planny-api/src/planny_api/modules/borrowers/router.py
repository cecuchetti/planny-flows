from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.dependencies import get_db
from planny_api.modules.borrowers import repository, service
from planny_api.modules.borrowers.schemas import BorrowerRequest
from planny_api.modules.borrowers.serializers import borrower_to_dict

router = APIRouter(prefix="/borrowers", tags=["borrowers"])


def _values(body: BorrowerRequest) -> dict[str, object]:
    return {
        "firstName": body.first_name,
        "lastName": body.last_name,
        "email": body.email,
        "phone": body.phone,
        "address": body.address,
        "nationalId": body.national_id,
        "notes": body.notes,
    }


@router.get("")
async def list_borrowers(
    search: str | None = Query(default=None), db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    borrowers = await repository.list_borrowers(db, search)
    return {"borrowers": [borrower_to_dict(item) for item in borrowers]}


@router.post("", status_code=201)
async def create_borrower(
    body: BorrowerRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    borrower = await service.create(db, _values(body))
    return {"borrower": borrower_to_dict(borrower)}


@router.get("/{borrower_id}")
async def get_borrower(borrower_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    borrower = await repository.get(db, borrower_id)
    if borrower is None:
        from planny_core.errors import EntityNotFoundError
        raise EntityNotFoundError("Borrower", message="No encontramos esa persona.")
    return {"borrower": borrower_to_dict(borrower)}


@router.put("/{borrower_id}")
async def update_borrower(
    borrower_id: int, body: BorrowerRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    borrower = await service.update(db, borrower_id, _values(body))
    return {"borrower": borrower_to_dict(borrower)}


@router.delete("/{borrower_id}", status_code=204)
async def delete_borrower(borrower_id: int, db: AsyncSession = Depends(get_db)) -> None:
    await service.delete(db, borrower_id)
