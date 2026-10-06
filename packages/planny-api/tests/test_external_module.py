"""Tests for the "merge another project" story.

The claim the architecture makes is that adding a domain — or an entire external
project — requires no edit to the application factory, the module registry or any
configuration file. These tests hold that claim to account using the example
package that ships in ``tests/fixtures``.
"""

from __future__ import annotations

import importlib
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.config import Settings
from planny_core.config import settings as process_settings

from planny_api.main import create_app

API_ROOT = Path(__file__).resolve().parents[1] / "src" / "planny_api"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
EXAMPLE_PACKAGE = "planny_example_module"


@pytest.fixture
def example_module_on_path(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """Make the example package importable and clear it from the module cache."""
    monkeypatch.syspath_prepend(str(FIXTURES_DIR))
    importlib.invalidate_caches()
    for name in list(sys.modules):
        if name == EXAMPLE_PACKAGE or name.startswith(f"{EXAMPLE_PACKAGE}."):
            del sys.modules[name]
    yield EXAMPLE_PACKAGE
    for name in list(sys.modules):
        if name == EXAMPLE_PACKAGE or name.startswith(f"{EXAMPLE_PACKAGE}."):
            del sys.modules[name]


def _settings_with_example_module() -> Settings:
    """Configuration that registers the external package and nothing else new."""
    return Settings(
        _env_file=None,
        env="development",
        jwt_secret="test-secret",
        modules_packages=[EXAMPLE_PACKAGE],
        modules_scan_packages=[],
        api_legacy_aliases=True,
    )


@pytest.fixture
async def client(example_module_on_path: str) -> Iterator[AsyncClient]:
    """Client for an app whose only change is the extra module package."""
    app: FastAPI = create_app(_settings_with_example_module())
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestExternalModuleIsMounted:
    """The package is discovered and mounted without touching the application."""

    def test_routes_are_absent_by_default(self) -> None:
        """Guard: the example is not part of the built-in application."""
        assert "/api/v1/example-notes" not in create_app(process_settings).openapi()["paths"]

    def test_versioned_route_is_mounted(self, example_module_on_path: str) -> None:
        app = create_app(_settings_with_example_module())
        assert "/api/v1/example-notes" in app.openapi()["paths"]

    def test_factory_has_no_knowledge_of_the_package(self) -> None:
        """The factory must not name any domain, let alone an external one."""
        factory_source = (API_ROOT / "app" / "factory.py").read_text(encoding="utf-8")
        assert EXAMPLE_PACKAGE not in factory_source
        # Nor should it import a domain router directly.
        assert "from planny_api.modules" not in factory_source

    def test_catalog_file_is_gone(self) -> None:
        """Domains are discovered from packages, not from a hand-maintained list."""
        assert not (API_ROOT / "catalog.py").exists()


class TestExternalModuleBehavesLikeABuiltIn:
    """An external domain gets versioning, aliasing and auth for free."""

    async def test_requires_authentication(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/example-notes")
        assert response.status_code == 401

    async def test_legacy_alias_matches_the_versioned_route(self, client: AsyncClient) -> None:
        versioned = await client.get("/api/v1/example-notes")
        legacy = await client.get("/example-notes")
        assert versioned.status_code == legacy.status_code == 401

    async def test_alias_is_not_documented(self, client: AsyncClient) -> None:
        from fastapi import FastAPI as _FastAPI  # noqa: F401 - readability

        app = create_app(_settings_with_example_module())
        paths = app.openapi()["paths"]
        assert "/api/v1/example-notes" in paths
        assert "/example-notes" not in paths


class TestEntryPointRegistration:
    """An installed project registers itself with no configuration change at all."""

    def test_entry_point_package_is_discovered(
        self,
        example_module_on_path: str,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Simulates ``pip install``-ing a project that publishes the entry point."""
        dist_info = tmp_path / "planny_example-0.1.0.dist-info"
        dist_info.mkdir()
        (dist_info / "METADATA").write_text(
            "Metadata-Version: 2.1\nName: planny-example\nVersion: 0.1.0\n",
            encoding="utf-8",
        )
        (dist_info / "entry_points.txt").write_text(
            f"[planny.modules]\nexample = {EXAMPLE_PACKAGE}\n",
            encoding="utf-8",
        )
        monkeypatch.syspath_prepend(str(tmp_path))
        importlib.invalidate_caches()

        # No modules_packages, no scan roots: discovery relies purely on the
        # entry point and the built-in scan of planny_api.modules.
        settings = Settings(
            _env_file=None,
            env="development",
            jwt_secret="test-secret",
            modules_packages=[],
            modules_scan_packages=["planny_api.modules"],
            modules_use_entry_points=True,
        )
        paths = create_app(settings).openapi()["paths"]

        assert "/api/v1/example-notes" in paths, "the entry point was not discovered"
        # The built-in domains are still there.
        assert "/api/v1/issues" in paths
