"""FastAPI dependencies — DB sessions, auth, and shared utilities."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from planny_core.auth import verify_token
from planny_core.database import async_session_factory
from planny_core.errors import InvalidTokenError
from planny_core.models.user import User
from sqlalchemy.ext.asyncio import AsyncSession

security = HTTPBearer()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Provide a database session per request.

    Commits on success, rolls back on exception, always closes.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate the current user from a JWT bearer token.

    Extracts the JWT from the ``Authorization: Bearer`` header, verifies
    the signature and expiration, loads the ``User`` from the database,
    and returns it.

    Raises ``InvalidTokenError`` (→ 401) on failure.
    """
    token = credentials.credentials
    payload = verify_token(token)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise InvalidTokenError()

    user = await db.get(User, int(user_id_str))
    if not user:
        raise InvalidTokenError("User not found")
    return user
