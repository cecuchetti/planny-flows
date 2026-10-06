"""The configuration package must import cleanly in any order.

This is not a theoretical concern. ``planny_core.db`` reaches back into
``planny_core.config`` for ``Settings``, while ``planny_core.config`` imports
modules that need ``planny_core.models`` — which needs ``planny_core.db``. Which
side wins the race depends on which module the process imported first, so a cycle
here is invisible to the rest of the suite (every other test imports the same
thing first) and only breaks for whichever entry point happens to differ.

Each case therefore runs in a **fresh interpreter**. Asserting it in-process would
pass trivially, because the modules are already in ``sys.modules``.
"""

from __future__ import annotations

import subprocess
import sys

import pytest

#: Entry points, each of which must survive being imported first.
FIRST_IMPORTS = [
    "from planny_core.config import Settings, settings",
    "from planny_core.config.store import SettingsStore, resolve_stored_settings",
    "from planny_core.config.keys import SETTINGS",
    "from planny_core.config.bootstrap import bootstrap_file",
    "from planny_core.config.crypto import encrypt",
    "import planny_core.db",
    "import planny_core.models",
    "import planny_core.database",
    "import planny_api.main",
    "import planny_jira.client",
]


@pytest.mark.parametrize("statement", FIRST_IMPORTS)
def test_imports_first_without_a_cycle(statement: str) -> None:
    result = subprocess.run(
        [sys.executable, "-c", statement],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, (
        f"`{statement}` failed when imported first:\n{result.stderr}"
    )


def test_the_settings_name_is_available_from_the_package() -> None:
    """The public import path documented in AGENTS.md."""
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from planny_core.config import Settings; "
            "assert Settings is not None; print('ok')",
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert "ok" in result.stdout


def test_a_cycle_would_be_reported() -> None:
    """Guard the guard: the subprocess check must be able to fail."""
    result = subprocess.run(
        [sys.executable, "-c", "import planny_core.this_module_does_not_exist"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode != 0
    assert "ModuleNotFoundError" in result.stderr
