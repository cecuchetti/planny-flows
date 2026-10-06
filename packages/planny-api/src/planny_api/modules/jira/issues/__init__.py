"""Jira issue module — search, detail and transitions."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.jira.issues.router import router

MODULE = ApiModule(
    name="jira_issues",
    router=router,
    # Every route depends on Jira being configured; the kernel resolves that
    # from the capability registry instead of the factory wiring it by hand.
    capabilities=("jira",),
    # Already canonical under /api/v1, so a root alias would be identical.
    legacy_alias=False,
)
