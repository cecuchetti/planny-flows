"""Request logging middleware.

Logs every incoming request and its completion. Query strings are redacted and
truncated: today's endpoints only carry search terms and dates, but a future one
could put a token in the query string, and logs outlive the request.
"""

from __future__ import annotations

import time
from collections.abc import Iterable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

__all__ = ["RequestLoggerMiddleware", "redact_query"]

logger = structlog.get_logger()

#: Query parameter names whose values must never reach the logs.
SENSITIVE_KEYS = frozenset(
    {
        "access_token",
        "api_key",
        "apikey",
        "authorization",
        "key",
        "password",
        "refresh_token",
        "secret",
        "token",
    }
)

#: Longest query string to log before truncating.
MAX_QUERY_LENGTH = 200

REDACTED = "***"


def redact_query(items: Iterable[tuple[str, str]]) -> str:
    """Render query *items* for logging, masking sensitive values.

    Key order is preserved so the log still shows which parameters were present.
    """
    rendered = "&".join(
        f"{key}={REDACTED}" if key.lower() in SENSITIVE_KEYS else f"{key}={value}"
        for key, value in items
    )
    if len(rendered) > MAX_QUERY_LENGTH:
        return f"{rendered[:MAX_QUERY_LENGTH]}...(truncated)"
    return rendered


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """Log request start and completion.

    Incoming: ``INFO`` with method, path and redacted query.
    Completion: ``DEBUG`` below 400, ``WARNING`` at or above it, with duration.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        start_time = time.monotonic()
        request_id: str = getattr(request.state, "request_id", "unknown")

        logger.info(
            "Incoming request",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            query=redact_query(request.query_params.multi_items()),
        )

        response = await call_next(request)

        duration_ms = round((time.monotonic() - start_time) * 1000)
        log_method = logger.warning if response.status_code >= 400 else logger.debug
        log_method(
            "Request completed",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )

        return response
