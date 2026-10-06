"""Module discovery and validation.

Modules are discovered from three places, in this order:

1. Explicit package names (``settings.modules_packages``) — the built-in
   catalog, plus any extra package a merged project wants to register.
2. Sub-packages of the scan roots (``settings.modules_scan_packages``) — every
   sub-package that exposes ``MODULE`` or ``MODULES`` is picked up
   automatically, which is how dropping a package in adds a domain.
3. Installed entry points in the ``planny.modules`` group — how an *installed*
   external project adds domains without any edit to this repository.

Validation runs before mounting and aborts startup with an actionable message
rather than serving a silently incomplete API.
"""

from __future__ import annotations

import importlib
import importlib.metadata
import pkgutil
import types
from collections.abc import Iterable, Iterator, Sequence

from planny_api.kernel.capabilities import unknown_capabilities
from planny_api.kernel.module import ApiModule

__all__ = ["ModuleRegistryError", "discover_modules"]

MODULE_ENTRYPOINT_GROUP = "planny.modules"


class ModuleRegistryError(RuntimeError):
    """Raised when module discovery or validation fails.

    Aborts application startup: a broken module graph must never result in a
    partially mounted API.
    """


def _modules_from_object(obj: object, source: str) -> Iterator[ApiModule]:
    """Yield the modules exposed by *obj*, validating their shape."""
    if obj is None:
        return

    if isinstance(obj, ApiModule):
        yield obj
        return

    if isinstance(obj, types.ModuleType) or hasattr(obj, "MODULE") or hasattr(obj, "MODULES"):
        single = getattr(obj, "MODULE", None)
        if single is not None:
            yield from _modules_from_object(single, source)

        collection = getattr(obj, "MODULES", None)
        if collection is not None:
            if not isinstance(collection, Iterable):
                raise ModuleRegistryError(f"{source}: MODULES must be iterable")
            for item in collection:
                yield from _modules_from_object(item, source)
        return

    if callable(obj):
        yield from _modules_from_object(obj(), source)
        return

    raise ModuleRegistryError(
        f"{source}: expected an ApiModule, a module exposing MODULE/MODULES, "
        f"or a callable returning modules; got {type(obj).__name__}"
    )


def _collect_from_import(import_path: str) -> Iterator[ApiModule]:
    """Import *import_path* and yield its modules.

    Accepts a plain package path (``a.b``) or an attribute path (``a.b:ATTR``).
    """
    module_path, _, attribute = import_path.partition(":")
    try:
        module = importlib.import_module(module_path)
    except ImportError as exc:
        raise ModuleRegistryError(f"cannot import module package {module_path!r}: {exc}") from exc

    target: object = module
    if attribute:
        try:
            target = getattr(module, attribute)
        except AttributeError as exc:
            raise ModuleRegistryError(
                f"{import_path!r}: {module_path!r} has no attribute {attribute!r}"
            ) from exc

    yield from _modules_from_object(target, source=import_path)


def _collect_from_entry_points() -> Iterator[ApiModule]:
    """Yield modules declared by installed ``planny.modules`` entry points."""
    for entry_point in importlib.metadata.entry_points(group=MODULE_ENTRYPOINT_GROUP):
        source = f"entrypoint:{entry_point.name}"
        try:
            loaded = entry_point.load()
        except Exception as exc:  # noqa: BLE001 - surfaced with context below
            raise ModuleRegistryError(f"{source}: failed to load ({exc})") from exc
        yield from _modules_from_object(loaded, source=source)


def _scan_subpackages(base_package: str) -> Iterator[str]:
    """Yield importable sub-package paths of *base_package*, if it exists."""
    try:
        package = importlib.import_module(base_package)
    except ImportError:
        return

    paths = getattr(package, "__path__", None)
    if paths is None:
        return

    for _, name, is_package in pkgutil.iter_modules(paths):
        if is_package and not name.startswith("_"):
            yield f"{base_package}.{name}"


def _validate(modules: dict[str, ApiModule]) -> None:
    """Validate the module graph. Raises :class:`ModuleRegistryError` on error."""
    missing = {
        name: unknown_capabilities(module.capabilities)
        for name, module in modules.items()
        if unknown_capabilities(module.capabilities)
    }
    if missing:
        details = ", ".join(f"{name} -> {caps}" for name, caps in sorted(missing.items()))
        raise ModuleRegistryError(f"unregistered capabilities: {details}")

    for name, module in modules.items():
        unknown = [dep for dep in module.depends_on if dep not in modules]
        if unknown:
            raise ModuleRegistryError(f"module {name!r} depends on unknown module(s): {unknown}")


def _toposort(modules: dict[str, ApiModule]) -> list[ApiModule]:
    """Order modules so dependencies are mounted first.

    Ties are broken alphabetically so the mount order is deterministic.
    """
    ordered: list[ApiModule] = []
    visited: set[str] = set()
    visiting: set[str] = set()

    def visit(name: str) -> None:
        if name in visited:
            return
        if name in visiting:
            raise ModuleRegistryError(f"circular module dependency involving {name!r}")
        visiting.add(name)
        for dependency in sorted(modules[name].depends_on):
            visit(dependency)
        visiting.discard(name)
        visited.add(name)
        ordered.append(modules[name])

    for name in sorted(modules):
        visit(name)
    return ordered


def discover_modules(
    *,
    packages: Sequence[str] = (),
    scan_packages: Sequence[str] = (),
    use_entry_points: bool = True,
) -> list[ApiModule]:
    """Discover, validate and order every API module.

    Args:
        packages: Explicit import paths, e.g. ``["planny_notes.modules"]`` or
            ``["planny_notes.modules"]``.
        scan_packages: Package roots whose sub-packages are auto-imported,
            e.g. ``["planny_api.modules"]``.
        use_entry_points: Include installed ``planny.modules`` entry points.

    Raises:
        ModuleRegistryError: duplicate module names, unregistered capabilities,
            unknown dependencies, circular dependencies, or import failures.
    """
    found: dict[str, ApiModule] = {}

    def add(module: ApiModule, source: str) -> None:
        existing = found.get(module.name)
        if existing is not None:
            raise ModuleRegistryError(
                f"duplicate module name {module.name!r} (already registered, now from {source})"
            )
        found[module.name] = module

    for import_path in (*packages, *_scan_subpackages_all(scan_packages)):
        for module in _collect_from_import(import_path):
            add(module, source=import_path)

    if use_entry_points:
        for module in _collect_from_entry_points():
            add(module, source="entrypoint")

    _validate(found)
    return _toposort(found)


def _scan_subpackages_all(scan_packages: Sequence[str]) -> Iterator[str]:
    """Expand every scan root into its importable sub-package paths."""
    for root in scan_packages:
        yield from _scan_subpackages(root)
