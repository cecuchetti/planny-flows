"""Jira instance configuration loader — YAML + env var fallback."""

import os
import re
import typing
from pathlib import Path

import yaml

from planny_jira.client import JiraInstanceConfig

_CONFIG_DIR = Path(__file__).resolve().parent
_DEFAULT_YAML_PATH = _CONFIG_DIR / "jira-instances.yaml"

DEFAULT_WORKLOG_NAMES: dict[str, str] = {
    "internal": "internal",
    "external": "external",
}

ENV_VAR_PATTERN = re.compile(r"\$\{(\w+)}")


def _resolve_env_vars(value: str) -> str:
    """Replace ${VAR_NAME} placeholders with env var values."""

    def _replace(match: re.Match[str]) -> str:
        return os.environ.get(match.group(1), "")

    return ENV_VAR_PATTERN.sub(_replace, value)


def _load_yaml_config() -> dict[str, typing.Any] | None:
    """Load and resolve jira-instances.yaml, or return None if not found."""
    yaml_path_str = os.environ.get("JIRA_INSTANCES_CONFIG_PATH")
    yaml_path = Path(yaml_path_str) if yaml_path_str else _DEFAULT_YAML_PATH

    if not yaml_path.exists():
        return None

    raw_content = yaml_path.read_text(encoding="utf-8")
    resolved_content = _resolve_env_vars(raw_content)
    data = yaml.safe_load(resolved_content)
    if not isinstance(data, dict):
        return None
    return data


def _build_instance_from_yaml(
    raw: dict[str, typing.Any], timeout_ms: int
) -> JiraInstanceConfig | None:
    """Build a JiraInstanceConfig from a YAML instance block."""
    name: str | None = raw.get("name")
    if not name:
        return None

    prefix = raw.get("envPrefix", "")
    email = os.environ.get(f"{prefix}JIRA_EMAIL")
    api_token = os.environ.get(f"{prefix}JIRA_API_TOKEN")
    base_url = _resolve_env_vars(str(raw.get("atlassianBaseUrl", ""))).strip()
    my_account_id_raw = raw.get("myAccountId")
    my_account_id: str | None = None
    if my_account_id_raw is not None:
        resolved = _resolve_env_vars(str(my_account_id_raw)).strip()
        my_account_id = resolved or None

    return JiraInstanceConfig(
        base_url=base_url,
        auth_type=raw.get("authType", "basic"),
        email=email,
        api_token=api_token,
        timeout_ms=timeout_ms,
        system_name=f"{name}-jira",
        fixed_issue_key=raw.get("fixedIssueKey"),
        my_account_id=my_account_id,
    )


def _build_instance_from_env(instance_name: str) -> JiraInstanceConfig:
    """Build a JiraInstanceConfig from environment variables."""
    prefix = instance_name.upper()

    base_url = os.environ.get(f"{prefix}_ATLASSIAN_BASE_URL", "")
    auth_type = os.environ.get(f"{prefix}_JIRA_AUTH_TYPE", "basic")
    email = os.environ.get(f"{prefix}_JIRA_EMAIL")
    api_token = os.environ.get(f"{prefix}_JIRA_API_TOKEN")
    timeout_str = os.environ.get(f"{prefix}_JIRA_TIMEOUT_MS", "5000")
    fixed_issue_key = os.environ.get(f"{prefix}_JIRA_FIXED_ISSUE_KEY")
    my_account_id = os.environ.get(f"{prefix}_MY_ACCOUNT_ID")
    system_name_env = os.environ.get(f"{prefix}_SYSTEM_NAME")
    system_name = system_name_env or f"{instance_name}-jira"

    try:
        timeout_ms = int(timeout_str)
    except ValueError:
        timeout_ms = 5000

    return JiraInstanceConfig(
        base_url=base_url,
        auth_type=typing.cast(typing.Literal["basic", "bearer"], auth_type),
        email=email,
        api_token=api_token,
        timeout_ms=timeout_ms,
        system_name=system_name,
        fixed_issue_key=fixed_issue_key,
        my_account_id=my_account_id,
    )


_cached_instances: dict[str, JiraInstanceConfig] | None = None
_cached_worklog_names: dict[str, str] | None = None


def _load_config() -> tuple[dict[str, JiraInstanceConfig], dict[str, str]]:
    """Load configuration from YAML (preferred) or env vars.

    Returns (instances_map, worklog_names).
    """
    global _cached_instances, _cached_worklog_names

    if _cached_instances is not None and _cached_worklog_names is not None:
        # Return a copy to avoid mutation of cache
        return dict(_cached_instances), dict(_cached_worklog_names)

    yaml_data = _load_yaml_config()

    if yaml_data is not None:
        instances: dict[str, JiraInstanceConfig] = {}
        timeout_env = os.environ.get("JIRA_HTTP_TIMEOUT_MS", "5000")
        try:
            timeout_ms = int(timeout_env)
        except ValueError:
            timeout_ms = 5000

        raw_instances = yaml_data.get("instances")
        if isinstance(raw_instances, list):
            for raw in raw_instances:
                if isinstance(raw, dict):
                    inst = _build_instance_from_yaml(raw, timeout_ms)
                    if inst is not None:
                        name: str = raw.get("name", "")
                        instances[name] = inst

        worklog_raw = yaml_data.get("worklog")
        worklog_names: dict[str, str] = {
            "internal": DEFAULT_WORKLOG_NAMES["internal"],
            "external": DEFAULT_WORKLOG_NAMES["external"],
        }
        if isinstance(worklog_raw, dict):
            if "internalInstance" in worklog_raw:
                worklog_names["internal"] = str(worklog_raw["internalInstance"])
            if "externalInstance" in worklog_raw:
                worklog_names["external"] = str(worklog_raw["externalInstance"])
    else:
        # Fallback to env vars
        instances = {}
        for name in ("internal", "external"):
            instances[name] = _build_instance_from_env(name)

        worklog_names = {
            "internal": os.environ.get("WORKLOG_INTERNAL_INSTANCE", DEFAULT_WORKLOG_NAMES["internal"]),
            "external": os.environ.get("WORKLOG_EXTERNAL_INSTANCE", DEFAULT_WORKLOG_NAMES["external"]),
        }

    _cached_instances = instances
    _cached_worklog_names = worklog_names
    return dict(instances), dict(worklog_names)


def get_jira_instance_config(instance_name: str) -> JiraInstanceConfig:
    """Get config for a named Jira instance from YAML or env vars."""
    instances, _ = _load_config()
    config = instances.get(instance_name)
    if config is None:
        msg = f"Unknown Jira instance: {instance_name}. Available: {', '.join(sorted(instances.keys()))}"
        raise ValueError(msg)
    return config


def get_worklog_instance_names() -> dict[str, str]:
    """Return dict mapping 'internal'/'external' to configured instance names."""
    _, worklog_names = _load_config()
    return dict(worklog_names)


def reset_jira_instances_cache() -> None:
    """Reset cached config (for testing)."""
    global _cached_instances, _cached_worklog_names
    _cached_instances = None
    _cached_worklog_names = None
