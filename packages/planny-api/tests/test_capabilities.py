"""Tests for the capability registry.

A capability is a named precondition a module can require. It can also carry a
health probe, which is what keeps the health endpoint from hardcoding a list of
integrations.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from planny_core.config import Settings

from planny_api.kernel import capabilities


@pytest.fixture
def clean_registry() -> Iterator[None]:
    """Restore the registry after a test mutates it."""
    capabilities.CAPABILITIES.clear()
    capabilities.CAPABILITY_HEALTH.clear()
    yield
    capabilities.CAPABILITIES.clear()
    capabilities.CAPABILITY_HEALTH.clear()


class TestBuiltinCapabilities:
    """The capabilities the application ships with."""

    def test_jira_capability_is_registered(self, clean_registry: None) -> None:
        assert capabilities.unknown_capabilities(("jira",)) == []

    def test_unknown_capability_is_reported(self, clean_registry: None) -> None:
        assert capabilities.unknown_capabilities(("nope",)) == ["nope"]

    def test_resolve_returns_the_dependency(self, clean_registry: None) -> None:
        from planny_api.dependencies import require_jira_config

        assert capabilities.resolve_capability("jira") is require_jira_config

    def test_resolve_unknown_raises(self, clean_registry: None) -> None:
        with pytest.raises(KeyError):
            capabilities.resolve_capability("nope")


class TestCapabilityHealth:
    """Health probes are collected from the registry, not hardcoded."""

    def test_reports_the_builtin_jira_probe(self, clean_registry: None) -> None:
        reports = capabilities.capability_health(Settings(_env_file=None))
        assert [report["name"] for report in reports] == ["jira_integrations"]

    def test_reports_not_configured_without_urls(self, clean_registry: None) -> None:
        settings = Settings(
            _env_file=None, internal_atlassian_base_url="", external_atlassian_base_url=""
        )
        report = capabilities.capability_health(settings)[0]
        assert report["status"] == "not_configured"
        assert report["internal_configured"] is False

    def test_reports_ok_when_either_instance_is_configured(self, clean_registry: None) -> None:
        settings = Settings(
            _env_file=None,
            internal_atlassian_base_url="https://internal.example.com",
            external_atlassian_base_url="",
        )
        assert capabilities.capability_health(settings)[0]["status"] == "ok"

    def test_a_new_capability_appears_without_changing_the_health_module(
        self, clean_registry: None
    ) -> None:
        """The whole point: adding an integration does not touch the health router."""

        def _billing_health(settings: Settings) -> dict[str, Any]:
            return {"name": "billing", "status": "ok"}

        capabilities.CAPABILITIES["billing"] = lambda: None
        capabilities.CAPABILITY_HEALTH["billing"] = _billing_health

        names = [
            report["name"] for report in capabilities.capability_health(Settings(_env_file=None))
        ]
        assert "billing" in names

    def test_reports_are_ordered_by_capability_name(self, clean_registry: None) -> None:
        """Deterministic output, so health responses are comparable between runs."""
        capabilities.CAPABILITIES["aaa"] = lambda: None
        capabilities.CAPABILITY_HEALTH["aaa"] = lambda _: {"name": "aaa", "status": "ok"}
        capabilities.CAPABILITIES["zzz"] = lambda: None
        capabilities.CAPABILITY_HEALTH["zzz"] = lambda _: {"name": "zzz", "status": "ok"}

        names = [
            report["name"] for report in capabilities.capability_health(Settings(_env_file=None))
        ]
        # 'jira' sorts between them, and each probe reports its own name.
        assert names == ["aaa", "jira_integrations", "zzz"]

    def test_a_capability_without_a_probe_is_not_reported(self, clean_registry: None) -> None:
        """A gate and a reportable status are separate concerns."""
        capabilities.CAPABILITIES["silent"] = lambda: None

        reports = capabilities.capability_health(Settings(_env_file=None))
        assert "silent" not in [report["name"] for report in reports]
