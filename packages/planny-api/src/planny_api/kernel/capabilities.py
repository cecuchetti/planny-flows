"""Capability registry.

A capability is a named precondition that a module can require without knowing
how it is implemented. Modules declare ``capabilities=("jira",)`` and the kernel
resolves the dependency; adding a capability never touches existing modules.

A capability also carries an optional health probe, which is what lets the health
endpoint report on every configured integration without hardcoding a list.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from planny_core.config import Settings

__all__ = [
    "CAPABILITIES",
    "CAPABILITY_HEALTH",
    "capability_health",
    "resolve_capability",
    "unknown_capabilities",
]

#: Capability name -> FastAPI dependency callable.
CAPABILITIES: dict[str, Callable[..., Awaitable[Any]]] = {}

#: Capability name -> probe returning a health report for it.
CAPABILITY_HEALTH: dict[str, Callable[[Settings], dict[str, Any]]] = {}


def _jira_health(settings: Settings) -> dict[str, Any]:
    """Report whether the Jira instances are configured."""
    internal_ok = bool(settings.internal_atlassian_base_url)
    external_ok = bool(settings.external_atlassian_base_url)
    return {
        "name": "jira_integrations",
        "status": "ok" if (internal_ok or external_ok) else "not_configured",
        "internal_configured": internal_ok,
        "external_configured": external_ok,
    }


def _register_builtin_capabilities() -> None:
    """Populate the registry on first use.

    Registered lazily because the dependency module imports ``planny_core`` and
    is itself imported by the application factory, so importing it at module
    load time would create a cycle.
    """
    from planny_api.dependencies import require_jira_config

    CAPABILITIES.setdefault("jira", require_jira_config)
    CAPABILITY_HEALTH.setdefault("jira", _jira_health)


def resolve_capability(name: str) -> Callable[..., Awaitable[Any]]:
    """Return the dependency implementing *name*.

    Raises:
        KeyError: the capability is not registered.
    """
    _register_builtin_capabilities()
    return CAPABILITIES[name]


def unknown_capabilities(names: tuple[str, ...]) -> list[str]:
    """Return the subset of *names* that is not registered."""
    _register_builtin_capabilities()
    return [name for name in names if name not in CAPABILITIES]


def capability_health(settings: Settings) -> list[dict[str, Any]]:
    """Run every registered health probe, ordered by capability name.

    A capability without a probe simply does not appear: a dependency gate and a
    reportable integration status are separate concerns.
    """
    _register_builtin_capabilities()
    return [probe(settings) for _, probe in sorted(CAPABILITY_HEALTH.items())]
