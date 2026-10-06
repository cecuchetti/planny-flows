"""Comments module — CRUD for issue comments."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.comments.router import router

MODULE = ApiModule(name="comments", router=router)
