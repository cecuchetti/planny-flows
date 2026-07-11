"""Tests for planny_core.config — pydantic-settings configuration."""

from __future__ import annotations

from planny_core.config import Settings


class TestSettingsDefaults:
    """Verify default values when no env vars override them."""

    def test_server_defaults(self) -> None:
        s = Settings(port=3824, client_url="http://localhost:8192")
        assert s.port == 3824
        assert s.client_url == "http://localhost:8192"
        assert s.env == "development"  # from NODE_ENV default
        assert s.python_backend_url == "http://localhost:13824"

    def test_jwt_defaults(self) -> None:
        s = Settings()
        assert s.jwt_secret == "jira-clone-dev-secret"
        assert s.jwt_expires_in == "180 days"

    def test_db_defaults(self) -> None:
        s = Settings(db_type="postgres")
        assert s.db_type == "postgres"
        assert s.db_host == "localhost"
        assert s.db_port == 5432
        assert s.db_username == "postgres"
        assert s.db_database == "jira_clone"
        assert s.db_path == "data/jira.sqlite"

    def test_jira_defaults(self) -> None:
        s = Settings()
        assert s.internal_jira_auth_type == "basic"
        assert s.internal_jira_fixed_issue_key == "VIS-2"
        assert s.internal_jira_email is None
        assert s.external_jira_auth_type == "basic"
        assert s.external_my_account_id is None

    def test_http_timeout_defaults(self) -> None:
        s = Settings()
        assert s.http_connect_timeout_ms == 5000
        assert s.http_read_timeout_ms == 10000

    def test_quick_actions_defaults(self) -> None:
        s = Settings()
        assert s.outlook_cleaner_url == (
            "https://outlook-cleaner.fly.dev/api/v1/trigger-clean"
        )
        assert s.outlook_cleaner_api_key == ""
        assert s.quick_actions_workday_hours == 8
        assert s.quick_actions_worklog_start_time == "19:30"
        assert (
            s.quick_actions_worklog_default_description
            == "Working on issue {issueKey}"
        )
        assert s.app_default_timezone == "America/New_York"


class TestSettingsEnvOverride:
    """Verify env var overrides via constructor kwargs (simulating .env)."""

    def test_port_override(self) -> None:
        s = Settings(port=13824)
        assert s.port == 13824

    def test_db_type_override(self) -> None:
        s = Settings(db_type="sqlite")
        assert s.db_type == "sqlite"

    def test_jwt_secret_override(self) -> None:
        s = Settings(jwt_secret="custom-secret")
        assert s.jwt_secret == "custom-secret"

    def test_jira_url_override(self) -> None:
        s = Settings(
            internal_atlassian_base_url="https://my-jira.atlassian.net",
            external_atlassian_base_url="https://client-jira.atlassian.net",
        )
        assert s.internal_atlassian_base_url == "https://my-jira.atlassian.net"
        assert s.external_atlassian_base_url == "https://client-jira.atlassian.net"
