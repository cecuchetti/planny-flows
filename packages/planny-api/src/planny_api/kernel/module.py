"""The ``ApiModule`` contract.

A module declares *what* it exposes and *what* it needs. The kernel decides
*where* and *how* it is mounted. This is what lets a new domain (or an entire
merged project) be added without editing the application factory.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

from fastapi import APIRouter
from planny_core.config import Settings

__all__ = ["ApiModule"]


@dataclass(frozen=True, slots=True)
class ApiModule:
    """A composable unit of the HTTP API.

    Attributes:
        name: Globally unique identifier. Startup fails on a duplicate.
        router: Router whose paths are **relative**. It must not include the
            API version prefix; the kernel adds it.
        version: API version segment, mounted as ``<api_prefix>/v<version>``.
        tags: OpenAPI tags. Defaults to the module name when empty.
        auth: Inject the current-user dependency on every route.
        capabilities: Named capabilities required by the module, resolved
            against the capability registry (for example ``"jira"``).
        versioned: When ``False`` the module is mounted unversioned only.
            Used by infrastructure endpoints such as health probes.
        legacy_alias: Also mount the router at the root, outside the OpenAPI
            schema, so existing clients keep working.
        depends_on: Modules that must be mounted first.
        enabled: Optional predicate to disable the module by configuration.
    """

    name: str
    router: APIRouter
    version: str = "1"
    tags: tuple[str, ...] = ()
    auth: bool = True
    capabilities: tuple[str, ...] = ()
    versioned: bool = True
    legacy_alias: bool = True
    depends_on: tuple[str, ...] = ()
    enabled: Callable[[Settings], bool] | None = None

    @property
    def openapi_tags(self) -> list[str | Enum]:
        """Tags to register in the schema, falling back to the module name."""
        return list(self.tags) if self.tags else [self.name]
