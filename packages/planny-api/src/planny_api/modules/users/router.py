"""User router — ``GET /currentUser``.

Returns the authenticated user's profile matching the
Node ``GET /currentUser`` response format exactly.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from planny_core.models.user import User

from planny_api.dependencies import get_current_user as auth_user
from planny_api.serializers import user_to_dict

router = APIRouter(prefix="/currentUser", tags=["users"])


@router.get("")
async def handle_get_current_user(
    current_user: User = Depends(auth_user),
) -> dict[str, object]:
    """Return the authenticated user's profile.

    Requires a valid JWT bearer token. Returns 401 for invalid or
    expired tokens, 401 (FastAPI default) when no token is provided.
    """
    return {"currentUser": user_to_dict(current_user)}
