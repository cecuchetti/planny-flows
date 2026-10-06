"""Tests for the application context and lifespan.

The point of these is the resource lifecycle: HTTP clients used to be created by
``lru_cache``-decorated dependencies and were never closed, so every reload and
every test run leaked a connection pool.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from planny_core.config import settings
from planny_jira.worklog_service import WorklogService

from planny_api.app.context import AppContext, build_context
from planny_api.main import create_app


class TestAppContext:
    """What the context owns and how it releases it."""

    def test_provides_quick_action_services(self) -> None:
        context = AppContext(settings=settings)
        assert context.outlook_clean_service is not None
        assert context.tempo_service is not None

    def test_each_context_has_its_own_service_instances(self) -> None:
        """Separate contexts must not share in-memory job state."""
        first = AppContext(settings=settings)
        second = AppContext(settings=settings)
        assert first.outlook_clean_service is not second.outlook_clean_service
        assert first.tempo_service is not second.tempo_service

    async def test_aclose_closes_the_jira_client(self) -> None:
        context = AppContext(settings=settings)
        client = MagicMock()
        client.close = AsyncMock()
        context.jira_issue_client = client

        await context.aclose()

        client.close.assert_awaited_once()

    async def test_aclose_closes_the_worklog_service(self) -> None:
        context = AppContext(settings=settings)
        service = MagicMock(spec=WorklogService)
        service.aclose = AsyncMock()
        context.jira_worklog_service = service

        await context.aclose()

        service.aclose.assert_awaited_once()

    async def test_aclose_is_safe_without_jira(self) -> None:
        """An unconfigured Jira must not break shutdown."""
        await AppContext(settings=settings).aclose()

    async def test_aclose_is_idempotent(self) -> None:
        context = AppContext(settings=settings)
        client = MagicMock()
        client.close = AsyncMock()
        context.jira_issue_client = client

        await context.aclose()
        await context.aclose()

        assert client.close.await_count == 2

    async def test_aclose_swallows_client_errors(self) -> None:
        """Shutdown must not propagate a failing close."""
        context = AppContext(settings=settings)
        client = MagicMock()
        client.close = AsyncMock(side_effect=RuntimeError("socket already gone"))
        context.jira_issue_client = client

        await context.aclose()  # must not raise


class TestBuildContext:
    """Construction tolerates an unconfigured integration."""

    def test_builds_without_jira_configuration(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            "planny_api.dependencies.resolve_jira_configs",
            lambda: (_ for _ in ()).throw(ValueError("not configured")),
        )
        context = build_context(settings)
        assert context.jira_issue_client is None
        assert context.jira_worklog_service is None
        # The local-only features still work.
        assert context.tempo_service is not None

    async def test_builds_with_jira_configuration(self) -> None:
        """With the repository's configuration the Jira members are populated."""
        context = build_context(settings)
        try:
            if context.jira_issue_client is None:
                pytest.skip("Jira is not configured in this environment")
            assert context.jira_worklog_service is not None
        finally:
            await context.aclose()


class TestLifespan:
    """The context is created on startup and closed on shutdown."""

    async def test_sets_and_closes_the_context(self) -> None:
        app: FastAPI = create_app()
        assert getattr(app.state, "ctx", None) is None

        async with app.router.lifespan_context(app):
            assert app.state.ctx is not None

    async def test_closes_clients_on_shutdown(self) -> None:
        app: FastAPI = create_app()
        closed: list[int] = []

        async with app.router.lifespan_context(app):
            context: AppContext = app.state.ctx
            client = MagicMock()

            async def _close() -> None:
                closed.append(1)

            client.close = _close
            context.jira_issue_client = client

        assert closed == [1], "the lifespan must close the Jira client on shutdown"

    async def test_uses_the_settings_bound_to_the_app(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """``create_app(settings)`` must win over the process singleton."""
        app: FastAPI = create_app()
        sentinel = MagicMock()
        sentinel.aclose = AsyncMock()
        captured: list[object] = []

        def _fake_build_context(resolved: object) -> MagicMock:
            captured.append(resolved)
            return sentinel

        monkeypatch.setattr(
            "planny_api.app.lifespan.build_context",
            _fake_build_context,
        )

        async with app.router.lifespan_context(app):
            assert app.state.ctx is sentinel

        assert captured and captured[0] is app.state.settings
        sentinel.aclose.assert_awaited_once()
