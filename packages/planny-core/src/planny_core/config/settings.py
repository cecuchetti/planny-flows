"""Application configuration via pydantic-settings.

Reads from ``.env`` (at project root) and environment variables.
Mirrors ``api/src/config/index.ts``.
"""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from planny_core.config import paths
from planny_core.errors import InsecureConfigurationError

#: JWT secret shipped in the repository and in ``.env.example``. Using it
#: outside development would let anyone forge valid tokens.
DEV_JWT_SECRET = "jira-clone-dev-secret"

#: Environment value that enables production hardening checks.
PRODUCTION_ENV = "production"


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

    # ── Bootstrap (tier 0) ──────────────────────────────────────────────────
    # Values needed before the runtime settings store is reachable, and which
    # therefore can never come from it.
    admin_email: str | None = Field(
        default=None,
        description=(
            "Email promoted to the admin role. The settings module stays "
            "disabled while no admin exists (fail closed)."
        ),
    )
    master_key: str | None = Field(
        default=None,
        description=(
            "Key used to encrypt secrets at rest in the settings store. An "
            "environment variable for now; external key management is a "
            "tracked future feature."
        ),
    )

    # ── API ─────────────────────────────────────────────────────────────────
    api_title: str = Field(default="Planny API")
    api_version: str = Field(default="1.0.0")
    api_prefix: str = Field(
        default="/api",
        description="Root prefix for canonical versioned routes.",
    )
    api_legacy_aliases: bool = Field(
        default=True,
        description=(
            "Also mount every module at the unversioned path, outside the "
            "OpenAPI schema, so existing clients keep working. Turn off once "
            "the client has migrated to the versioned routes."
        ),
    )

    # ── Modules ─────────────────────────────────────────────────────────────
    modules_packages: list[str] = Field(
        default_factory=list,
        description=(
            "Explicit import paths exposing MODULE/MODULES. Empty by default: "
            "every domain under modules_scan_packages is discovered "
            "automatically. A merged project adds its package here (or, better, "
            "publishes a 'planny.modules' entry point)."
        ),
    )
    modules_scan_packages: list[str] = Field(
        default_factory=lambda: ["planny_api.modules"],
        description=(
            "Package roots whose sub-packages are auto-discovered. Dropping a "
            "sub-package that exposes MODULE registers a domain with no wiring."
        ),
    )
    modules_use_entry_points: bool = Field(
        default=True,
        description="Discover modules published through 'planny.modules' entry points.",
    )

    # ── Jira synchronisation ────────────────────────────────────────────────
    sync_jql: str = Field(
        default="assignee=currentUser() AND status!=Closed",
        description="JQL selecting the issues to pull into the local board.",
    )
    sync_page_size: int = Field(
        default=100,
        description="Page size for the Jira search endpoint.",
    )
    sync_interval_minutes: int = Field(
        default=15,
        description=(
            "A Jira project is re-synced once its last sync is older than this. "
            "Also the cadence at which the client refreshes, so an open board "
            "picks the changes up."
        ),
    )
    sync_default_project_category: str = Field(
        default="software",
        description="Category assigned to projects discovered through sync.",
    )
    integration_default_avatar_url: str = Field(
        default="https://secure.gravatar.com/avatar/default",
        description="Avatar used when an external user has none.",
    )

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
        # Absolute path: a relative env_file silently loses the whole
        # configuration when the process runs from another directory (H13).
        env_file=paths.env_file(),
        env_file_encoding="utf-8",
        extra="ignore",
        # Lets a field be supplied by its own name as well as its alias. The
        # resolver revalidates a settings object built from ``model_dump()``,
        # which yields field names, so without this the aliased fields (``env``)
        # would silently fall back to their defaults.
        populate_by_name=True,
    )

    # ── Startup validation ──────────────────────────────────────────────────
    def is_production(self) -> bool:
        """Return ``True`` when running with ``env == "production"``."""
        return self.env == PRODUCTION_ENV

    def uses_dev_jwt_secret(self) -> bool:
        """Return ``True`` when the JWT secret is the published dev default."""
        return self.jwt_secret == DEV_JWT_SECRET

    def jira_env(self) -> dict[str, str]:
        """Return the environment mapping used to resolve Jira instances.

        This is the bridge between the two configuration paths (finding H16):
        ``pydantic-settings`` parses ``.env`` into this object, while the Jira
        loader consumes environment-style variables. Merging both here means a
        deployment that only ships a ``.env`` file configures Jira correctly,
        instead of silently resolving to empty base URLs.

        The process environment takes precedence, matching the precedence used
        everywhere else. ``os.environ`` is read here because this is the
        configuration layer, which is the only place allowed to do so.
        """
        from_env: dict[str, str] = {
            "INTERNAL_ATLASSIAN_BASE_URL": self.internal_atlassian_base_url,
            "INTERNAL_JIRA_AUTH_TYPE": self.internal_jira_auth_type,
            "INTERNAL_JIRA_EMAIL": self.internal_jira_email or "",
            "INTERNAL_JIRA_API_TOKEN": self.internal_jira_api_token or "",
            "INTERNAL_JIRA_FIXED_ISSUE_KEY": self.internal_jira_fixed_issue_key,
            "EXTERNAL_ATLASSIAN_BASE_URL": self.external_atlassian_base_url,
            "EXTERNAL_JIRA_AUTH_TYPE": self.external_jira_auth_type,
            "EXTERNAL_JIRA_EMAIL": self.external_jira_email or "",
            "EXTERNAL_JIRA_API_TOKEN": self.external_jira_api_token or "",
            "EXTERNAL_MY_ACCOUNT_ID": self.external_my_account_id or "",
            "HTTP_CONNECT_TIMEOUT_MS": str(self.http_connect_timeout_ms),
            "HTTP_READ_TIMEOUT_MS": str(self.http_read_timeout_ms),
            "JIRA_HTTP_TIMEOUT_MS": str(self.http_connect_timeout_ms),
        }

        merged = dict(os.environ)
        for key, value in from_env.items():
            merged.setdefault(key, value)
        return merged

    def validate_for_startup(self) -> None:
        """Abort startup when the configuration is unsafe for this environment.

        Raises:
            InsecureConfigurationError: running in production with the
                development JWT secret, which would let anyone forge tokens.
        """
        if self.is_production() and self.uses_dev_jwt_secret():
            raise InsecureConfigurationError(
                "Refusing to start: env=production but JWT_SECRET is still the "
                "development default. Anyone could forge authentication tokens. "
                "Set a unique JWT_SECRET (do not commit it) and restart."
            )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings, building them on first use.

    Cached so the environment is read once. Tests that change the environment
    call ``get_settings.cache_clear()``.
    """
    return Settings()


# Singleton — import and use directly.
settings = get_settings()
