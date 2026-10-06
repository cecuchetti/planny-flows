"""Health module — liveness, readiness and full health probes."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.health.router import router

MODULE = ApiModule(
    name="health",
    router=router,
    # Infrastructure probes are consumed by docker-compose and four scripts under
    # deploy/scripts. They keep their unversioned paths, and they must be
    # reachable without a token, so this is the one module that opts out of both
    # versioning and authentication.
    auth=False,
    versioned=False,
    legacy_alias=True,
)
