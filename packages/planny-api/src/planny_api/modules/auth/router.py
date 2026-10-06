"""Authentication router — guest account creation."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends
from planny_core.auth import create_token
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.dependencies import get_db
from planny_api.modules.auth.repository import find_guest_user
from planny_api.modules.auth.seeder import create_guest_account

logger = structlog.get_logger()
router = APIRouter(tags=["auth"])


@router.post("/authentication/guest")
async def create_guest_account_endpoint(
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Find an existing guest user or seed a full guest project.

    Returns a JWT ``authToken``.

    Idempotent: subsequent calls return the same guest user, reusing the
    already-seeded account.
    """
    user = await find_guest_user(db)
    if user is not None:
        logger.info("Reusing existing guest account", user_id=user.id)
    else:
        user = await create_guest_account(db)
        logger.info("Created new guest account", user_id=user.id)

    return {"authToken": create_token(user.id)}
