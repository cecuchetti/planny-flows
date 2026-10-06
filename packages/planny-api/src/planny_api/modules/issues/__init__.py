"""Issues module — CRUD, search and project-scoped access."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.issues.router import router

MODULE = ApiModule(name="issues", router=router)
