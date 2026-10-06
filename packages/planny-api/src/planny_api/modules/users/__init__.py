"""Users module — the authenticated user's profile."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.users.router import router

MODULE = ApiModule(name="users", router=router)
