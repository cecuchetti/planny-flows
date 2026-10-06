"""Application context: long-lived resources owned by the app.

Clients used to be created by ``lru_cache``-decorated dependencies, which meant
they were never closed: every ``httpx.AsyncClient`` owns a connection pool, and
nothing released it at shutdown, in tests, or across reloads.

The context is built once in the lifespan, stored on ``app.state``, and closed
on shutdown. Tests override the ``get_context`` dependency to inject fakes,
which is the idiomatic FastAPI seam.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from planny_core.config import Settings
from planny_jira.client import JiraHttpClient
from planny_jira.worklog_service import WorklogService

if TYPE_CHECKING:  # imported lazily below: the modules import this package's siblings
    pass

__all__ = ["AppContext", "build_context"]

logger = structlog.get_logger(__name__)


class AppContext:
    """Resources that live as long as the application process.

    Optional integration members are ``None`` when the integration is not
    configured; the routes that need them are gated by a capability, so they are
    never reached half-built.
    """

    def __init__(
        self,
        settings: Settings,
        *,
        jira_issue_client: JiraHttpClient | None = None,
        jira_worklog_service: WorklogService | None = None,
    ) -> None:
        self.settings = settings
        self.jira_issue_client = jira_issue_client
        self.jira_worklog_service = jira_worklog_service

        # Imported here, not at module scope: ``planny_api.modules.<x>`` runs the
        # package's ``__init__``, which imports its router, which imports
        # ``planny_api.dependencies``. Doing that at import time would close the
        # cycle dependencies -> app.context -> modules -> dependencies.
        from planny_api.modules.quick_actions.outlook import OutlookCleanService
        from planny_api.modules.quick_actions.tempo import TempoService

        self.outlook_clean_service = OutlookCleanService()
        self.tempo_service = TempoService()

    def _jira_clients(self) -> list[JiraHttpClient]:
        """Every Jira client owned directly by this context."""
        return [client for client in (self.jira_issue_client,) if client is not None]

    async def aclose(self) -> None:
        """Release every connection pool. Safe to call more than once."""
        for client in self._jira_clients():
            try:
                await client.close()
            except Exception:  # noqa: BLE001 - shutdown must not raise
                logger.warning("app_context.close_failed", exc_info=True)

        if self.jira_worklog_service is not None:
            try:
                await self.jira_worklog_service.aclose()
            except Exception:  # noqa: BLE001 - shutdown must not raise
                logger.warning("app_context.worklog_close_failed", exc_info=True)


def build_context(settings: Settings) -> AppContext:
    """Build the application context, tolerating an unconfigured Jira.

    Jira being absent is a normal state (the app serves the local board), so a
    configuration failure is logged and leaves the Jira members empty rather than
    aborting startup.
    """
    from planny_api.dependencies import resolve_jira_configs

    try:
        configs = resolve_jira_configs()
    except Exception:
        logger.info("app_context.jira_not_configured")
        return AppContext(settings)

    internal = configs["internal"]
    external = configs["external"]

    return AppContext(
        settings,
        jira_issue_client=JiraHttpClient(external),
        jira_worklog_service=WorklogService(
            internal_client=JiraHttpClient(internal),
            external_client=JiraHttpClient(external),
            tempo_issue_key=internal.fixed_issue_key or "VIS-2",
            external_account_id=external.my_account_id,
        ),
    )
