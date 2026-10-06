"""Application entrypoint.

The application itself lives in :mod:`planny_api.app.factory`; this module exists
so that ``uvicorn planny_api.main:app`` keeps working unchanged.
"""

from __future__ import annotations

from planny_core.logging import configure_structlog

from planny_api.app.factory import create_app

# ── Configure logging on import ─────────────────────────────────────────────
configure_structlog()

# ── Module-level app instance ───────────────────────────────────────────────
app = create_app()

#: Re-exported so existing imports of ``planny_api.main.create_app`` keep working.
__all__ = ["app", "create_app"]
