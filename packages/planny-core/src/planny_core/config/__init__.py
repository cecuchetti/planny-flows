"""Configuration layer.

The only place in the project allowed to read the process environment. Import
from here::

    from planny_core.config import Settings, settings

Contents:

* :mod:`~planny_core.config.settings` — the typed settings object, which resolves
  the environment and ``.env`` tiers.
* :mod:`~planny_core.config.keys` — the declarative registry of keys that the
  runtime settings store may override, with the metadata that drives the API and
  the UI.
* :mod:`~planny_core.config.resolver` — applies overrides on top of settings.
* :mod:`~planny_core.config.bootstrap` — the tier-0 values needed before the
  runtime store is reachable.
* :mod:`~planny_core.config.crypto` — encryption for stored secrets.
* :mod:`~planny_core.config.paths` — repository path resolution, independent of
  the working directory.
* :mod:`~planny_core.config.store` — the runtime store. See below: it is
  deliberately **not** re-exported here.

Why the store is imported from its own module
---------------------------------------------

The store needs ``planny_core.models``, which reaches back into this package via
``planny_core.db`` (``from planny_core.config import Settings``). Importing it
eagerly made the cycle resolve in whatever order the interpreter happened to take,
so ``from planny_core.config import Settings`` failed whenever ``store`` won the
race. Import it directly::

    from planny_core.config.store import SettingsStore, resolve_stored_settings
"""

from __future__ import annotations

from planny_core.config.bootstrap import (
    BootstrapCache,
    bootstrap_file,
    clear_bootstrap,
    read_bootstrap,
    resolve_bootstrap_settings,
    write_bootstrap,
)
from planny_core.config.keys import (
    SETTINGS,
    ApplyMode,
    SettingKey,
    SettingType,
    Tier,
    bootstrap_keys,
    key_by_name,
    runtime_keys,
)
from planny_core.config.resolver import apply_overrides

# `settings` is imported first, deliberately. The rest of the project reaches the
# configuration through `from planny_core.config import Settings`, and that name
# only exists on this package once the line below has run. Everything that follows
# may therefore import it safely.
from planny_core.config.settings import (
    DEV_JWT_SECRET,
    PRODUCTION_ENV,
    Settings,
    get_settings,
    settings,
)

__all__ = [
    "DEV_JWT_SECRET",
    "PRODUCTION_ENV",
    "SETTINGS",
    "ApplyMode",
    "BootstrapCache",
    "SettingKey",
    "SettingType",
    "Settings",
    "Tier",
    "apply_overrides",
    "bootstrap_file",
    "bootstrap_keys",
    "clear_bootstrap",
    "get_settings",
    "key_by_name",
    "read_bootstrap",
    "resolve_bootstrap_settings",
    "runtime_keys",
    "settings",
    "write_bootstrap",
]
