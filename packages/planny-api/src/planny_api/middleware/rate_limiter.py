"""In-memory rate limiter — direct port of the TypeScript implementation.

Provides ``InMemoryRateLimiter`` and a factory function
``create_rate_limiter_dependency`` suitable for FastAPI dependencies.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Coroutine

from fastapi import HTTPException, Request
from starlette.status import HTTP_429_TOO_MANY_REQUESTS


class InMemoryRateLimiter:
    """Simple in-memory rate limiter.

    Tracks request counts per IP within sliding windows.
    Suitable for single-instance deployments.
    """

    def __init__(self, window_ms: int, max_requests: int) -> None:
        self.window_ms = window_ms
        self.max_requests = max_requests
        # IP -> (count, reset_at_ms)
        self._store: dict[str, tuple[int, float]] = {}

    def is_allowed(self, client_ip: str) -> tuple[bool, int, int]:
        """Check if *client_ip* may proceed.

        Returns ``(allowed, remaining, reset_seconds)``.
        """
        now = time.time() * 1000.0
        key = client_ip or "unknown"

        if key not in self._store:
            self._store[key] = (1, now + self.window_ms)
            return True, self.max_requests - 1, self.window_ms // 1000

        count, reset_at = self._store[key]
        if now > reset_at:
            self._store[key] = (1, now + self.window_ms)
            return True, self.max_requests - 1, self.window_ms // 1000

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
    """Return a FastAPI dependency that enforces rate limits per IP.

    Raises ``HTTPException(429)`` with standard rate-limit headers when
    the limit is exceeded.
    """
    limiter = InMemoryRateLimiter(window_ms=window_ms, max_requests=max_requests)

    async def rate_limit_dependency(request: Request) -> None:
        client_ip: str = request.client.host if request.client else "unknown"
        allowed, remaining, reset_seconds = limiter.is_allowed(client_ip)

        headers = {
            "X-RateLimit-Limit": str(max_requests),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Reset": str(reset_seconds),
        }

        if not allowed:
            headers["Retry-After"] = str(reset_seconds)
            raise HTTPException(
                status_code=HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": {
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": message,
                        "retryAfter": reset_seconds,
                    },
                },
                headers=headers,
            )

        # Attach headers to response via the request
        # (FastAPI dependencies can't modify response, so we store for middleware)
        # For now, headers are returned via the exception on block or ignored on pass.

    return rate_limit_dependency
