"""Jira instance configuration loader — YAML preferred, environment fallback.

This module never reads the process environment itself. The environment is
passed in explicitly as a mapping, which:

* satisfies the project rule that ``os.environ`` is only read inside the
  configuration layer (blueprint rule P4);
* makes the loader hermetic and trivially testable, instead of tests having to
  mutate global process state;
* closes finding H16: previously the loader read ``os.environ`` while
  ``pydantic-settings`` read ``.env``, so a ``.env``-only deployment configured
  Jira in one place and left the loader empty in the other.
"""

from __future__ import annotations

import re
import typing
from collections.abc import Mapping
from pathlib import Path

import yaml

from planny_jira.client import JiraInstanceConfig

__all__ = [
    "DEFAULT_WORKLOG_NAMES",
    "get_jira_instance_config",
    "get_worklog_instance_names",
    "load_jira_instances",
    "reset_jira_instances_cache",
]

Env = Mapping[str, str]

_CONFIG_DIR = Path(__file__).resolve().parent
_DEFAULT_YAML_PATH = _CONFIG_DIR / "jira-instances.yaml"

DEFAULT_WORKLOG_NAMES: dict[str, str] = {
    "internal": "internal",
    "external": "external",
}

DEFAULT_TIMEOUT_MS = 5000

ENV_VAR_PATTERN = re.compile(r"\$\{(\w+)}")


def _resolve_env_vars(value: str, env: Env) -> str:
    """Replace ``${VAR_NAME}`` placeholders using *env*."""

    def _replace(match: re.Match[str]) -> str:
        return env.get(match.group(1), "")

    return ENV_VAR_PATTERN.sub(_replace, value)


def _parse_timeout(env: Env, key: str, default: int = DEFAULT_TIMEOUT_MS) -> int:
    """Read an integer timeout from *env*, falling back to *default*."""
    raw = env.get(key, str(default))
    try:
        return int(raw)
    except ValueError:
        return default


def _load_yaml(yaml_path: Path, env: Env) -> dict[str, typing.Any] | None:
    """Load and interpolate a YAML config file, or return ``None``."""
    if not yaml_path.exists():
        return None

    raw_content = yaml_path.read_text(encoding="utf-8")
    resolved_content = _resolve_env_vars(raw_content, env)
    data = yaml.safe_load(resolved_content)
    if not isinstance(data, dict):
        return None
    return data


def _build_instance_from_yaml(
    raw: dict[str, typing.Any],
    env: Env,
    timeout_ms: int,
) -> JiraInstanceConfig | None:
    """Build a :class:`JiraInstanceConfig` from a YAML instance block."""
    name: str | None = raw.get("name")
    if not name:
        return None

    prefix = raw.get("envPrefix", "")
    base_url = _resolve_env_vars(str(raw.get("atlassianBaseUrl", "")), env).strip()

    my_account_id_raw = raw.get("myAccountId")
    my_account_id: str | None = None
    if my_account_id_raw is not None:
        my_account_id = _resolve_env_vars(str(my_account_id_raw), env).strip() or None

    return JiraInstanceConfig(
        base_url=base_url,
        auth_type=raw.get("authType", "basic"),
        email=env.get(f"{prefix}JIRA_EMAIL"),
        api_token=env.get(f"{prefix}JIRA_API_TOKEN"),
        timeout_ms=timeout_ms,
        system_name=f"{name}-jira",
        fixed_issue_key=raw.get("fixedIssueKey"),
        my_account_id=my_account_id,
    )


def _build_instance_from_env(instance_name: str, env: Env) -> JiraInstanceConfig:
    """Build a :class:`JiraInstanceConfig` from environment-style variables."""
    prefix = instance_name.upper()
    auth_type = env.get(f"{prefix}_JIRA_AUTH_TYPE", "basic")

    return JiraInstanceConfig(
        base_url=env.get(f"{prefix}_ATLASSIAN_BASE_URL", ""),
        auth_type=typing.cast(typing.Literal["basic", "bearer"], auth_type),
        email=env.get(f"{prefix}_JIRA_EMAIL"),
        api_token=env.get(f"{prefix}_JIRA_API_TOKEN"),
        timeout_ms=_parse_timeout(env, f"{prefix}_JIRA_TIMEOUT_MS"),
        system_name=env.get(f"{prefix}_SYSTEM_NAME") or f"{instance_name}-jira",
        fixed_issue_key=env.get(f"{prefix}_JIRA_FIXED_ISSUE_KEY"),
        my_account_id=env.get(f"{prefix}_MY_ACCOUNT_ID"),
    )


def _default_yaml_path(env: Env) -> Path:
    """Return the YAML config path, honouring an explicit override."""
    override = env.get("JIRA_INSTANCES_CONFIG_PATH")
    return Path(override) if override else _DEFAULT_YAML_PATH


def load_jira_instances(env: Env) -> tuple[dict[str, JiraInstanceConfig], dict[str, str]]:
    """Resolve Jira instances and worklog routing from *env*.

    YAML takes precedence when the file exists; otherwise instances are built
    directly from environment-style variables.

    Returns:
        A ``(instances, worklog_names)`` tuple. ``worklog_names`` maps the
        logical roles ``internal``/``external`` to instance names.
    """
    yaml_data = _load_yaml(_default_yaml_path(env), env)

    if yaml_data is None:
        instances = {
            name: _build_instance_from_env(name, env) for name in DEFAULT_WORKLOG_NAMES
        }
        worklog_names = {
            "internal": env.get("WORKLOG_INTERNAL_INSTANCE", DEFAULT_WORKLOG_NAMES["internal"]),
            "external": env.get("WORKLOG_EXTERNAL_INSTANCE", DEFAULT_WORKLOG_NAMES["external"]),
        }
        return instances, worklog_names

    timeout_ms = _parse_timeout(env, "JIRA_HTTP_TIMEOUT_MS")
    instances = {}
    raw_instances = yaml_data.get("instances")
    if isinstance(raw_instances, list):
        for raw in raw_instances:
            if isinstance(raw, dict):
                instance = _build_instance_from_yaml(raw, env, timeout_ms)
                if instance is not None:
                    instances[str(raw.get("name", ""))] = instance

    worklog_names = dict(DEFAULT_WORKLOG_NAMES)
    worklog_raw = yaml_data.get("worklog")
    if isinstance(worklog_raw, dict):
        for role in ("internal", "external"):
            key = f"{role}Instance"
            if key in worklog_raw:
                worklog_names[role] = str(worklog_raw[key])

    return instances, worklog_names


def get_jira_instance_config(instance_name: str, env: Env) -> JiraInstanceConfig:
    """Return the config for *instance_name*.

    Raises:
        ValueError: the instance name is not defined by *env* or the YAML file.
    """
    instances, _ = load_jira_instances(env)
    config = instances.get(instance_name)
    if config is None:
        available = ", ".join(sorted(instances)) or "none"
        msg = f"Unknown Jira instance: {instance_name}. Available: {available}"
        raise ValueError(msg)
    return config


def get_worklog_instance_names(env: Env) -> dict[str, str]:
    """Return the ``internal``/``external`` role to instance-name mapping."""
    _, worklog_names = load_jira_instances(env)
    return dict(worklog_names)


def reset_jira_instances_cache() -> None:
    """Deprecated no-op, kept so existing callers keep importing cleanly.

    The loader no longer caches internally: results depend entirely on the
    environment mapping it is given, so a process-global cache would be wrong.
    Callers that want caching should cache at their own layer.
    """
