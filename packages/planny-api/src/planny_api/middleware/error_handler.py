"""Error handlers for FastAPI — transforms exceptions into JSON responses.

Matches the Node error response format exactly:

.. code:: json

    {
        "error": {
            "message": "Issue not found.",
            "code": "ENTITY_NOT_FOUND",
            "status": 404,
            "data": {}
        },
        "requestId": "req_a1b2c3d4e5f6"
    }
"""

from __future__ import annotations

import structlog
from fastapi import Request
from fastapi.responses import JSONResponse
from planny_core.errors import AppError

logger = structlog.get_logger()


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handle ``AppError`` and subclasses.

    Skips logging for 401 (auth failure — matches Node behavior).
    Returns structured JSON matching the existing error format.
    """
    request_id: str = getattr(request.state, "request_id", "unknown")
    status_code = exc.status_code

    if status_code != 401:
        logger.warning(
            "Request error",
            request_id=request_id,
            code=exc.code,
            status=status_code,
            message=exc.message,
        )

    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "message": exc.message,
                "code": exc.code,
                "status": status_code,
                "data": exc.data,
            },
            "requestId": request_id,
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unhandled exceptions — always return 500 with generic message.

    Logs the full traceback but masks internal details from the client.
    """
    request_id: str = getattr(request.state, "request_id", "unknown")

    logger.exception(
        "Unhandled exception",
        request_id=request_id,
        error=str(exc),
    )

    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "message": "Something went wrong, please contact our support.",
                "code": "INTERNAL_ERROR",
                "status": 500,
                "data": {},
            },
            "requestId": request_id,
        },
    )
