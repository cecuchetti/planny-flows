"""The domains this distribution contributes.

``planny-api`` discovers these through the ``planny.modules`` entry point
declared in ``pyproject.toml``; installing the package is the entire
integration, and omitting it removes the routes with no code change anywhere.
"""

from __future__ import annotations

from planny_api.kernel.module import ApiModule

from planny_loans import borrowers, loans

MODULES: tuple[ApiModule, ...] = (borrowers.MODULE, loans.MODULE)
