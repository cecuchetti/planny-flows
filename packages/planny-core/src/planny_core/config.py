"""Application configuration via pydantic-settings.

Reads from ``.env`` (at project root) and environment variables.
Mirrors ``api/src/config/index.ts``.
"""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed settings loaded from ``.env`` / env vars.

    Every field maps to an uppercase env var (e.g. ``port`` -> ``PORT``).
    """

    # ── Server ──────────────────────────────────────────────────────────────
    port: int = Field(default=3824, description="Backend server port")
    client_url: str = Field(default="http://localhost:8192")
    env: str = Field(default="development", alias="NODE_ENV")
    python_backend_url: str = Field(
        default="http://localhost:13824",
        description="Internal Python backend URL (for Node proxy)",
    )

    # ── JWT ─────────────────────────────────────────────────────────────────
    jwt_secret: str = Field(default="jira-clone-dev-secret")
    jwt_expires_in: str = Field(default="180 days")

    # ── Database ────────────────────────────────────────────────────────────
    db_type: str = Field(default="postgres")
    db_host: str = Field(default="localhost")
    db_port: int = Field(default=5432)
    db_username: str = Field(default="postgres")
    db_password: str = Field(default="")
    db_database: str = Field(default="jira_clone")
    db_path: str = Field(default="data/jira.sqlite")

    # ── Jira – Internal (Tempo) ─────────────────────────────────────────────
    internal_atlassian_base_url: str = Field(default="")
    internal_jira_auth_type: str = Field(default="basic")
    internal_jira_email: str | None = Field(default=None)
    internal_jira_api_token: str | None = Field(default=None)
    internal_jira_fixed_issue_key: str = Field(default="VIS-2")

    # ── Jira – External (Client) ────────────────────────────────────────────
    external_atlassian_base_url: str = Field(default="")
    external_jira_auth_type: str = Field(default="basic")
    external_jira_email: str | None = Field(default=None)
    external_jira_api_token: str | None = Field(default=None)
    external_my_account_id: str | None = Field(default=None)

    # ── HTTP timeouts ───────────────────────────────────────────────────────
    http_connect_timeout_ms: int = Field(default=5000)
    http_read_timeout_ms: int = Field(default=10000)

    # ── Quick Actions — Outlook Cleaner ─────────────────────────────────────
    outlook_cleaner_url: str = Field(
        default="https://outlook-cleaner.fly.dev/api/v1/trigger-clean"
    )
    outlook_cleaner_api_key: str = Field(default="")

    # ── Quick Actions — Worklogs ────────────────────────────────────────────
    app_default_timezone: str = Field(default="America/New_York")
    quick_actions_workday_hours: int = Field(default=8)
    quick_actions_worklog_start_time: str = Field(default="19:30")
    quick_actions_worklog_default_description: str = Field(
        default="Working on issue {issueKey}"
    )

    # ── CORS ─────────────────────────────────────────────────────────────────
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:8192",
            "http://localhost:8193",
            "http://localhost:8080",
            "http://localhost:13824",
            "http://127.0.0.1:8192",
            "http://127.0.0.1:8193",
            "http://127.0.0.1:8080",
            "http://127.0.0.1:13824",
        ],
        description="Allowed CORS origins (static list).",
    )
    cors_origin_regex: str | None = Field(
        default=(
            r"^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}"
            r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
            r"|[\w-]+\.local):(8192|8193|8080|13824)$"
        ),
        description="Regex pattern for dynamic CORS origins (LAN / .local).",
    )

    # ── Settings config ─────────────────────────────────────────────────────
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Singleton — import and use directly.
settings = Settings()
