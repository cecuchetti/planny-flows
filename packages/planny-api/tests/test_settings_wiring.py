"""Tests for the startup wiring of the runtime settings store.

The store, the resolver and the crypto layer were all implemented and tested while
nothing called them, so a value could be saved, validated, reported as applied —
and never read by the process supposed to use it. Every test in this file exists to
keep that from happening again: they exercise the loop from a stored row to the
settings object the application reads.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from planny_core.config.bootstrap import write_bootstrap
from planny_core.config.settings import Settings
from planny_core.config.store import SettingsStore
from planny_core.database import reset_database
from planny_core.db import Base, Database

from planny_api.app.lifespan import _apply_to_process_settings, load_stored_overrides

MASTER_KEY = "wiring-master-key"


@pytest.fixture(autouse=True)
def _clean_database_cache() -> Iterator[None]:
    """The process database is cached; a leak between tests would be invisible."""
    reset_database()
    yield
    reset_database()


async def _seed(db_path: str, overrides: dict[str, object]) -> None:
    """Create the schema at *db_path* and store *overrides*."""
    settings = Settings(_env_file=None, db_type="sqlite", db_path=db_path)
    database = Database(settings)
    try:
        async with database.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with database.session() as session:
            store = SettingsStore(master_key=MASTER_KEY)
            for key, value in overrides.items():
                await store.save(session, key, value)
    finally:
        await database.dispose()


def _settings(db_path: str) -> Settings:
    return Settings(
        _env_file=None,
        env="development",
        db_type="sqlite",
        db_path=db_path,
        jwt_secret="test-secret",
        master_key=MASTER_KEY,
    )


class TestStoredOverridesReachTheProcess:
    """A row in the store must change the settings the application uses."""

    async def test_a_stored_value_is_applied(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "wired.sqlite")
        await _seed(db_path, {"sync.page_size": 42, "sync.jql": "project = VIS"})

        effective = await load_stored_overrides(_settings(db_path))

        assert effective.sync_page_size == 42
        assert effective.sync_jql == "project = VIS"

    async def test_a_secret_is_decrypted_and_applied(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "wired.sqlite")
        await _seed(db_path, {"jira.external.api_token": "stored-token"})

        effective = await load_stored_overrides(_settings(db_path))

        assert effective.external_jira_api_token == "stored-token"

    async def test_a_restart_key_is_applied_at_startup(self, tmp_path: Path) -> None:
        """That is what "restart" means: it is applied when the process starts."""
        db_path = str(tmp_path / "wired.sqlite")
        await _seed(db_path, {"jira.internal.fixed_issue_key": "OPS-1"})

        effective = await load_stored_overrides(_settings(db_path))

        assert effective.internal_jira_fixed_issue_key == "OPS-1"

    async def test_an_untouched_key_keeps_the_environment_value(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "wired.sqlite")
        await _seed(db_path, {"sync.page_size": 42})

        base = Settings(
            _env_file=None,
            db_type="sqlite",
            db_path=db_path,
            jwt_secret="from-environment",
            master_key=MASTER_KEY,
        )
        effective = await load_stored_overrides(base)

        assert effective.jwt_secret == "from-environment"

    async def test_an_empty_store_leaves_settings_alone(self, tmp_path: Path) -> None:
        db_path = str(tmp_path / "wired.sqlite")
        await _seed(db_path, {})
        base = _settings(db_path)

        effective = await load_stored_overrides(base)

        assert effective.sync_page_size == base.sync_page_size

    async def test_an_unreachable_store_does_not_stop_startup(self, tmp_path: Path) -> None:
        """Refusing to start would be worse: the settings API is how an operator
        would fix a broken stored value, and a process that cannot boot cannot
        serve it."""
        base = Settings(
            _env_file=None,
            db_type="sqlite",
            db_path=str(tmp_path / "does-not-exist-dir" / "x.sqlite"),
            jwt_secret="test-secret",
            master_key=MASTER_KEY,
        )

        effective = await load_stored_overrides(base)

        assert effective is base

    async def test_a_missing_master_key_is_reported_not_ignored(
        self, tmp_path: Path
    ) -> None:
        """Secrets are the exception to "keep going": proceeding would run with
        credentials the operator believes are configured but which are not."""
        db_path = str(tmp_path / "wired.sqlite")
        await _seed(db_path, {"database.password": "stored-secret"})

        base = Settings(
            _env_file=None,
            db_type="sqlite",
            db_path=db_path,
            jwt_secret="test-secret",
            master_key=None,
        )

        effective = await load_stored_overrides(base)

        assert effective is base, "an unreadable secret must not be silently skipped"


class TestProcessSettingsAreUpdated:
    """The application reads the process settings object at call time."""

    def test_values_are_copied_onto_the_target(self) -> None:
        target = Settings(_env_file=None, sync_page_size=100, jwt_secret="s")
        effective = Settings(_env_file=None, sync_page_size=7, jwt_secret="s")

        _apply_to_process_settings(effective, target)

        assert target.sync_page_size == 7

    def test_every_field_is_copied(self) -> None:
        """A field left behind would keep reading the environment while the API
        reported the stored value."""
        target = Settings(_env_file=None, sync_page_size=100, sync_jql="old")
        effective = Settings(_env_file=None, sync_page_size=7, sync_jql="new")

        _apply_to_process_settings(effective, target)

        assert [(target.sync_page_size, target.sync_jql)] == [(7, "new")]


class TestBootstrapCacheRoundTrip:
    """The cache records the connection that worked, so a bad value cannot lock
    the next start out."""

    async def test_the_connection_is_cached_and_resolved_back(
        self, tmp_path: Path
    ) -> None:
        cache = tmp_path / "bootstrap.json"
        settings = Settings(
            _env_file=None, db_type="sqlite", db_path="data/cached.sqlite"
        )

        write_bootstrap(settings, cache)

        from planny_core.config.bootstrap import read_bootstrap

        cached = read_bootstrap(cache)
        assert cached is not None
        assert cached.values["db_path"] == "data/cached.sqlite"

    async def test_the_cache_never_holds_the_master_key(self, tmp_path: Path) -> None:
        cache = tmp_path / "bootstrap.json"
        settings = Settings(
            _env_file=None, db_type="sqlite", db_path="data/x.sqlite", master_key="super-secret"
        )

        write_bootstrap(settings, cache)

        assert "super-secret" not in cache.read_text()
