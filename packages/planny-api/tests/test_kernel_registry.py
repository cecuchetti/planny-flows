"""Tests for the module registry and mounting kernel.

These cover the capabilities the architecture is built around: discovering
modules from packages, from an auto-scanned root, and from installed
``planny.modules`` entry points — plus failing loudly on a broken module graph.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest
from fastapi import APIRouter, FastAPI
from planny_core.config import settings

from planny_api.kernel.module import ApiModule
from planny_api.kernel.mounting import mount_modules, validate_no_doubled_prefix
from planny_api.kernel.registry import ModuleRegistryError, discover_modules

MODULE_SOURCE = '''
from fastapi import APIRouter
from planny_api.kernel.module import ApiModule

router = APIRouter(prefix="/{name}")


@router.get("")
async def handler() -> dict:
    return {{"module": "{name}"}}


MODULE = ApiModule(
    name="{name}",
    router=router,
    {extra}
)
'''


def _write_package(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    package: str,
    modules: dict[str, str],
) -> None:
    """Create an importable package whose ``__init__`` exposes MODULES.

    Args:
        package: dotted package name.
        modules: mapping of module name -> extra ApiModule kwargs source.
    """
    pkg_dir = tmp_path / package
    pkg_dir.mkdir(parents=True, exist_ok=True)

    body_lines = [
        "from fastapi import APIRouter",
        "from planny_api.kernel.module import ApiModule",
        "",
    ]
    names = []
    for name, extra in modules.items():
        body_lines.append(f'_r_{name} = APIRouter(prefix="/{name}")')
        body_lines.append(
            f'MODULE_{name} = ApiModule(name="{name}", router=_r_{name}, {extra})'
        )
        names.append(f"MODULE_{name}")
    body_lines.append(f"MODULES = [{', '.join(names)}]")
    (pkg_dir / "__init__.py").write_text("\n".join(body_lines), encoding="utf-8")

    monkeypatch.syspath_prepend(str(tmp_path))
    importlib.invalidate_caches()
    sys.modules.pop(package, None)


class TestDiscoveryFromPackages:
    """Explicit package discovery."""

    def test_discovers_a_single_module(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write_package(tmp_path, monkeypatch, "pkg_one", {"alpha": ""})
        modules = discover_modules(packages=["pkg_one"], use_entry_points=False)
        assert [m.name for m in modules] == ["alpha"]

    def test_discovers_several_modules(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write_package(tmp_path, monkeypatch, "pkg_two", {"alpha": "", "beta": ""})
        modules = discover_modules(packages=["pkg_two"], use_entry_points=False)
        assert [m.name for m in modules] == ["alpha", "beta"]

    def test_missing_package_reports_clearly(self) -> None:
        with pytest.raises(ModuleRegistryError, match="cannot import"):
            discover_modules(packages=["does_not_exist_xyz"], use_entry_points=False)

    def test_duplicate_module_name_is_rejected(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Two packages claiming the same name must abort startup."""
        _write_package(tmp_path, monkeypatch, "pkg_dup_a", {"dupname": ""})
        _write_package(tmp_path, monkeypatch, "pkg_dup_b", {"dupname": ""})
        with pytest.raises(ModuleRegistryError, match="duplicate module name"):
            discover_modules(packages=["pkg_dup_a", "pkg_dup_b"], use_entry_points=False)


class TestValidation:
    """The module graph is validated before anything is mounted."""

    def test_unknown_capability_is_rejected(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write_package(
            tmp_path, monkeypatch, "pkg_cap", {"needs_cap": 'capabilities=("nonexistent",)'}
        )
        with pytest.raises(ModuleRegistryError, match="unregistered capabilities"):
            discover_modules(packages=["pkg_cap"], use_entry_points=False)

    def test_unknown_dependency_is_rejected(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write_package(
            tmp_path, monkeypatch, "pkg_dep", {"orphan": 'depends_on=("ghost",)'}
        )
        with pytest.raises(ModuleRegistryError, match="depends on unknown module"):
            discover_modules(packages=["pkg_dep"], use_entry_points=False)

    def test_dependencies_are_mounted_first(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write_package(
            tmp_path,
            monkeypatch,
            "pkg_order",
            {"child": 'depends_on=("parent",)', "parent": ""},
        )
        modules = discover_modules(packages=["pkg_order"], use_entry_points=False)
        assert [m.name for m in modules] == ["parent", "child"]

    def test_circular_dependency_is_rejected(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write_package(
            tmp_path,
            monkeypatch,
            "pkg_cycle",
            {"node_a": 'depends_on=("node_b",)', "node_b": 'depends_on=("node_a",)'},
        )
        with pytest.raises(ModuleRegistryError, match="circular module dependency"):
            discover_modules(packages=["pkg_cycle"], use_entry_points=False)

    def test_known_capability_is_accepted(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write_package(tmp_path, monkeypatch, "pkg_jira", {"needs_jira": 'capabilities=("jira",)'})
        modules = discover_modules(packages=["pkg_jira"], use_entry_points=False)
        assert [m.name for m in modules] == ["needs_jira"]


class TestScanPackages:
    """Auto-discovery of sub-packages under a scan root."""

    def test_subpackages_are_found_automatically(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        root = tmp_path / "scan_root"
        root.mkdir()
        (root / "__init__.py").write_text("", encoding="utf-8")
        sub = root / "auto_domain"
        sub.mkdir()
        (sub / "__init__.py").write_text(
            MODULE_SOURCE.format(name="auto_domain", extra=""), encoding="utf-8"
        )

        monkeypatch.syspath_prepend(str(tmp_path))
        importlib.invalidate_caches()
        for name in ("scan_root", "scan_root.auto_domain"):
            sys.modules.pop(name, None)

        modules = discover_modules(scan_packages=["scan_root"], use_entry_points=False)
        assert [m.name for m in modules] == ["auto_domain"]

    def test_missing_scan_root_is_not_an_error(self) -> None:
        """A scan root that does not exist yet is simply skipped."""
        assert discover_modules(scan_packages=["not_installed_yet"], use_entry_points=False) == []


class TestEntryPointDiscovery:
    """Installed packages can add domains with no edit to this repository."""

    def test_module_is_discovered_via_entry_point(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write_package(tmp_path, monkeypatch, "external_notes", {"notes": ""})

        dist_info = tmp_path / "external_notes-0.1.0.dist-info"
        dist_info.mkdir()
        (dist_info / "METADATA").write_text(
            "Metadata-Version: 2.1\nName: external-notes\nVersion: 0.1.0\n",
            encoding="utf-8",
        )
        (dist_info / "entry_points.txt").write_text(
            "[planny.modules]\nnotes = external_notes\n", encoding="utf-8"
        )

        monkeypatch.syspath_prepend(str(tmp_path))
        importlib.invalidate_caches()

        modules = discover_modules(use_entry_points=True)
        assert "notes" in [m.name for m in modules]


class TestMounting:
    """Mounting behaviour for the ApiModule flags."""

    @staticmethod
    def _app() -> FastAPI:
        return FastAPI()

    @staticmethod
    def _module(name: str, **kwargs: object) -> ApiModule:
        """Build a module with one real route, so it actually appears in the schema."""
        router = APIRouter(prefix=f"/{name}")

        @router.get("")
        async def _handler() -> dict[str, str]:
            return {"module": name}

        return ApiModule(name=name, router=router, **kwargs)  # type: ignore[arg-type]

    def test_versioned_module_mounts_both_prefixes(self) -> None:
        app = self._app()
        mount_modules(
            app, [self._module("thing")], settings=settings, api_prefix="/api", legacy_aliases=True
        )
        paths = app.openapi()["paths"]
        assert "/api/v1/thing" in paths
        assert "/thing" not in paths  # alias is outside the schema

    def test_alias_disabled_mounts_only_versioned(self) -> None:
        app = self._app()
        mount_modules(
            app, [self._module("thing")], settings=settings, api_prefix="/api", legacy_aliases=False
        )
        assert "/api/v1/thing" in app.openapi()["paths"]

    def test_unversioned_module_mounts_at_root_only(self) -> None:
        app = self._app()
        mount_modules(
            app,
            [self._module("probe", versioned=False)],
            settings=settings,
            api_prefix="/api",
            legacy_aliases=True,
        )
        paths = app.openapi()["paths"]
        assert "/probe" in paths
        assert "/api/v1/probe" not in paths

    def test_unversioned_module_survives_aliases_being_disabled(self) -> None:
        """Turning compatibility aliases off must not remove health probes."""
        app = self._app()
        mounted = mount_modules(
            app,
            [self._module("probe", versioned=False)],
            settings=settings,
            api_prefix="/api",
            legacy_aliases=False,
        )
        assert mounted == ["probe"]
        assert "/probe" in app.openapi()["paths"]

    def test_opt_out_module_is_not_mounted(self) -> None:
        app = self._app()
        mounted = mount_modules(
            app,
            [self._module("optional", enabled=lambda _settings: False)],
            settings=settings,
            api_prefix="/api",
            legacy_aliases=True,
        )
        assert mounted == []
        assert app.openapi()["paths"] == {}

    def test_opt_in_module_is_mounted(self) -> None:
        app = self._app()
        mounted = mount_modules(
            app,
            [self._module("optional", enabled=lambda _settings: True)],
            settings=settings,
            api_prefix="/api",
            legacy_aliases=True,
        )
        assert mounted == ["optional"]

    def test_doubled_prefix_is_detected(self) -> None:
        """Guards against a router carrying the version prefix itself."""
        app = self._app()
        router = APIRouter(prefix="/api/v1/bad")

        @router.get("")
        async def _handler() -> dict[str, str]:
            return {}

        bad = ApiModule(name="bad", router=router)
        mount_modules(app, [bad], settings=settings, api_prefix="/api", legacy_aliases=False)
        with pytest.raises(RuntimeError, match="doubled API prefix"):
            validate_no_doubled_prefix(app, "/api")
