"""FastAPI application factory and entrypoint.

Sets up CORS, middleware, routers, and exception handlers.
"""

from __future__ import annotations

import structlog
from fastapi import Depends, FastAPI, Request
from fastapi.exception_handlers import (
    http_exception_handler as fastapi_http_exception_handler,
)
from fastapi.middleware.cors import CORSMiddleware
from planny_core.config import settings
from planny_core.errors import AppError, RouteNotFoundError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

from planny_api.dependencies import get_current_user
from planny_api.middleware.error_handler import (
    app_error_handler,
    unhandled_exception_handler,
)
from planny_api.middleware.request_id import RequestIDMiddleware
from planny_api.middleware.request_logger import RequestLoggerMiddleware
from planny_api.routers import auth, comments, health, issues, projects, users


def configure_structlog() -> None:
    """Configure structlog logging processors and renderers."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Middleware order (request flow): CORS -> RequestID -> RequestLogger -> router.
    Exception handlers are registered last as outermost catch-all.
    """
    app = FastAPI(
        title="Planny API",
        version="1.0.0",
        docs_url="/docs" if settings.env != "production" else None,
    )

    # ── CORS (exact origin list from Node config) ─────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Custom middleware (order matches Express pipeline) ────────────────
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(RequestLoggerMiddleware)

    # ── Routers ───────────────────────────────────────────────────────────
    app.include_router(health.router)
    app.include_router(auth.router)

    # Protected routes (auth dependency at router level)
    app.include_router(
        projects.router,
        dependencies=[Depends(get_current_user)],
    )
    app.include_router(
        users.router,
        dependencies=[Depends(get_current_user)],
    )
    app.include_router(
        issues.router,
        dependencies=[Depends(get_current_user)],
    )
    app.include_router(
        comments.router,
        dependencies=[Depends(get_current_user)],
    )

    # ── Exception handlers ────────────────────────────────────────────────

    @app.exception_handler(StarletteHTTPException)
    async def starlette_http_exception_handler(
        request: Request,
        exc: StarletteHTTPException,
    ) -> Response:
        """Handle HTTP exceptions — custom 404, default otherwise."""
        if exc.status_code == 404:
            route_exc = RouteNotFoundError(str(request.url))
            return await app_error_handler(request, route_exc)
        # Delegate to FastAPI's default HTTP exception handler
        return await fastapi_http_exception_handler(request, exc)

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    return app


# ── Configure logging on import ─────────────────────────────────────────────
configure_structlog()

# ── Module-level app instance ───────────────────────────────────────────────
app = create_app()
