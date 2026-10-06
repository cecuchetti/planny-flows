"""Tests for the Jira instance configuration loader.

The loader takes the environment as an explicit mapping, so these tests are
hermetic: they never mutate the process environment and never depend on the
machine's configuration.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from planny_jira.config import (
    _resolve_env_vars,
    get_jira_instance_config,
    get_worklog_instance_names,
    load_jira_instances,
)


class TestResolveEnvVars:
    """``${VAR}`` interpolation in YAML values."""

    def test_resolves_simple_var(self) -> None:
        assert _resolve_env_vars("${TEST_VAR}", {"TEST_VAR": "hello"}) == "hello"

    def test_resolves_empty_when_missing(self) -> None:
        assert _resolve_env_vars("${MISSING}", {}) == ""

    def test_resolves_multiple_vars(self) -> None:
        env = {"A": "foo", "B": "bar"}
        assert _resolve_env_vars("${A}/${B}", env) == "foo/bar"

    def test_ignores_non_env_braces(self) -> None:
        assert _resolve_env_vars("plain text {not_env}", {}) == "plain text {not_env}"

    def test_resolves_in_url(self) -> None:
        env = {"BASE_URL": "https://jira.example.com"}
        assert _resolve_env_vars("${BASE_URL}/rest/api/2", env) == (
            "https://jira.example.com/rest/api/2"
        )


class TestFromEnvironment:
    """Fallback to environment-style variables when no YAML file is present."""

    def test_basic_config(self) -> None:
        env = {
            "INTERNAL_ATLASSIAN_BASE_URL": "https://internal.atlassian.net",
            "INTERNAL_JIRA_EMAIL": "bot@example.com",
            "INTERNAL_JIRA_API_TOKEN": "tok-secret",
            "INTERNAL_JIRA_AUTH_TYPE": "basic",
            "INTERNAL_JIRA_FIXED_ISSUE_KEY": "VIS-2",
            "INTERNAL_MY_ACCOUNT_ID": "acc-123",
            "INTERNAL_JIRA_TIMEOUT_MS": "10000",
        }

        config = get_jira_instance_config("internal", env)

        assert config.base_url == "https://internal.atlassian.net"
        assert config.email == "bot@example.com"
        assert config.api_token == "tok-secret"
        assert config.auth_type == "basic"
        assert config.timeout_ms == 10000
        assert config.system_name == "internal-jira"
        assert config.fixed_issue_key == "VIS-2"
        assert config.my_account_id == "acc-123"

    def test_bearer_config(self) -> None:
        env = {
            "EXTERNAL_ATLASSIAN_BASE_URL": "https://external.example.com",
            "EXTERNAL_JIRA_AUTH_TYPE": "bearer",
            "EXTERNAL_JIRA_API_TOKEN": "bearer-token",
            "EXTERNAL_MY_ACCOUNT_ID": "ext-user-1",
        }

        config = get_jira_instance_config("external", env)

        assert config.base_url == "https://external.example.com"
        assert config.auth_type == "bearer"
        assert config.api_token == "bearer-token"
        assert config.email is None
        assert config.my_account_id == "ext-user-1"

    def test_unknown_instance_raises(self) -> None:
        env = {"INTERNAL_ATLASSIAN_BASE_URL": "https://jira.example.com"}
        with pytest.raises(ValueError, match="Unknown Jira instance: nonexistent"):
            get_jira_instance_config("nonexistent", env)

    def test_empty_environment_still_yields_empty_instances(self) -> None:
        """Both instance names resolve, but with empty values.

        This is what made the old ``require_jira_config`` gate useless: the name
        resolved, so the route gate passed while the base URL was empty.
        """
        instances, _ = load_jira_instances({})
        assert set(instances) == {"internal", "external"}
        assert all(cfg.base_url == "" for cfg in instances.values())

    def test_worklog_names_default(self) -> None:
        env = {
            "INTERNAL_ATLASSIAN_BASE_URL": "https://jira.internal.com",
            "EXTERNAL_ATLASSIAN_BASE_URL": "https://jira.external.com",
        }
        assert get_worklog_instance_names(env) == {"internal": "internal", "external": "external"}

    def test_worklog_names_override(self) -> None:
        env = {
            "INTERNAL_ATLASSIAN_BASE_URL": "https://jira.internal.com",
            "EXTERNAL_ATLASSIAN_BASE_URL": "https://jira.external.com",
            "WORKLOG_INTERNAL_INSTANCE": "custom-internal",
            "WORKLOG_EXTERNAL_INSTANCE": "custom-external",
        }
        names = get_worklog_instance_names(env)
        assert names["internal"] == "custom-internal"
        assert names["external"] == "custom-external"


class TestFromYaml:
    """Loading configuration from a YAML file."""

    @staticmethod
    def _write(tmp_path: Path, content: str) -> str:
        path = tmp_path / "jira-instances.yaml"
        path.write_text(content, encoding="utf-8")
        return str(path)

    def test_config_from_yaml(self, tmp_path: Path) -> None:
        yaml_path = self._write(
            tmp_path,
            """
worklog:
  internalInstance: internal
  externalInstance: external

instances:
  - name: internal
    atlassianBaseUrl: ${INTERNAL_ATLASSIAN_BASE_URL}
    authType: basic
    envPrefix: INTERNAL_
    fixedIssueKey: VIS-2
  - name: external
    atlassianBaseUrl: ${EXTERNAL_ATLASSIAN_BASE_URL}
    authType: basic
    envPrefix: EXTERNAL_
    myAccountId: ${EXTERNAL_MY_ACCOUNT_ID}
""",
        )
        env = {
            "JIRA_INSTANCES_CONFIG_PATH": yaml_path,
            "INTERNAL_JIRA_EMAIL": "bot@internal.com",
            "INTERNAL_JIRA_API_TOKEN": "tok-internal",
            "EXTERNAL_JIRA_EMAIL": "user@external.com",
            "EXTERNAL_JIRA_API_TOKEN": "tok-external",
            "INTERNAL_ATLASSIAN_BASE_URL": "https://internal.atlassian.net",
            "EXTERNAL_ATLASSIAN_BASE_URL": "https://external.example.com",
            "EXTERNAL_MY_ACCOUNT_ID": "acc-ext",
        }

        internal = get_jira_instance_config("internal", env)
        assert internal.base_url == "https://internal.atlassian.net"
        assert internal.email == "bot@internal.com"
        assert internal.api_token == "tok-internal"
        assert internal.auth_type == "basic"
        assert internal.system_name == "internal-jira"
        assert internal.fixed_issue_key == "VIS-2"
        assert internal.my_account_id is None

        external = get_jira_instance_config("external", env)
        assert external.base_url == "https://external.example.com"
        assert external.email == "user@external.com"
        assert external.api_token == "tok-external"
        assert external.system_name == "external-jira"
        assert external.my_account_id == "acc-ext"

    def test_missing_yaml_file_falls_back_to_env(self, tmp_path: Path) -> None:
        env = {
            "JIRA_INSTANCES_CONFIG_PATH": str(tmp_path / "does-not-exist.yaml"),
            "INTERNAL_ATLASSIAN_BASE_URL": "https://fallback.internal.com",
            "EXTERNAL_ATLASSIAN_BASE_URL": "https://fallback.external.com",
            "INTERNAL_JIRA_EMAIL": "fallback@test.com",
        }

        config = get_jira_instance_config("internal", env)
        assert config.base_url == "https://fallback.internal.com"
        assert config.email == "fallback@test.com"

    def test_yaml_env_var_interpolation(self, tmp_path: Path) -> None:
        yaml_path = self._write(
            tmp_path,
            """
instances:
  - name: test-instance
    atlassianBaseUrl: ${MY_BASE_URL}
    authType: basic
    envPrefix: PREFIX_
""",
        )
        env = {
            "JIRA_INSTANCES_CONFIG_PATH": yaml_path,
            "MY_BASE_URL": "https://resolved.example.com",
            "PREFIX_JIRA_EMAIL": "resolved@test.com",
            "PREFIX_JIRA_API_TOKEN": "resolved-token",
        }

        config = get_jira_instance_config("test-instance", env)
        assert config.base_url == "https://resolved.example.com"
        assert config.email == "resolved@test.com"
        assert config.api_token == "resolved-token"

    def test_worklog_names_from_yaml(self, tmp_path: Path) -> None:
        yaml_path = self._write(
            tmp_path,
            """
worklog:
  internalInstance: custom-internal-name
  externalInstance: custom-external-name

instances:
  - name: custom-internal-name
    atlassianBaseUrl: ${INTERNAL_ATLASSIAN_BASE_URL}
    authType: basic
    envPrefix: INTERNAL_
  - name: custom-external-name
    atlassianBaseUrl: ${EXTERNAL_ATLASSIAN_BASE_URL}
    authType: basic
    envPrefix: EXTERNAL_
""",
        )
        env = {
            "JIRA_INSTANCES_CONFIG_PATH": yaml_path,
            "INTERNAL_ATLASSIAN_BASE_URL": "https://internal.com",
            "EXTERNAL_ATLASSIAN_BASE_URL": "https://external.com",
        }

        names = get_worklog_instance_names(env)
        assert names["internal"] == "custom-internal-name"
        assert names["external"] == "custom-external-name"


class TestWorklogInstanceNames:
    """Shape of the worklog routing mapping."""

    def test_returns_dict_with_expected_keys(self) -> None:
        env = {
            "INTERNAL_ATLASSIAN_BASE_URL": "https://jira.internal.com",
            "EXTERNAL_ATLASSIAN_BASE_URL": "https://jira.external.com",
        }
        names = get_worklog_instance_names(env)
        assert isinstance(names, dict)
        assert "internal" in names
        assert "external" in names
