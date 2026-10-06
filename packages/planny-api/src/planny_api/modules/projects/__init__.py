"""Projects module — listing, loading, updating and Jira sync."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.projects.router import router

MODULE = ApiModule(name="projects", router=router)
