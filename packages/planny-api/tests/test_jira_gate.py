"""Tests for the Jira configuration gate.

Regression coverage for finding H16:

* the two configuration paths were disconnected — ``pydantic-settings`` read
  ``.env`` while the Jira loader read ``os.environ``, so a ``.env``-only
  deployment left the loader with empty base URLs;
* ``require_jira_config()`` only checked that the instance *name* resolved, so
  it passed with an entirely empty configuration and the failure surfaced later
  as an obscure httpx error at request time.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from planny_core.config import settings
from planny_core.errors import IntegrationUnavailableError

from planny_api.dependencies import require_jira_config, resolve_jira_configs

JIRA_FIELDS = (
    "internal_atlassian_base_url",
    "internal_jira_email",
    "internal_jira_api_token",
    "external_atlassian_base_url",
    "external_jira_email",
    "external_jira_api_token",
)


@pytest.fixture
def configured_jira(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """A fully configured pair of Jira instances."""
    monkeypatch.setattr(settings, "internal_atlassian_base_url", "https://internal.example.com")
    monkeypatch.setattr(settings, "internal_jira_email", "bot@example.com")
    monkeypatch.setattr(settings, "internal_jira_api_token", "token-internal")
    monkeypatch.setattr(settings, "external_atlassian_base_url", "https://external.example.com")
    monkeypatch.setattr(settings, "external_jira_email", "bot@example.com")
    monkeypatch.setattr(settings, "external_jira_api_token", "token-external")
    yield


@pytest.fixture
def empty_jira(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """No Jira configuration at all."""
    for field in JIRA_FIELDS:
        monkeypatch.setattr(settings, field, "")
    yield


class TestResolveJiraConfigs:
    """Instances resolve from the single configuration source."""

    def test_reads_values_from_settings(self, configured_jira: None) -> None:
        """A ``.env``-only deployment must reach the loader (H16)."""
        configs = resolve_jira_configs()
        assert configs["internal"].base_url == "https://internal.example.com"
        assert configs["external"].base_url == "https://external.example.com"
        assert configs["internal"].api_token == "token-internal"

    def test_empty_configuration_raises(self, empty_jira: None) -> None:
        """An empty configuration must not silently resolve."""
        with pytest.raises(ValueError, match="without a base URL"):
            resolve_jira_configs()


class TestRequireJiraConfigGate:
    """The route gate must actually validate, not just resolve names."""

    async def test_passes_when_configured(self, configured_jira: None) -> None:
        await require_jira_config()

    async def test_raises_when_unconfigured(self, empty_jira: None) -> None:
        """Regression: this used to pass, leaving Jira routes to fail later."""
        with pytest.raises(IntegrationUnavailableError):
            await require_jira_config()

    async def test_raises_when_credentials_missing(
        self, configured_jira: None, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A base URL without a token is still unusable."""
        monkeypatch.setattr(settings, "external_jira_api_token", "")
        with pytest.raises(IntegrationUnavailableError, match="missing credentials"):
            await require_jira_config()
