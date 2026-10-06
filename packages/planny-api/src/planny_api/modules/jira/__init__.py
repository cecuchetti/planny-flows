"""Jira integration module.

Exposes two routable modules (issues and worklogs) plus the sync engine used by
the projects module to pull assigned issues into the local database.
"""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.jira.issues import MODULE as ISSUES_MODULE
from planny_api.modules.jira.worklogs import MODULE as WORKLOGS_MODULE

MODULES: tuple[ApiModule, ...] = (ISSUES_MODULE, WORKLOGS_MODULE)
