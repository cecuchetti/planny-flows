"""Declarative registry of configuration keys.

One entry per key drives everything: layered resolution, validation, the settings
API and the client form. Adding a setting is one entry here, not a change in six
places.

Two tiers exist because of a bootstrap paradox: reading the runtime store requires
a database connection, and that connection is itself a setting.

* **Bootstrap (tier 0)** — needed *before* the store is reachable, and therefore
  never stored. Comes from process environment, then the bootstrap cache file,
  then ``.env``.
* **Runtime (tier 1)** — stored and editable. Resolves as
  ``database > process env > .env > default``.

``settings_field`` links a registry key to the attribute on
:class:`~planny_core.config.settings.Settings`, which is what lets the resolver
apply an override without a second mapping table.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

__all__ = [
    "ApplyMode",
    "SETTINGS",
    "SettingKey",
    "SettingType",
    "Tier",
    "bootstrap_keys",
    "key_by_name",
    "key_by_settings_field",
    "runtime_keys",
]


class Tier(StrEnum):
    """Where a key's value may come from."""

    BOOTSTRAP = "bootstrap"
    RUNTIME = "runtime"


class ApplyMode(StrEnum):
    """When a changed value takes effect."""

    LIVE = "live"
    """The affected resource is rebuilt immediately."""

    RESTART = "restart"
    """Persisted now, applied on the next start."""


class SettingType(StrEnum):
    """Value type, which selects validation and the UI widget."""

    STRING = "string"
    SECRET = "secret"
    INTEGER = "integer"
    BOOLEAN = "boolean"
    URL = "url"
    ENUM = "enum"


@dataclass(frozen=True, slots=True)
class SettingKey:
    """Metadata and resolution rules for one configuration key."""

    key: str
    """Dotted identifier, e.g. ``jira.external.base_url``."""

    settings_field: str
    """Attribute on :class:`Settings` that holds the value."""

    type: SettingType
    tier: Tier
    group: str
    label: str
    default: object = None
    help: str = ""
    apply: ApplyMode = ApplyMode.LIVE
    choices: tuple[str, ...] = ()
    env_aliases: tuple[str, ...] = ()
    """Legacy flat environment variable names, for documentation and migration."""

    @property
    def is_secret(self) -> bool:
        """Whether the value must be encrypted at rest and never returned."""
        return self.type is SettingType.SECRET

    @property
    def is_stored(self) -> bool:
        """Whether the runtime store may hold this key."""
        return self.tier is Tier.RUNTIME


def _runtime(
    key: str,
    settings_field: str,
    type_: SettingType,
    group: str,
    label: str,
    *,
    default: object = None,
    env_aliases: tuple[str, ...] = (),
    apply: ApplyMode = ApplyMode.LIVE,
    help: str = "",
    choices: tuple[str, ...] = (),
) -> SettingKey:
    return SettingKey(
        key=key,
        settings_field=settings_field,
        type=type_,
        tier=Tier.RUNTIME,
        group=group,
        label=label,
        default=default,
        env_aliases=env_aliases,
        apply=apply,
        help=help,
        choices=choices,
    )


#: Every configuration key the application knows about.
SETTINGS: tuple[SettingKey, ...] = (
    # ── Bootstrap (tier 0) ───────────────────────────────────────────────────
    SettingKey(
        key="bootstrap.admin_email",
        settings_field="admin_email",
        type=SettingType.STRING,
        tier=Tier.BOOTSTRAP,
        group="Bootstrap",
        label="Administrator email",
        env_aliases=("ADMIN_EMAIL",),
        help=(
            "Promoted to the admin role on first authentication. While no email "
            "is configured the settings module is not mounted."
        ),
    ),
    SettingKey(
        key="bootstrap.master_key",
        settings_field="master_key",
        type=SettingType.SECRET,
        tier=Tier.BOOTSTRAP,
        group="Bootstrap",
        label="Master encryption key",
        env_aliases=("MASTER_KEY",),
        help=(
            "Encrypts secrets at rest in the settings store. Must come from the "
            "environment and can never be stored in the database. External key "
            "management is a tracked future feature."
        ),
    ),
    # ── Authentication ───────────────────────────────────────────────────────
    SettingKey(
        key="auth.jwt_secret",
        settings_field="jwt_secret",
        type=SettingType.SECRET,
        tier=Tier.RUNTIME,
        group="Authentication",
        label="JWT signing secret",
        env_aliases=("JWT_SECRET",),
        # Rotating it invalidates every issued token, so the new value must not
        # reach a running process: users re-authenticate once after a restart.
        apply=ApplyMode.RESTART,
        help="Signing key for issued tokens. Changing it logs every user out.",
    ),
    _runtime(
        "auth.jwt_expires_in",
        "jwt_expires_in",
        SettingType.STRING,
        "Authentication",
        "Token lifetime",
        default="180 days",
        env_aliases=("JWT_EXPIRES_IN",),
    ),
    # ── Database ─────────────────────────────────────────────────────────────
    SettingKey(
        key="database.type",
        settings_field="db_type",
        type=SettingType.ENUM,
        tier=Tier.RUNTIME,
        group="Database",
        label="Engine",
        default="postgres",
        choices=("postgres", "sqlite"),
        env_aliases=("DB_TYPE",),
        apply=ApplyMode.RESTART,
    ),
    SettingKey(
        key="database.host",
        settings_field="db_host",
        type=SettingType.STRING,
        tier=Tier.RUNTIME,
        group="Database",
        label="Host",
        env_aliases=("DB_HOST",),
        apply=ApplyMode.RESTART,
    ),
    SettingKey(
        key="database.port",
        settings_field="db_port",
        type=SettingType.INTEGER,
        tier=Tier.RUNTIME,
        group="Database",
        label="Port",
        default=5432,
        env_aliases=("DB_PORT",),
        apply=ApplyMode.RESTART,
    ),
    SettingKey(
        key="database.username",
        settings_field="db_username",
        type=SettingType.STRING,
        tier=Tier.RUNTIME,
        group="Database",
        label="Username",
        env_aliases=("DB_USERNAME",),
        apply=ApplyMode.RESTART,
    ),
    SettingKey(
        key="database.password",
        settings_field="db_password",
        type=SettingType.SECRET,
        tier=Tier.RUNTIME,
        group="Database",
        label="Password",
        env_aliases=("DB_PASSWORD",),
        apply=ApplyMode.RESTART,
    ),
    SettingKey(
        key="database.name",
        settings_field="db_database",
        type=SettingType.STRING,
        tier=Tier.RUNTIME,
        group="Database",
        label="Database name",
        env_aliases=("DB_DATABASE",),
        apply=ApplyMode.RESTART,
    ),
    SettingKey(
        key="database.path",
        settings_field="db_path",
        type=SettingType.STRING,
        tier=Tier.RUNTIME,
        group="Database",
        label="SQLite file path",
        default="data/jira.sqlite",
        env_aliases=("DB_PATH",),
        apply=ApplyMode.RESTART,
    ),
    # ── Jira: internal instance ──────────────────────────────────────────────
    _runtime(
        "jira.internal.base_url",
        "internal_atlassian_base_url",
        SettingType.URL,
        "Jira",
        "Internal Atlassian base URL",
        env_aliases=("INTERNAL_ATLASSIAN_BASE_URL",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "jira.internal.auth_type",
        "internal_jira_auth_type",
        SettingType.ENUM,
        "Jira",
        "Internal auth type",
        default="basic",
        choices=("basic", "bearer"),
        env_aliases=("INTERNAL_JIRA_AUTH_TYPE",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "jira.internal.email",
        "internal_jira_email",
        SettingType.STRING,
        "Jira",
        "Internal account email",
        env_aliases=("INTERNAL_JIRA_EMAIL",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "jira.internal.api_token",
        "internal_jira_api_token",
        SettingType.SECRET,
        "Jira",
        "Internal API token",
        env_aliases=("INTERNAL_JIRA_API_TOKEN",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "jira.internal.fixed_issue_key",
        "internal_jira_fixed_issue_key",
        SettingType.STRING,
        "Jira",
        "Internal Tempo issue key",
        default="VIS-2",
        env_aliases=("INTERNAL_JIRA_FIXED_ISSUE_KEY",),
        apply=ApplyMode.RESTART,
    ),
    # ── Jira: external instance ──────────────────────────────────────────────
    _runtime(
        "jira.external.base_url",
        "external_atlassian_base_url",
        SettingType.URL,
        "Jira",
        "External Atlassian base URL",
        env_aliases=("EXTERNAL_ATLASSIAN_BASE_URL",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "jira.external.auth_type",
        "external_jira_auth_type",
        SettingType.ENUM,
        "Jira",
        "External auth type",
        default="basic",
        choices=("basic", "bearer"),
        env_aliases=("EXTERNAL_JIRA_AUTH_TYPE",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "jira.external.email",
        "external_jira_email",
        SettingType.STRING,
        "Jira",
        "External account email",
        env_aliases=("EXTERNAL_JIRA_EMAIL",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "jira.external.api_token",
        "external_jira_api_token",
        SettingType.SECRET,
        "Jira",
        "External API token",
        env_aliases=("EXTERNAL_JIRA_API_TOKEN",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "jira.external.my_account_id",
        "external_my_account_id",
        SettingType.STRING,
        "Jira",
        "External account id",
        env_aliases=("EXTERNAL_MY_ACCOUNT_ID",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "jira.http.connect_timeout_ms",
        "http_connect_timeout_ms",
        SettingType.INTEGER,
        "Jira",
        "Connect timeout (ms)",
        default=5000,
        env_aliases=("HTTP_CONNECT_TIMEOUT_MS",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "jira.http.read_timeout_ms",
        "http_read_timeout_ms",
        SettingType.INTEGER,
        "Jira",
        "Read timeout (ms)",
        default=10000,
        env_aliases=("HTTP_READ_TIMEOUT_MS",),
        apply=ApplyMode.RESTART,
    ),
    _runtime(
        "integrations.default_avatar_url",
        "integration_default_avatar_url",
        SettingType.URL,
        "Integrations",
        "Fallback avatar URL",
        default="https://secure.gravatar.com/avatar/default",
    ),
    # ── Quick actions ────────────────────────────────────────────────────────
    _runtime(
        "quick_actions.outlook_cleaner_url",
        "outlook_cleaner_url",
        SettingType.URL,
        "Quick actions",
        "Outlook cleaner URL",
        env_aliases=("OUTLOOK_CLEANER_URL",),
    ),
    _runtime(
        "quick_actions.outlook_cleaner_api_key",
        "outlook_cleaner_api_key",
        SettingType.SECRET,
        "Quick actions",
        "Outlook cleaner API key",
        env_aliases=("OUTLOOK_CLEANER_API_KEY",),
    ),
    _runtime(
        "quick_actions.default_timezone",
        "app_default_timezone",
        SettingType.STRING,
        "Quick actions",
        "Default timezone",
        default="America/New_York",
        env_aliases=("APP_DEFAULT_TIMEZONE",),
    ),
    _runtime(
        "quick_actions.workday_hours",
        "quick_actions_workday_hours",
        SettingType.INTEGER,
        "Quick actions",
        "Workday hours",
        default=8,
        env_aliases=("QUICK_ACTIONS_WORKDAY_HOURS",),
    ),
    _runtime(
        "quick_actions.worklog_start_time",
        "quick_actions_worklog_start_time",
        SettingType.STRING,
        "Quick actions",
        "Default worklog start time",
        default="19:30",
        env_aliases=("QUICK_ACTIONS_WORKLOG_START_TIME",),
    ),
    _runtime(
        "quick_actions.worklog_default_description",
        "quick_actions_worklog_default_description",
        SettingType.STRING,
        "Quick actions",
        "Default worklog description",
        default="Working on issue {issueKey}",
        env_aliases=("QUICK_ACTIONS_WORKLOG_DEFAULT_DESCRIPTION",),
    ),
    # ── Sync ─────────────────────────────────────────────────────────────────
    _runtime(
        "sync.jql",
        "sync_jql",
        SettingType.STRING,
        "Sync",
        "JQL query",
        default="assignee=currentUser() AND status!=Closed",
    ),
    _runtime(
        "sync.page_size",
        "sync_page_size",
        SettingType.INTEGER,
        "Sync",
        "Page size",
        default=100,
    ),
    _runtime(
        "sync.interval_minutes",
        "sync_interval_minutes",
        SettingType.INTEGER,
        "Sync",
        "Re-sync every (minutes)",
        default=15,
        help=(
            "How often Jira is polled for the issues assigned to you. Also the "
            "cadence at which an open board refreshes."
        ),
    ),
    _runtime(
        "sync.default_project_category",
        "sync_default_project_category",
        SettingType.STRING,
        "Sync",
        "Category for discovered projects",
        default="software",
    ),
)

_BY_NAME: dict[str, SettingKey] = {entry.key: entry for entry in SETTINGS}
_BY_FIELD: dict[str, SettingKey] = {entry.settings_field: entry for entry in SETTINGS}


def runtime_keys() -> tuple[SettingKey, ...]:
    """Keys the runtime store may hold, in registry order."""
    return tuple(entry for entry in SETTINGS if entry.is_stored)


def bootstrap_keys() -> tuple[SettingKey, ...]:
    """Keys that must come from the environment or the bootstrap cache."""
    return tuple(entry for entry in SETTINGS if not entry.is_stored)


def key_by_name(name: str) -> SettingKey:
    """Return the registry entry for *name*.

    Raises:
        KeyError: the key is not registered.
    """
    return _BY_NAME[name]


def key_by_settings_field(field: str) -> SettingKey | None:
    """Return the registry entry backed by the ``Settings`` attribute *field*."""
    return _BY_FIELD.get(field)


def fields_for(keys: tuple[SettingKey, ...]) -> dict[str, str]:
    """Map ``settings_field`` to registry key for *keys*."""
    return {entry.settings_field: entry.key for entry in keys}
