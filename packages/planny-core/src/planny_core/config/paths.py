"""Project path resolution.

Every path used for configuration is derived from this module's own location
(or from an explicit override), never from the process working directory.

Rationale: ``env_file=".env"`` is CWD-relative, so running the same code from a
different directory silently dropped the whole configuration and fell back to
defaults -- including a publicly known development JWT secret. See finding H13
in ``docs/architecture/2026-10-05-backend-modular-blueprint.md``.

Reading ``os.environ`` here is intentional and allowed: this module is part of
the configuration layer.
"""

from __future__ import annotations

import os
from pathlib import Path

__all__ = ["PACKAGE_ROOT", "PROJECT_ROOT", "data_dir", "env_file", "project_root"]

#: ``.../packages/planny-core/src/planny_core`` when running from the repo.
PACKAGE_ROOT = Path(__file__).resolve().parent

#: Name of the environment variable that overrides project-root discovery.
ROOT_OVERRIDE_ENV = "PLANNY_ROOT"


def project_root() -> Path:
    """Return the project root directory.

    Resolution order:

    1. ``PLANNY_ROOT`` if set (useful for deployments and for tests that need
       to point at a fixture tree).
    2. The workspace root: the outermost ancestor containing ``pyproject.toml``
       and a ``packages/`` directory.
    3. The outermost ancestor containing ``pyproject.toml``.
    4. The current working directory, as a last resort for installed
       distributions where the repository layout is not available.

    Note: every workspace sub-package (``packages/planny-core``, ...) also has a
    ``pyproject.toml``, so stopping at the *first* match would resolve to
    ``packages/planny-core`` and look for a nonexistent ``.env`` there -- which
    silently disables all configuration. That is why the workspace marker
    (``packages/``) is required and the outermost match is chosen.
    """
    override = os.environ.get(ROOT_OVERRIDE_ENV)
    if override:
        return Path(override).expanduser().resolve()

    # ``parents`` is ordered innermost -> outermost.
    candidates = [p for p in PACKAGE_ROOT.parents if (p / "pyproject.toml").is_file()]
    if not candidates:
        return Path.cwd().resolve()

    workspace_roots = [p for p in candidates if (p / "packages").is_dir()]
    if workspace_roots:
        return workspace_roots[-1]

    return candidates[-1]


#: Resolved project root, computed once at import.
PROJECT_ROOT = project_root()


def env_file() -> str:
    """Return the absolute path of the ``.env`` file.

    The path is absolute on purpose: a relative ``env_file`` makes
    configuration depend on the process working directory.
    """
    return str(PROJECT_ROOT / ".env")


def data_dir() -> Path:
    """Return the data directory (SQLite database, bootstrap cache, ...)."""
    return PROJECT_ROOT / "data"
