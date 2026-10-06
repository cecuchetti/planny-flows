"""Application factory.

Wiring only: configuration validation, middleware, error handlers, the root
route, and module mounting. The factory never enumerates domains — modules are
discovered by the kernel, so adding one is a matter of dropping a package that
exposes ``MODULE``.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from planny_core.config import Settings
from planny_core.config import settings as default_settings

from planny_api.app.handlers import register_error_handlers, register_root_route
from planny_api.app.lifespan import lifespan
from planny_api.kernel.mounting import mount_modules, validate_no_doubled_prefix
from planny_api.kernel.registry import discover_modules
from planny_api.middleware.request_id import RequestIDMiddleware
from planny_api.middleware.request_logger import RequestLoggerMiddleware

__all__ = ["create_app"]


def _register_middleware(app: FastAPI, settings: Settings) -> None:
    """Attach CORS and the request pipeline.

    Middleware added last runs first, so the request order is
    CORS -> RequestID -> RequestLogger -> router.
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(RequestLoggerMiddleware)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create and configure the FastAPI application.

    Args:
        settings: Configuration to use. Defaults to the process singleton, which
            keeps existing entrypoints working; passing an explicit object makes
            the factory testable.

    Raises:
        InsecureConfigurationError: the resolved configuration is unsafe for the
            current environment.
        ModuleRegistryError: module discovery or validation failed.
        RuntimeError: a mounted route repeats the API prefix.
    """
    resolved = settings or default_settings

    # Fail loudly before serving traffic if the configuration is unsafe for the
    # current environment (e.g. development JWT secret in production).
    resolved.validate_for_startup()

    # Interactive documentation and the OpenAPI schema are development-only.
    # All three must be gated together: leaving redoc_url or openapi_url at
    # their defaults keeps exposing the API surface in production even with
    # /docs disabled (finding H12).
    is_production = resolved.env == "production"

    app = FastAPI(
        title=resolved.api_title,
        version=resolved.api_version,
        # Owns the long-lived resources and guarantees they are closed.
        lifespan=lifespan,
        docs_url=None if is_production else "/docs",
        redoc_url=None if is_production else "/redoc",
        openapi_url=None if is_production else "/openapi.json",
    )

    # Read by the lifespan so an explicitly injected configuration wins over the
    # process singleton.
    app.state.settings = resolved

    _register_middleware(app, resolved)
    register_error_handlers(app)
    register_root_route(app, resolved)

    modules = discover_modules(
        packages=resolved.modules_packages,
        scan_packages=resolved.modules_scan_packages,
        use_entry_points=resolved.modules_use_entry_points,
    )
    mount_modules(
        app,
        modules,
        settings=resolved,
        api_prefix=resolved.api_prefix,
        legacy_aliases=resolved.api_legacy_aliases,
    )

    # Catch the doubled-prefix class of bug at startup rather than in traffic.
    validate_no_doubled_prefix(app, resolved.api_prefix)

    return app
