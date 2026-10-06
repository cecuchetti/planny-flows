"""In-memory rate limiter.

Suitable for a single instance. Rejections raise
:class:`~planny_core.errors.RateLimitExceededError`, an ``AppError``, so a
throttled response uses the same JSON envelope as every other error instead of
FastAPI's ``{"detail": ...}`` wrapper.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Coroutine

from fastapi import Request
from planny_core.errors import RateLimitExceededError

__all__ = ["InMemoryRateLimiter", "create_rate_limiter_dependency"]


class InMemoryRateLimiter:
    """Fixed-window rate limiter keyed by client address.

    State lives in the process, so running several workers multiplies the
    effective limit. Recorded as a known limitation rather than papered over.
    """

    def __init__(self, window_ms: int, max_requests: int) -> None:
        self.window_ms = window_ms
        self.max_requests = max_requests
        # client key -> (count, reset_at_ms)
        self._store: dict[str, tuple[int, float]] = {}

    def is_allowed(self, client_key: str) -> tuple[bool, int, int]:
        """Check whether *client_key* may proceed.

        Returns:
            ``(allowed, remaining, reset_seconds)``.
        """
        now = time.time() * 1000.0
        key = client_key or "unknown"
        window_seconds = self.window_ms // 1000

        entry = self._store.get(key)
        if entry is None or now > entry[1]:
            self._store[key] = (1, now + self.window_ms)
            return True, self.max_requests - 1, window_seconds

        count, reset_at = entry
        count += 1
        self._store[key] = (count, reset_at)
        remaining = max(0, self.max_requests - count)
        reset_seconds = int((reset_at - now) / 1000.0)

        if count > self.max_requests:
            return False, 0, reset_seconds
        return True, remaining, reset_seconds


def create_rate_limiter_dependency(
    window_ms: int = 60_000,
    max_requests: int = 10,
    message: str = "Too many requests, please try again later.",
) -> Callable[[Request], Coroutine[None, None, None]]:
    """Return a FastAPI dependency enforcing a per-client limit.

    Raises:
        RateLimitExceededError: the caller exceeded *max_requests* within the
            window. The response carries the standard rate-limit headers.
    """
    limiter = InMemoryRateLimiter(window_ms=window_ms, max_requests=max_requests)

    async def rate_limit_dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        allowed, remaining, reset_seconds = limiter.is_allowed(client_ip)

        if not allowed:
            raise RateLimitExceededError(
                message,
                limit=max_requests,
                remaining=remaining,
                reset_seconds=reset_seconds,
            )

    return rate_limit_dependency
