"""Auth module — guest account creation."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.auth.router import router

MODULE = ApiModule(
    name="auth",
    router=router,
    # Login is reachable without a token by definition.
    auth=False,
    tags=("auth",),
)
