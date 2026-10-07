"""Architecture tests.

These turn the blueprint's guiding principles into something the test suite
enforces, so the structure cannot quietly erode. Everything here reads source
with :mod:`ast` instead of importing, which keeps the checks independent of
import order and side effects.
"""

from __future__ import annotations

import ast
import importlib.metadata
from pathlib import Path

import planny_core
import pytest

import planny_api

API_ROOT = Path(planny_api.__file__).resolve().parent
CORE_ROOT = Path(planny_core.__file__).resolve().parent
MODULES_DIR = API_ROOT / "modules"
#: .../packages — the root that contains every workspace package.
PACKAGES_DIR = CORE_ROOT.parents[2]

#: The optional plugin distribution, whose domains live outside ``planny_api``.
#: A deployment that does not install it has none of these paths on disk, so
#: every scan over them must stay a no-op.
PLUGIN_ROOT = PACKAGES_DIR / "planny-loans" / "src" / "planny_loans"
PLUGIN_IMPORT = "planny_loans"


def _imported_names(path: Path) -> set[str]:
    """Return every module name imported by *path*."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def _reads_environment(path: Path) -> bool:
    """Whether *path* actually reads the process environment.

    Implemented over the AST rather than as a substring search: mentioning
    ``os.environ`` in a docstring (to explain why the module does *not* use it)
    is not a violation.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"))

    aliases: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(alias.name == "os" for alias in node.names):
                aliases.add("os")
        elif isinstance(node, ast.ImportFrom) and node.module == "os":
            aliases.update(
                alias.asname or alias.name
                for alias in node.names
                if alias.name in {"environ", "getenv"}
            )
        elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            if node.value.id == "os" and node.attr in {"environ", "getenv"}:
                return True
        elif isinstance(node, ast.Name) and node.id in aliases:
            return True

    return False


def _constructs_queries(path: Path) -> bool:
    """Whether *path* imports the query-building parts of SQLAlchemy.

    ``sqlalchemy.ext.asyncio`` is excluded on purpose: importing
    ``AsyncSession`` for a FastAPI dependency annotation does not put SQL in the
    module, whereas importing ``select``/``sqlalchemy.orm`` does.
    """
    return any(
        name == "sqlalchemy" or name.startswith("sqlalchemy.orm")
        for name in _imported_names(path)
    )


def _python_files(root: Path) -> list[Path]:
    return [
        path
        for path in root.rglob("*.py")
        if "__pycache__" not in path.parts
    ]


def _top_level_names(path: Path) -> set[str]:
    """Return names assigned at module top level in *path*."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    names.add(target.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
    return names


def _module_packages() -> list[Path]:
    """Every domain package under ``planny_api/modules``."""
    return sorted(
        path
        for path in MODULES_DIR.iterdir()
        if path.is_dir() and not path.name.startswith("_") and (path / "__init__.py").is_file()
    )


def _plugin_domain_packages() -> list[Path]:
    """The plugin's domain packages, or nothing when it is not installed.

    ``TestModulePackages`` parametrizes over ``_module_packages()``, which only
    reaches ``planny_api/modules``. The plugin's domains live outside it, so the
    declarations that rule protects have to be checked separately or the move
    would quietly drop them from the suite.
    """
    if not PLUGIN_ROOT.is_dir():
        return []
    return [
        path
        for path in sorted(PLUGIN_ROOT.iterdir())
        if path.is_dir() and not path.name.startswith("_") and (path / "__init__.py").is_file()
    ]


def _plugin_is_installed() -> bool:
    """Whether the optional ``planny-loans`` distribution is installed here."""
    try:
        importlib.metadata.version("planny-loans")
    except importlib.metadata.PackageNotFoundError:
        return False
    return True


class TestModulePackages:
    """P1 — one domain, one folder, one declarative entrypoint."""

    def test_modules_directory_exists(self) -> None:
        assert MODULES_DIR.is_dir()

    def test_at_least_one_domain_has_been_migrated(self) -> None:
        assert _module_packages(), "expected at least one domain under planny_api/modules"

    @pytest.mark.parametrize("package", _module_packages(), ids=lambda p: p.name)
    def test_package_exposes_a_module_or_modules(self, package: Path) -> None:
        """Auto-discovery relies on ``MODULE``/``MODULES`` being present."""
        names = _top_level_names(package / "__init__.py")
        assert names & {"MODULE", "MODULES"}, (
            f"{package.name}/__init__.py exposes neither MODULE nor MODULES, "
            "so the registry cannot discover it"
        )

    def test_every_domain_is_discovered_without_an_explicit_list(self) -> None:
        """The whole point of the registry: dropping a package registers a domain.

        ``modules_packages`` must stay empty. If it gains an entry, adding a
        domain requires editing configuration again — exactly what this
        architecture exists to avoid.
        """
        from planny_core.config import settings

        from planny_api.kernel.registry import discover_modules

        assert settings.modules_packages == [], (
            "modules_packages should be empty: domains are auto-discovered from "
            f"{settings.modules_scan_packages}"
        )

        discovered = {
            module.name
            for module in discover_modules(
                packages=[],
                scan_packages=settings.modules_scan_packages,
                use_entry_points=False,
            )
        }
        # ``modules/jira`` is a container: it exposes MODULES built from two
        # nested packages rather than a single module named after itself.
        container_packages = {"jira"}
        expected = ({package.name for package in _module_packages()} - container_packages) | {
            "jira_issues",
            "jira_worklogs",
        }
        assert expected <= discovered, f"undiscovered domains: {sorted(expected - discovered)}"

    def test_the_compatibility_layer_directories_are_gone(self) -> None:
        """``routers/``, ``schemas/`` and ``services/`` no longer exist.

        Their disappearance is the structural signal that the migration is
        complete; if one reappears, a domain was added in the wrong place.
        """
        for legacy in ("routers", "schemas", "services"):
            assert not (API_ROOT / legacy).exists(), (
                f"planny_api/{legacy}/ reappeared; domains belong under planny_api/modules/"
            )


class TestLayerBoundaries:
    """P2 — the kernel does not know about the web framework."""

    def test_core_does_not_import_the_web_framework(self) -> None:
        forbidden = {"fastapi", "starlette"}
        offenders = {
            path.relative_to(PACKAGES_DIR).as_posix(): sorted(
                name for name in _imported_names(path) if name.split(".")[0] in forbidden
            )
            for path in _python_files(CORE_ROOT)
            if any(name.split(".")[0] in forbidden for name in _imported_names(path))
        }
        assert not offenders, f"planny-core must stay framework-agnostic: {offenders}"


class TestConfigurationBoundary:
    """P4 — ``os.environ`` is read only inside the configuration layer.

    The configuration layer is now the whole ``planny_core/config`` package, so
    the rule is exact: anything under that directory may read the environment,
    anything outside it may not.
    """

    CONFIG_PACKAGE = CORE_ROOT / "config"

    def test_no_environment_reads_outside_configuration(self) -> None:
        offenders = [
            path.relative_to(PACKAGES_DIR).as_posix()
            for path in _python_files(PACKAGES_DIR)
            if "tests" not in path.parts
            and self.CONFIG_PACKAGE not in path.resolve().parents
            and _reads_environment(path)
        ]
        assert not offenders, (
            "these modules read the process environment directly; route them through "
            f"the configuration layer instead: {offenders}"
        )

    def test_the_configuration_layer_exists(self) -> None:
        """Sanity check: the exemption points at a real package."""
        assert (self.CONFIG_PACKAGE / "__init__.py").is_file()

    def test_the_configuration_layer_is_the_only_place_that_reads_it(self) -> None:
        """The layer must actually contain the reads, or the rule proves nothing."""
        readers = [
            path.name
            for path in _python_files(self.CONFIG_PACKAGE)
            if _reads_environment(path)
        ]
        assert readers, "no module in the configuration layer reads the environment"


class TestFactorySize:
    """P5 — the factory wires, it does not enumerate domains."""

    def test_main_is_an_entrypoint_only(self) -> None:
        lines = (API_ROOT / "main.py").read_text(encoding="utf-8").splitlines()
        assert len(lines) <= 40, f"main.py grew to {len(lines)} lines"

    def test_factory_does_not_import_domain_routers(self) -> None:
        """A new domain must not require editing the factory."""
        imported = _imported_names(API_ROOT / "app" / "factory.py")
        offenders = {
            name
            for name in imported
            if name.startswith("planny_api.routers") or name.startswith("planny_api.modules")
        }
        assert not offenders, f"factory imports domain routers: {sorted(offenders)}"


class TestRouterThinness:
    """P3 — routers must not contain SQL. This is a ratchet, not a pass.

    The set below is the known remaining debt; it must shrink to empty by the
    end of Phase 4. If it changes unexpectedly the test fails, which keeps the
    inventory honest instead of letting it drift.
    """

    KNOWN_DEBT: set[str] = set()
    """Routers still allowed to build queries. Empty since Phase 4 began."""

    ROUTER_FILENAMES = {"router.py", "issues.py", "projects.py", "comments.py"}

    def _routers_constructing_queries(self) -> set[str]:
        offenders: set[str] = set()
        # The application's own domains live under planny_api/modules.
        for path in _python_files(API_ROOT):
            in_domain = "modules" in path.parts or "routers" in path.parts
            if not in_domain or path.name not in self.ROUTER_FILENAMES:
                continue
            if _constructs_queries(path):
                offenders.add(path.relative_to(API_ROOT).as_posix())
        # An installed plugin's domains sit at the root of its import package
        # rather than under a ``modules`` directory, so every router file counts.
        for path in _python_files(PLUGIN_ROOT):
            if path.name in self.ROUTER_FILENAMES and _constructs_queries(path):
                offenders.add(path.relative_to(PACKAGES_DIR).as_posix())
        return offenders

    def test_only_known_routers_build_queries(self) -> None:
        offenders = self._routers_constructing_queries()
        unexpected = offenders - self.KNOWN_DEBT
        assert not unexpected, (
            f"routers gained SQL access: {sorted(unexpected)}. Routers must delegate "
            "to a service or repository."
        )
        assert not (self.KNOWN_DEBT - offenders), (
            "debt registry is stale: these routers no longer build queries, "
            f"remove them from KNOWN_DEBT: {sorted(self.KNOWN_DEBT - offenders)}"
        )


class TestOptionalPluginBoundary:
    """P6 — the plugin is optional, so the application must not import it.

    ``planny-loans`` ships ``borrowers`` and ``loans`` and is discovered through
    the ``planny.modules`` entry point installed with the distribution. A
    deployment that omits the package must boot unchanged, which only holds
    while nothing under ``planny_api`` reaches for it.
    """

    def test_the_application_does_not_import_the_plugin(self) -> None:
        offenders = [
            path.relative_to(API_ROOT).as_posix()
            for path in _python_files(API_ROOT)
            if any(
                name == PLUGIN_IMPORT or name.startswith(f"{PLUGIN_IMPORT}.")
                for name in _imported_names(path)
            )
        ]
        assert not offenders, (
            "planny_api must not import the optional plugin; it is discovered "
            f"through the {PLUGIN_IMPORT!r} entry point: {offenders}"
        )

    def test_the_plugins_domains_declare_themselves(self) -> None:
        """Keep the P1 declaration rule reaching the domains that moved out.

        ``TestModulePackages.test_package_exposes_a_module_or_modules`` is
        parametrized over ``planny_api/modules``, so it stopped covering these
        two the moment they moved. The registry would fail loudly on a missing
        ``MODULE``/``MODULES``, but the rule is meant to catch it here.
        """
        missing = [
            path.name
            for path in _plugin_domain_packages()
            if not (_top_level_names(path / "__init__.py") & {"MODULE", "MODULES"})
        ]
        assert not missing, (
            f"{missing} expose neither MODULE nor MODULES, so the registry "
            "cannot discover them through the plugin's MODULES tuple"
        )

    def test_the_plugin_scans_are_not_silently_empty(self) -> None:
        """A misplaced plugin must fail loudly instead of skipping its own rules.

        Every plugin scan in this file is a no-op when the sources are not where
        they are expected. That is right for an environment that never installs
        the distribution, and dangerous everywhere else: a rename or a
        restructure would quietly stop governing two whole domains, which is the
        exact class of silent erosion this file exists to prevent. Installed
        distribution and findable sources are the same fact in practice, so the
        two are tied together here.
        """
        if not _plugin_is_installed():
            return
        assert PLUGIN_ROOT.is_dir(), (
            f"{PLUGIN_IMPORT} is installed but its sources are not at {PLUGIN_ROOT}; "
            "the plugin scans in this file are checking nothing"
        )
        assert _plugin_domain_packages(), (
            f"{PLUGIN_ROOT} holds no domain packages; "
            "the plugin scans in this file are checking nothing"
        )
