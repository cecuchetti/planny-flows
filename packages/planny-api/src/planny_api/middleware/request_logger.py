"""Request logger middleware — log incoming requests and their completion."""

from __future__ import annotations

import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger()


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """Log every incoming request and its completion status.

    Incoming: ``INFO`` with method, path, query.
    Completion: ``DEBUG`` for <400, ``WARNING`` for >=400, includes ``duration_ms``.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Log request start and completion."""
        start_time = time.monotonic()

        request_id: str = getattr(request.state, "request_id", "unknown")

        logger.info(
            "Incoming request",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            query=str(request.query_params),
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
