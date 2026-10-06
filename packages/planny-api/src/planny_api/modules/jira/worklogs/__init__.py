"""Jira worklog module — submissions, history and daily hours."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.jira.worklogs.router import router

MODULE = ApiModule(
    name="jira_worklogs",
    router=router,
    capabilities=("jira",),
    legacy_alias=False,
)
