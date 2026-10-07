"""The installation contract of the optional loans distribution.

Two of the plan's acceptance criteria are about what happens when the package
*is* and *is not* present, so they are proven here rather than by hand: the
domains arrive through the ``planny.modules`` entry point, and an environment
without the distribution boots the application with none of their routes.
"""

from __future__ import annotations

import importlib.metadata
import sys
from importlib.abc import MetaPathFinder
from typing import Any

import pytest
from planny_api.kernel.registry import discover_modules
from planny_api.main import create_app

PLUGIN_PACKAGE = "planny_loans"


class _AbsentPluginBlocker(MetaPathFinder):
    """Refuse every import of the plugin, exactly as an absent package would."""

    def find_spec(self, fullname: str, path: Any = None, target: Any = None) -> Any:
        if fullname == PLUGIN_PACKAGE or fullname.startswith(f"{PLUGIN_PACKAGE}."):
            raise ModuleNotFoundError(f"No module named {fullname!r}", name=fullname)
        return None


@pytest.fixture
def plugin_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Simulate an environment where ``planny-loans`` was never installed."""
    # No distribution means no entry point in the group...
    monkeypatch.setattr(importlib.metadata, "entry_points", lambda **_: ())
    # ...and no module to import, even from a stale in-process cache.
    for name in list(sys.modules):
        if name == PLUGIN_PACKAGE or name.startswith(f"{PLUGIN_PACKAGE}."):
            monkeypatch.delitem(sys.modules, name, raising=False)
    monkeypatch.setattr(sys, "meta_path", [_AbsentPluginBlocker(), *sys.meta_path])


def test_the_domains_are_discovered_from_the_entry_point() -> None:
    """DISCOVERY: nothing lists them; the installed entry point supplies them."""
    discovered = {
        module.name
        for module in discover_modules(packages=[], scan_packages=[], use_entry_points=True)
    }
    assert {"borrowers", "loans"} <= discovered


def test_the_application_boots_without_the_plugin(plugin_absent: None) -> None:
    """NOT_INSTALLED: the app starts, mounts no plugin route and imports nothing."""
    paths = create_app().openapi()["paths"]
    assert not [path for path in paths if "loans" in path or "borrowers" in path]
    assert "/api/v1/issues" in paths, "the built-in domains must still mount"
