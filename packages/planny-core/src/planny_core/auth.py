"""JWT authentication utilities.

Provides ``create_token()`` and ``verify_token()`` matching the
TypeScript ``api/src/utils/authToken.ts`` behaviour.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt

from planny_core.config import settings
from planny_core.errors import InvalidTokenError


def _parse_expires_in(value: str) -> timedelta:
    """Parse ``"180 days"`` style strings into a ``timedelta``."""
    parts = value.strip().split()
    if len(parts) != 2:
        return timedelta(days=180)

    try:
        number = int(parts[0])
        unit = parts[1].lower()
    except (ValueError, IndexError):
        return timedelta(days=180)

    unit_map: dict[str, str] = {
        "day": "days",
        "days": "days",
        "hour": "hours",
        "hours": "hours",
        "minute": "minutes",
        "minutes": "minutes",
        "second": "seconds",
        "seconds": "seconds",
    }
    unit_key = unit_map.get(unit)
    if unit_key is None:
        return timedelta(days=180)

    return timedelta(**{unit_key: number})


def create_token(user_id: int) -> str:
    """Create a signed JWT for the given user.

    The ``sub`` claim is stored as a *string* to match the behaviour of
    Node's ``jsonwebtoken`` library (which serialises numbers as strings
    in the JWT ``sub`` claim).

    Returns the encoded JWT string.
    """
    now = datetime.now(UTC)
    expires_in = _parse_expires_in(settings.jwt_expires_in)

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + expires_in).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")  # type: ignore[no-any-return]


def verify_token(token: str) -> dict[str, Any]:
    """Verify a JWT and return its payload.

    Raises ``InvalidTokenError`` if the token is malformed, expired,
    or has an invalid signature.
    """
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return dict(payload)
    except JWTError:
        raise InvalidTokenError()
