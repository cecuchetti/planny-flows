"""Tests for Jira instance config loader."""

import os
import tempfile

import pytest

from planny_jira.config import (
    _resolve_env_vars,
    get_jira_instance_config,
    get_worklog_instance_names,
    reset_jira_instances_cache,
)


@pytest.fixture(autouse=True)
def clear_cache() -> None:
    """Clear the config cache before and after each test."""
    reset_jira_instances_cache()
    yield
    reset_jira_instances_cache()


class TestResolveEnvVars:
    """ENV var interpolation in YAML values."""

    def test_resolves_simple_var(self) -> None:
        os.environ["TEST_VAR"] = "hello"
        result = _resolve_env_vars("${TEST_VAR}")
        assert result == "hello"

    def test_resolves_empty_when_missing(self) -> None:
        result = _resolve_env_vars("${NONEXISTENT_VAR_XYZ}")
        assert result == ""

    def test_resolves_multiple_vars(self) -> None:
        os.environ["A"] = "foo"
        os.environ["B"] = "bar"
        result = _resolve_env_vars("${A}/${B}")
        assert result == "foo/bar"

    def test_ignores_non_env_braces(self) -> None:
        result = _resolve_env_vars("plain text {not_env}")
        assert result == "plain text {not_env}"

    def test_resolves_in_url(self) -> None:
        os.environ["BASE_URL"] = "https://jira.example.com"
        result = _resolve_env_vars("${BASE_URL}/rest/api/2")
        assert result == "https://jira.example.com/rest/api/2"


class TestGetJiraInstanceConfigFromEnv:
    """Fallback to env vars when YAML file not present."""

    def test_basic_config_from_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("INTERNAL_ATLASSIAN_BASE_URL", "https://internal.atlassian.net")
        monkeypatch.setenv("INTERNAL_JIRA_EMAIL", "bot@example.com")
        monkeypatch.setenv("INTERNAL_JIRA_API_TOKEN", "tok-secret")
        monkeypatch.setenv("INTERNAL_JIRA_AUTH_TYPE", "basic")
        monkeypatch.setenv("INTERNAL_JIRA_FIXED_ISSUE_KEY", "VIS-2")
        monkeypatch.setenv("INTERNAL_MY_ACCOUNT_ID", "acc-123")
        monkeypatch.setenv("INTERNAL_JIRA_TIMEOUT_MS", "10000")

        config = get_jira_instance_config("internal")

        assert config.base_url == "https://internal.atlassian.net"
        assert config.email == "bot@example.com"
        assert config.api_token == "tok-secret"
        assert config.auth_type == "basic"
        assert config.timeout_ms == 10000
        assert config.system_name == "internal-jira"
        assert config.fixed_issue_key == "VIS-2"
        assert config.my_account_id == "acc-123"

    def test_bearer_config_from_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("EXTERNAL_ATLASSIAN_BASE_URL", "https://external.example.com")
        monkeypatch.setenv("EXTERNAL_JIRA_AUTH_TYPE", "bearer")
        monkeypatch.setenv("EXTERNAL_JIRA_API_TOKEN", "bearer-token")
        monkeypatch.setenv("EXTERNAL_MY_ACCOUNT_ID", "ext-user-1")

        config = get_jira_instance_config("external")

        assert config.base_url == "https://external.example.com"
        assert config.auth_type == "bearer"
        assert config.api_token == "bearer-token"
        assert config.email is None
        assert config.my_account_id == "ext-user-1"

    def test_unknown_instance_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("INTERNAL_ATLASSIAN_BASE_URL", "https://jira.example.com")
        monkeypatch.delenv("EXTERNAL_ATLASSIAN_BASE_URL", raising=False)

        with pytest.raises(ValueError, match="Unknown Jira instance: nonexistent"):
            get_jira_instance_config("nonexistent")

    def test_worklog_names_default_from_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("INTERNAL_ATLASSIAN_BASE_URL", "https://jira.internal.com")
        monkeypatch.setenv("EXTERNAL_ATLASSIAN_BASE_URL", "https://jira.external.com")

        names = get_worklog_instance_names()
        assert names == {"internal": "internal", "external": "external"}

    def test_worklog_names_from_env_override(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("INTERNAL_ATLASSIAN_BASE_URL", "https://jira.internal.com")
        monkeypatch.setenv("EXTERNAL_ATLASSIAN_BASE_URL", "https://jira.external.com")
        monkeypatch.setenv("WORKLOG_INTERNAL_INSTANCE", "custom-internal")
        monkeypatch.setenv("WORKLOG_EXTERNAL_INSTANCE", "custom-external")

        names = get_worklog_instance_names()
        assert names["internal"] == "custom-internal"
        assert names["external"] == "custom-external"


class TestGetJiraInstanceConfigFromYaml:
    """Loading config from YAML file."""

    def test_config_from_yaml(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("INTERNAL_JIRA_EMAIL", "bot@internal.com")
        monkeypatch.setenv("INTERNAL_JIRA_API_TOKEN", "tok-internal")
        monkeypatch.setenv("EXTERNAL_JIRA_EMAIL", "user@external.com")
        monkeypatch.setenv("EXTERNAL_JIRA_API_TOKEN", "tok-external")
        monkeypatch.setenv("INTERNAL_ATLASSIAN_BASE_URL", "https://internal.atlassian.net")
        monkeypatch.setenv("EXTERNAL_ATLASSIAN_BASE_URL", "https://external.example.com")
        monkeypatch.setenv("EXTERNAL_MY_ACCOUNT_ID", "acc-ext")

        yaml_content = """
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
"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False, encoding="utf-8"
        ) as f:
            f.write(yaml_content)
            yaml_path = f.name

        monkeypatch.setenv("JIRA_INSTANCES_CONFIG_PATH", yaml_path)

        try:
            internal = get_jira_instance_config("internal")
            assert internal.base_url == "https://internal.atlassian.net"
            assert internal.email == "bot@internal.com"
            assert internal.api_token == "tok-internal"
            assert internal.auth_type == "basic"
            assert internal.system_name == "internal-jira"
            assert internal.fixed_issue_key == "VIS-2"
            assert internal.my_account_id is None

            external = get_jira_instance_config("external")
            assert external.base_url == "https://external.example.com"
            assert external.email == "user@external.com"
            assert external.api_token == "tok-external"
            assert external.system_name == "external-jira"
            assert external.my_account_id == "acc-ext"
        finally:
            os.unlink(yaml_path)

    def test_missing_yaml_file_falls_back_to_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """When YAML file doesn't exist and no env override path, fall back to env."""
        monkeypatch.delenv("JIRA_INSTANCES_CONFIG_PATH", raising=False)
        monkeypatch.setenv("INTERNAL_ATLASSIAN_BASE_URL", "https://fallback.internal.com")
        monkeypatch.setenv("EXTERNAL_ATLASSIAN_BASE_URL", "https://fallback.external.com")
        monkeypatch.setenv("INTERNAL_JIRA_EMAIL", "fallback@test.com")

        config = get_jira_instance_config("internal")
        assert config.base_url == "https://fallback.internal.com"
        assert config.email == "fallback@test.com"

    def test_yaml_env_var_interpolation(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """YAML values with ${VAR} placeholders are resolved."""
        monkeypatch.setenv("MY_BASE_URL", "https://resolved.example.com")
        monkeypatch.setenv("PREFIX_JIRA_EMAIL", "resolved@test.com")
        monkeypatch.setenv("PREFIX_JIRA_API_TOKEN", "resolved-token")

        yaml_content = """
instances:
  - name: test-instance
    atlassianBaseUrl: ${MY_BASE_URL}
    authType: basic
    envPrefix: PREFIX_
"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False, encoding="utf-8"
        ) as f:
            f.write(yaml_content)
            yaml_path = f.name

        monkeypatch.setenv("JIRA_INSTANCES_CONFIG_PATH", yaml_path)

        try:
            config = get_jira_instance_config("test-instance")
            assert config.base_url == "https://resolved.example.com"
            assert config.email == "resolved@test.com"
            assert config.api_token == "resolved-token"
        finally:
            os.unlink(yaml_path)

    def test_worklog_names_from_yaml(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("INTERNAL_JIRA_EMAIL", "bot@test.com")
        monkeypatch.setenv("INTERNAL_JIRA_API_TOKEN", "tok")
        monkeypatch.setenv("EXTERNAL_JIRA_EMAIL", "user@test.com")
        monkeypatch.setenv("EXTERNAL_JIRA_API_TOKEN", "tok2")
        monkeypatch.setenv("INTERNAL_ATLASSIAN_BASE_URL", "https://internal.com")
        monkeypatch.setenv("EXTERNAL_ATLASSIAN_BASE_URL", "https://external.com")

        yaml_content = """
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
"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False, encoding="utf-8"
        ) as f:
            f.write(yaml_content)
            yaml_path = f.name

        monkeypatch.setenv("JIRA_INSTANCES_CONFIG_PATH", yaml_path)

        try:
            names = get_worklog_instance_names()
            assert names["internal"] == "custom-internal-name"
            assert names["external"] == "custom-external-name"
        finally:
            os.unlink(yaml_path)


class TestGetWorklogInstanceNames:
    """Worklog instance names."""

    def test_returns_dict_with_expected_keys(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("INTERNAL_ATLASSIAN_BASE_URL", "https://jira.internal.com")
        monkeypatch.setenv("EXTERNAL_ATLASSIAN_BASE_URL", "https://jira.external.com")

        names = get_worklog_instance_names()
        assert "internal" in names
        assert "external" in names
        assert isinstance(names, dict)
