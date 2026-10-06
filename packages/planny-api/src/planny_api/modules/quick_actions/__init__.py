"""Quick Actions module — Outlook cleaner and Tempo export."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.quick_actions.router import router

MODULE = ApiModule(name="quick_actions", router=router)
