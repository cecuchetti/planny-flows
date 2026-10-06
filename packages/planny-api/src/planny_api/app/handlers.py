"""Exception handlers and the root route.

Kept out of the application factory so the factory reads as wiring only.
"""

from __future__ import annotations

from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.exception_handlers import (
    http_exception_handler as fastapi_http_exception_handler,
)
from fastapi.responses import RedirectResponse
from planny_core.config import Settings
from planny_core.errors import AppError, RouteNotFoundError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

from planny_api.middleware.error_handler import (
    app_error_handler,
    unhandled_exception_handler,
)

__all__ = ["register_error_handlers", "register_root_route"]


async def _starlette_http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> Response:
    """Turn 404s into the standard error envelope; delegate everything else.

    Unknown routes must use the same ``{"error": ..., "requestId": ...}`` shape
    as application errors, otherwise clients have to special-case them.
    """
    if exc.status_code == 404:
        return await app_error_handler(request, RouteNotFoundError(str(request.url)))
    return await fastapi_http_exception_handler(request, exc)


def register_error_handlers(app: FastAPI) -> None:
    """Attach the application's exception handlers."""
    app.add_exception_handler(
        StarletteHTTPException,
        cast(Any, _starlette_http_exception_handler),
    )
    app.add_exception_handler(AppError, cast(Any, app_error_handler))
    app.add_exception_handler(Exception, unhandled_exception_handler)


def register_root_route(app: FastAPI, settings: Settings) -> None:
    """Serve ``GET /`` as a redirect to the client application.

    This lives at application level, not in a module: it is not a domain, and
    keeping it inside the auth router caused it to be versioned to ``/api/v1/``
    once modules were mounted under a prefix (blueprint section 4.4, Pitfall 2).
    """

    @app.get("/", include_in_schema=False)
    async def root_redirect() -> RedirectResponse:
        return RedirectResponse(url=settings.client_url, status_code=302)
