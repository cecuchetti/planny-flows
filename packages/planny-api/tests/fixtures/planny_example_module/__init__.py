"""Example external module.

This package stands in for a merged project. It lives outside ``planny_api`` and
is imported only because its path is on ``sys.path`` (or because it is installed
and publishes a ``planny.modules`` entry point). Nothing in the application
imports it, which is the point: registering a domain must not require editing the
factory, the catalog or any configuration file.

See ``docs/architecture/how-to-add-a-module.md``.
"""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_example_module.notes import router

MODULES: tuple[ApiModule, ...] = (
    ApiModule(
        name="example_notes",
        router=router,
        tags=("notes",),
        # An external domain gets the same treatment as a built-in one:
        # versioned at /api/v1/example-notes, aliased at /example-notes.
        auth=True,
        versioned=True,
        legacy_alias=True,
    ),
)
