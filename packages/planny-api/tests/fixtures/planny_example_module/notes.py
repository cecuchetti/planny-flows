"""A minimal domain inside the example external module.

Deliberately small: the point is the shape, not the feature. A real merged
project would follow the same layout as the built-in domains — ``router.py``,
``schemas.py``, ``service.py``, ``repository.py`` inside its own package.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from planny_core.models import User
from pydantic import BaseModel

from planny_api.dependencies import get_current_user

router = APIRouter(prefix="/example-notes", tags=["notes"])

#: In-memory stand-in for a repository.
_NOTES: dict[int, str] = {}
_NEXT_ID = 1


class NoteRequest(BaseModel):
    """Request body for creating a note."""

    body: str


@router.get("")
async def list_notes(current_user: User = Depends(get_current_user)) -> dict[str, object]:
    """Return the caller's notes."""
    return {"notes": [{"id": key, "body": value} for key, value in _NOTES.items()]}


@router.post("", status_code=201)
async def create_note(
    payload: NoteRequest,
    current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    """Create a note for the caller."""
    global _NEXT_ID
    note_id = _NEXT_ID
    _NEXT_ID += 1
    _NOTES[note_id] = payload.body
    return {"note": {"id": note_id, "body": payload.body}}
