"""Application lifespan and the context dependency.

On startup this module closes the configuration loop:

1. resolve the **bootstrap tier** (process environment > cache file > ``.env``),
   which is the connection used to reach the settings store;
2. read the store and apply its overrides to the settings object;
3. record the connection that actually worked in the cache.

Step 2 is what makes the runtime store real. Without it every stored value would
be written, validated, reported as applied — and never read by the process that
was supposed to use it.

The context is created after the overrides are applied, so resources built from
configuration (the Jira clients, the quick-action services) see the stored values
rather than the environment's.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from planny_core.config import Settings
from planny_core.config import settings as default_settings
from planny_core.config.bootstrap import write_bootstrap
from planny_core.config.store import resolve_stored_settings
from planny_core.database import get_database, reset_database

from planny_api.app.context import build_context

__all__ = ["lifespan", "load_stored_overrides"]

logger = structlog.get_logger(__name__)


async def load_stored_overrides(base: Settings) -> Settings:
    """Read the runtime store and apply it on top of *base*.

    A failure is logged and the environment's configuration is used instead.
    Refusing to start would be worse: the settings API is how an operator would
    fix a broken stored value, and an application that cannot boot cannot serve
    that API. Secrets are the exception — the store raises rather than silently
    ignoring them, and that is deliberate.
    """
    try:
        # Building from `base` installs it as the process default, so the engine
        # used to read the store is the same one that later serves requests.
        async with get_database(base).session() as session:
            effective = await resolve_stored_settings(session, base)
    except Exception as exc:  # noqa: BLE001 - startup must not fail on this alone
        logger.warning("settings_overrides.unavailable", error=str(exc))
        return base

    if effective is not base:
        applied = [
            field
            for field in type(base).model_fields
            if getattr(effective, field) != getattr(base, field)
        ]
        if applied:
            logger.info("settings_overrides.applied", count=len(applied))

    return effective


def _apply_to_process_settings(effective: Settings, target: Settings) -> None:
    """Copy resolved values onto the settings object the rest of the app reads.

    The application reads ``planny_core.config.settings`` at call time — a sync
    reads ``settings.sync_jql``, a worklog reads
    ``settings.quick_actions_workday_hours``. Replacing the object would leave
    those references pointing at the old one, so the values are copied onto it,
    which is the same mechanism the settings API uses for a live change.
    """
    for field in type(target).model_fields:
        setattr(target, field, getattr(effective, field))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create the application context and guarantee it is closed."""
    configured = getattr(app.state, "settings", None) or default_settings

    effective = await load_stored_overrides(configured)
    if effective is not configured:
        _apply_to_process_settings(effective, configured)

    # The settings the application runs with are the resolved ones, so resources
    # built below see stored values. `app.state.settings` is updated too, because
    # `get_context` reads it.
    app.state.settings = effective

    # Record the connection that worked, so a value entered in the UI and not yet
    # proven cannot lock the next start out. Seeded on first run, refreshed after.
    try:
        write_bootstrap(effective)
    except OSError as exc:  # noqa: BLE001 - a cache miss is not fatal
        logger.warning("bootstrap.not_written", error=str(exc))

    context = build_context(effective)
    app.state.ctx = context
    logger.info("app_context.ready", jira_configured=context.jira_issue_client is not None)

    try:
        yield
    finally:
        await context.aclose()
        # The default database belongs to the process, not to a request, so it is
        # closed here rather than left to garbage collection. `get_database()`
        # returns the instance that was actually built and used.
        await get_database().dispose()
        reset_database()
        logger.info("app_context.closed")
