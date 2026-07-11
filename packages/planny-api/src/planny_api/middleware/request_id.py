"""Request ID middleware — assigns or propagates ``x-request-id``."""

from __future__ import annotations

from uuid import uuid4

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Read ``x-request-id`` from the incoming request or generate a new one.

    Attaches the ID to ``request.state.request_id``, binds it to the
    structlog context, and sets the ``x-request-id`` response header.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Assign or propagate request ID."""
        request_id: str | None = request.headers.get("x-request-id")
        if not request_id:
            request_id = f"req_{uuid4().hex[:16]}"

        request.state.request_id = request_id
        structlog.contextvars.bind_contextvars(request_id=request_id)

        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response
