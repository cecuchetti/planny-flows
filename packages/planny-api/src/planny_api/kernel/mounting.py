"""Mounting: canonical versioned prefix plus the automatic legacy alias.

Both mounts use the *same* router object. The legacy mount is excluded from the
OpenAPI schema for versioned modules, so the documentation shows only the
canonical versioned API while existing clients keep working unchanged.
"""

from __future__ import annotations

from collections.abc import Sequence

from fastapi import FastAPI
from fastapi.params import Depends as DependsParam
from planny_core.config import Settings

from planny_api.dependencies import get_current_user
from planny_api.kernel.capabilities import resolve_capability
from planny_api.kernel.module import ApiModule

__all__ = ["mount_modules", "resolve_dependencies", "validate_no_doubled_prefix"]


def resolve_dependencies(module: ApiModule) -> list[DependsParam]:
    """Build the dependency list a module declares.

    Authentication is added first so an unauthenticated request is rejected
    before any capability check runs.
    """
    dependencies: list[DependsParam] = []
    if module.auth:
        dependencies.append(DependsParam(get_current_user))
    for capability in module.capabilities:
        dependencies.append(DependsParam(resolve_capability(capability)))
    return dependencies


def mount_modules(
    app: FastAPI,
    modules: Sequence[ApiModule],
    *,
    settings: Settings,
    api_prefix: str,
    legacy_aliases: bool,
) -> list[str]:
    """Mount every enabled module and return the names that were mounted."""
    mounted: list[str] = []

    for module in modules:
        if module.enabled is not None and not module.enabled(settings):
            continue

        dependencies = resolve_dependencies(module)
        tags = module.openapi_tags
        # For a versioned module the root mount is a compatibility alias, so it
        # stays out of the schema. For an unversioned-only module the root is
        # the canonical location and must be documented.
        root_is_alias = module.versioned

        if module.versioned:
            app.include_router(
                module.router,
                prefix=f"{api_prefix}/v{module.version}",
                tags=tags,
                dependencies=dependencies,
            )

        # Unversioned-only modules (health probes) must always be mounted:
        # turning the compatibility aliases off must not remove them.
        if module.legacy_alias and (legacy_aliases or not module.versioned):
            app.include_router(
                module.router,
                prefix="",
                tags=tags,
                dependencies=dependencies,
                include_in_schema=not root_is_alias,
            )

        mounted.append(module.name)

    return mounted


def validate_no_doubled_prefix(app: FastAPI, api_prefix: str) -> None:
    """Fail if any schema path repeats the API prefix.

    This catches the class of bug where a router already carries the version
    prefix and the kernel adds it again, producing ``/api/v1/api/v1/...`` and
    silently breaking those routes.

    Raises:
        RuntimeError: a path contains the prefix more than once.
    """
    doubled = [path for path in app.openapi().get("paths", {}) if path.count(api_prefix) > 1]
    if doubled:
        raise RuntimeError(
            "doubled API prefix detected in mounted routes (check that module "
            f"routers do not declare {api_prefix!r} themselves): {sorted(doubled)}"
        )
