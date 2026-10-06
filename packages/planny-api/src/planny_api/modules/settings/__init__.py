"""Settings module — administrative configuration surface.

**Fail closed.** The module is only mounted when an administrator email is
configured. Without one there is no administrative surface to reach at all, which
is the first of two layers: the second is ``require_admin`` on every route.

This order matters. If the module were always mounted, a deployment that had not
configured an administrator would still expose endpoints that read and write
database passwords and Jira tokens; they would answer 403, but the attack surface
would exist and a future change to the authorization rules would silently open it.

The full reasoning is in ``docs/architecture/2026-10-05-runtime-configuration-blueprint.md``.
"""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.settings.router import router


def _admin_configured(settings: object) -> bool:
    """Whether an administrator is configured.

    Read through ``getattr`` rather than a typed parameter so the predicate cannot
    be broken by importing ``Settings`` here, which would pull the models layer
    into the registry at import time.
    """
    return bool(getattr(settings, "admin_email", None))


MODULE = ApiModule(
    name="settings",
    router=router,
    tags=("settings",),
    auth=True,
    enabled=_admin_configured,
)
