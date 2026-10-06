"""Persistence for guest accounts.

Keeps SQL out of the router (blueprint principle P3).
"""

from __future__ import annotations

from planny_core.models import User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.modules.auth.seeder import GUEST_EMAIL_SUFFIX

__all__ = ["find_guest_user"]


async def find_guest_user(db: AsyncSession) -> User | None:
    """Return the oldest existing guest account, if any.

    Ordering by id keeps the result deterministic when several guest accounts
    exist, which is what makes the endpoint idempotent.
    """
    result = await db.execute(
        select(User)
        .where(User.email.like(f"%{GUEST_EMAIL_SUFFIX}"))
        .order_by(User.id)
        .limit(1)
    )
    return result.scalar_one_or_none()
