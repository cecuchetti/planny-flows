"""Tests for the configuration key registry and the layered resolver."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from planny_core.config.keys import (
    SETTINGS,
    ApplyMode,
    SettingType,
    bootstrap_keys,
    key_by_name,
    key_by_settings_field,
    runtime_keys,
)
from planny_core.config.resolver import apply_overrides, overrides_from_fields
from planny_core.config.settings import Settings
from planny_core.errors import InvalidConfigurationError


@pytest.fixture
def base() -> Settings:
    """A settings object with no environment or .env influence."""
    return Settings(_env_file=None, env="development", jwt_secret="test-secret")


class TestRegistry:
    """The registry is the single source of truth for configuration keys."""

    def test_key_names_are_unique(self) -> None:
        names = [entry.key for entry in SETTINGS]
        assert len(names) == len(set(names))

    def test_settings_fields_are_unique(self) -> None:
        """Two keys pointing at one attribute would fight over it."""
        fields = [entry.settings_field for entry in SETTINGS]
        assert len(fields) == len(set(fields))

    def test_every_key_maps_to_a_real_settings_field(self) -> None:
        """A typo here would be a setting that silently does nothing."""
        available = set(Settings.model_fields)
        unknown = [
            entry.key for entry in SETTINGS if entry.settings_field not in available
        ]
        assert not unknown, f"registry keys point at nonexistent fields: {unknown}"

    def test_tiers_partition_the_registry(self) -> None:
        assert len(runtime_keys()) + len(bootstrap_keys()) == len(SETTINGS)

    def test_bootstrap_keys_are_the_ones_needed_before_the_store(self) -> None:
        assert {entry.key for entry in bootstrap_keys()} == {
            "bootstrap.admin_email",
            "bootstrap.master_key",
        }

    def test_bootstrap_keys_are_not_stored(self) -> None:
        assert all(not entry.is_stored for entry in bootstrap_keys())

    def test_runtime_keys_are_stored(self) -> None:
        assert all(entry.is_stored for entry in runtime_keys())

    def test_secrets_are_typed_as_secrets(self) -> None:
        secrets = {entry.key for entry in SETTINGS if entry.is_secret}
        assert secrets == {
            "auth.jwt_secret",
            "bootstrap.master_key",
            "database.password",
            "jira.external.api_token",
            "jira.internal.api_token",
            "quick_actions.outlook_cleaner_api_key",
        }

    def test_connection_changes_require_a_restart(self) -> None:
        """The engine cannot be rebuilt around a live session pool."""
        database = [entry for entry in SETTINGS if entry.group == "Database"]
        assert database
        assert all(entry.apply is ApplyMode.RESTART for entry in database)

    def test_rotating_the_jwt_secret_requires_a_restart(self) -> None:
        assert key_by_name("auth.jwt_secret").apply is ApplyMode.RESTART

    def test_lookup_by_name(self) -> None:
        assert key_by_name("database.host").settings_field == "db_host"

    def test_lookup_by_unknown_name_raises(self) -> None:
        with pytest.raises(KeyError):
            key_by_name("nope")

    def test_lookup_by_settings_field(self) -> None:
        entry = key_by_settings_field("db_password")
        assert entry is not None
        assert entry.key == "database.password"

    def test_lookup_by_unknown_field_returns_none(self) -> None:
        assert key_by_settings_field("nope") is None

    def test_groups_are_stable(self) -> None:
        """Groups drive the UI sections, so a stray value creates a stray tab."""
        assert {entry.group for entry in SETTINGS} == {
            "Authentication",
            "Bootstrap",
            "Database",
            "Integrations",
            "Jira",
            "Quick actions",
            "Sync",
        }

    def test_enum_keys_declare_their_choices(self) -> None:
        for entry in SETTINGS:
            if entry.type is SettingType.ENUM:
                assert entry.choices, f"{entry.key} is an enum without choices"


class TestApplyOverrides:
    """Overrides are applied on top of resolved settings, then revalidated."""

    def test_applies_by_registry_key(self, base: Settings) -> None:
        result = apply_overrides(base, {"database.host": "db.internal"})
        assert result.db_host == "db.internal"

    def test_coerces_types(self, base: Settings) -> None:
        result = apply_overrides(base, {"database.port": "6543"})
        assert result.db_port == 6543

    def test_applies_several_at_once(self, base: Settings) -> None:
        result = apply_overrides(
            base,
            {"database.host": "h", "database.name": "n", "jira.external.base_url": "https://j"},
        )
        assert (result.db_host, result.db_database, result.external_atlassian_base_url) == (
            "h",
            "n",
            "https://j",
        )

    def test_empty_overrides_returns_the_same_object(self, base: Settings) -> None:
        """No copy when there is nothing to apply."""
        assert apply_overrides(base, {}) is base

    def test_does_not_mutate_the_base(self, base: Settings) -> None:
        apply_overrides(base, {"database.host": "changed"})
        assert base.db_host != "changed"

    def test_leaves_unrelated_fields_untouched(self, base: Settings) -> None:
        result = apply_overrides(base, {"database.host": "h"})
        assert result.env == base.env
        assert result.jwt_secret == base.jwt_secret

    def test_unknown_key_is_rejected(self, base: Settings) -> None:
        """Fail loudly instead of writing an attribute nothing reads."""
        with pytest.raises(KeyError):
            apply_overrides(base, {"database.typo": 1})

    def test_null_is_rejected(self, base: Settings) -> None:
        with pytest.raises(InvalidConfigurationError):
            apply_overrides(base, {"database.host": None})

    def test_value_outside_the_choices_is_rejected(self, base: Settings) -> None:
        with pytest.raises(InvalidConfigurationError) as excinfo:
            apply_overrides(base, {"database.type": "mysql"})
        assert "postgres" in str(excinfo.value)

    def test_invalid_type_is_rejected_by_validation(self, base: Settings) -> None:
        """A non-numeric port must not reach the engine builder."""
        with pytest.raises(ValidationError):
            apply_overrides(base, {"database.port": "not-a-number"})

    def test_validation_error_does_not_leak_a_partially_applied_object(
        self, base: Settings
    ) -> None:
        with pytest.raises(ValidationError):
            apply_overrides(base, {"database.host": "h", "database.port": "bad"})
        assert base.db_host != "h"


class TestOverridesFromFields:
    """Translating stored field names back into registry keys."""

    def test_translates_known_fields(self) -> None:
        assert overrides_from_fields({"db_host": "h"}) == {"database.host": "h"}

    def test_maps_the_field_whose_name_differs_from_its_key(self) -> None:
        """`db_database` is `database.name`; the translation is not mechanical."""
        assert overrides_from_fields({"db_database": "app"}) == {"database.name": "app"}

    def test_drops_nulls(self) -> None:
        assert overrides_from_fields({"db_host": None}) == {}

    def test_drops_unknown_fields(self) -> None:
        """The cache is a file on disk and may predate the current registry."""
        assert overrides_from_fields({"from_a_future_version": "x"}) == {}
