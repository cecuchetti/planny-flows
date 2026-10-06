"""Tests for the tier-0 bootstrap cache (decision: Option A).

The file exists so the database connection can be changed from the UI and still
let the application start if the new value is wrong. Because it necessarily
contains a database password, what it must *not* contain matters as much as what
it must.
"""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path

import pytest

from planny_core.config.bootstrap import (
    DATABASE_FIELDS,
    BootstrapCache,
    bootstrap_file,
    clear_bootstrap,
    read_bootstrap,
    resolve_bootstrap_settings,
    write_bootstrap,
)
from planny_core.config.settings import Settings


@pytest.fixture
def cache_path(tmp_path: Path) -> Path:
    return tmp_path / "nested" / "bootstrap.json"


@pytest.fixture
def settings() -> Settings:
    """Settings carrying secrets that must never reach the cache file."""
    return Settings(
        _env_file=None,
        db_type="postgres",
        db_host="db.internal",
        db_port=5432,
        db_username="planny",
        db_password="super-secret-password",
        db_database="planny",
        jwt_secret="jwt-secret-value",
        master_key="master-key-value",
        internal_jira_api_token="jira-token-value",
    )


class TestWriteBootstrap:
    """Writing the cache, with the permissions that make it acceptable."""

    def test_creates_the_file_and_its_directory(
        self, cache_path: Path, settings: Settings
    ) -> None:
        written = write_bootstrap(settings, cache_path)
        assert written == cache_path
        assert cache_path.is_file()

    def test_file_is_owner_readable_only(
        self, cache_path: Path, settings: Settings
    ) -> None:
        """It holds a database password; group and other must have no access."""
        write_bootstrap(settings, cache_path)
        mode = stat.S_IMODE(cache_path.stat().st_mode)
        assert mode == 0o600, f"expected 0600, got {oct(mode)}"

    def test_existing_file_is_narrowed_on_rewrite(
        self, cache_path: Path, settings: Settings
    ) -> None:
        """A pre-existing world-readable file must not keep its mode."""
        cache_path.parent.mkdir(parents=True)
        cache_path.write_text("{}", encoding="utf-8")
        cache_path.chmod(0o644)

        write_bootstrap(settings, cache_path)

        assert stat.S_IMODE(cache_path.stat().st_mode) == 0o600

    def test_stores_the_connection(self, cache_path: Path, settings: Settings) -> None:
        write_bootstrap(settings, cache_path)
        data = json.loads(cache_path.read_text(encoding="utf-8"))
        assert data["db_host"] == "db.internal"
        assert data["db_database"] == "planny"
        assert set(data) <= set(DATABASE_FIELDS)

    @pytest.mark.parametrize(
        "forbidden", ["jwt_secret", "master_key", "internal_jira_api_token"]
    )
    def test_never_writes_anything_but_the_connection(
        self, cache_path: Path, settings: Settings, forbidden: str
    ) -> None:
        write_bootstrap(settings, cache_path)
        assert forbidden not in cache_path.read_text(encoding="utf-8")

    def test_the_master_key_is_never_cached(
        self, cache_path: Path, settings: Settings
    ) -> None:
        """Caching it would defeat the point of encrypting secrets at rest.

        The key would sit beside the data it protects, so a copy of the data
        directory would be enough to decrypt everything.
        """
        write_bootstrap(settings, cache_path)
        assert settings.master_key is not None
        assert "master-key-value" not in cache_path.read_text(encoding="utf-8")


class TestReadBootstrap:
    """Reading is tolerant: the cache is a convenience, not a requirement."""

    def test_returns_none_when_absent(self, cache_path: Path) -> None:
        assert read_bootstrap(cache_path) is None

    def test_round_trips(self, cache_path: Path, settings: Settings) -> None:
        write_bootstrap(settings, cache_path)
        cached = read_bootstrap(cache_path)
        assert cached is not None
        assert cached.values["db_host"] == "db.internal"
        assert cached.values["db_password"] == "super-secret-password"

    def test_corrupt_json_is_ignored(self, cache_path: Path) -> None:
        """Refusing to start over a malformed convenience file is worse."""
        cache_path.parent.mkdir(parents=True)
        cache_path.write_text("{not json", encoding="utf-8")
        assert read_bootstrap(cache_path) is None

    def test_non_object_is_ignored(self, cache_path: Path) -> None:
        cache_path.parent.mkdir(parents=True)
        cache_path.write_text("[1, 2, 3]", encoding="utf-8")
        assert read_bootstrap(cache_path) is None

    def test_unknown_keys_are_dropped(self, cache_path: Path) -> None:
        """A file written by a future version must not break this one."""
        cache_path.parent.mkdir(parents=True)
        cache_path.write_text(
            json.dumps({"db_host": "h", "db_from_the_future": "x"}), encoding="utf-8"
        )
        cached = read_bootstrap(cache_path)
        assert cached is not None
        assert cached.values == {"db_host": "h"}

    def test_defaults_to_the_data_directory(self) -> None:
        assert bootstrap_file().name == "bootstrap.json"
        assert bootstrap_file().parent.name == "data"


class TestClearBootstrap:
    def test_removes_an_existing_file(self, cache_path: Path, settings: Settings) -> None:
        write_bootstrap(settings, cache_path)
        assert clear_bootstrap(cache_path) is True
        assert not cache_path.exists()

    def test_reports_when_there_was_nothing(self, cache_path: Path) -> None:
        assert clear_bootstrap(cache_path) is False


class TestResolveBootstrapSettings:
    """Precedence: process environment > cache > .env > default."""

    def test_cache_fills_in_when_the_environment_is_silent(
        self, cache_path: Path, settings: Settings
    ) -> None:
        write_bootstrap(settings, cache_path)
        base = Settings(_env_file=None, db_host="", db_database="")

        resolved = resolve_bootstrap_settings(base, cache_path)

        assert resolved.db_host == "db.internal"
        assert resolved.db_database == "planny"

    def test_the_process_environment_wins(
        self, cache_path: Path, settings: Settings, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """An explicit environment variable is a deliberate operator action."""
        write_bootstrap(settings, cache_path)
        monkeypatch.setenv("DB_HOST", "from-environment")
        base = Settings(_env_file=None, db_host="from-environment")

        resolved = resolve_bootstrap_settings(base, cache_path)

        assert resolved.db_host == "from-environment"
        # Fields the environment did not mention still come from the cache.
        assert resolved.db_database == "planny"

    def test_no_cache_leaves_settings_alone(self, cache_path: Path) -> None:
        base = Settings(_env_file=None, db_host="untouched")
        assert resolve_bootstrap_settings(base, cache_path) is base

    def test_unrelated_secrets_are_not_injected(
        self, cache_path: Path, settings: Settings
    ) -> None:
        """The cache must only ever affect the database connection."""
        write_bootstrap(settings, cache_path)
        base = Settings(_env_file=None, jwt_secret="original")

        resolved = resolve_bootstrap_settings(base, cache_path)

        assert resolved.jwt_secret == "original"


class TestBootstrapCache:
    """The value object itself."""

    def test_from_settings_captures_the_connection(self, settings: Settings) -> None:
        cached = BootstrapCache.from_settings(settings)
        assert set(cached.values) == set(DATABASE_FIELDS)

    def test_from_settings_captures_every_declared_field(self, settings: Settings) -> None:
        """Every field in DATABASE_FIELDS must survive the round trip.

        The connection fields are not nullable in ``Settings``, so a null can only
        arrive from a hand-edited file; that path is covered by the
        ``from_mapping`` test below.
        """
        cached = BootstrapCache.from_settings(settings)
        assert set(cached.values) == set(DATABASE_FIELDS)

    def test_as_overrides_uses_registry_keys(self, settings: Settings) -> None:
        cached = BootstrapCache.from_settings(settings)
        overrides = cached.as_overrides()
        assert overrides["database.host"] == "db.internal"
        # The field whose name differs from its key.
        assert overrides["database.name"] == "planny"

    def test_from_mapping_skips_nulls(self) -> None:
        """A null in the file means "no cached value", not "set it to null"."""
        cached = BootstrapCache.from_mapping({"db_host": None, "db_database": "app"})
        assert cached.values == {"db_database": "app"}

    def test_from_mapping_ignores_unknown_keys(self) -> None:
        cached = BootstrapCache.from_mapping({"db_host": "h", "db_future": "x"})
        assert cached.values == {"db_host": "h"}

    def test_environment_variable_names_are_declared(self) -> None:
        """The precedence check reads these, so they must be the real names."""
        assert DATABASE_FIELDS["db_username"] == "DB_USERNAME"
        assert len(set(DATABASE_FIELDS.values())) == len(DATABASE_FIELDS)

    def test_permissions_do_not_depend_on_the_umask(
        self, cache_path: Path, settings: Settings, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A permissive umask must not widen the file."""
        monkeypatch.setattr(os, "umask", lambda _: 0o000)
        write_bootstrap(settings, cache_path)
        assert stat.S_IMODE(cache_path.stat().st_mode) == 0o600
