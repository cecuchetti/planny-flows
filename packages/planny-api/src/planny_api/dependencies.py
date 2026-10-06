"""FastAPI dependencies — DB sessions, authentication, and app resources."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING

import structlog
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from planny_core.auth import verify_token
from planny_core.config import settings
from planny_core.database import get_database
from planny_core.enums import UserRole
from planny_core.errors import IntegrationUnavailableError, InvalidTokenError
from planny_core.models.user import User
from planny_jira.client import JiraHttpClient, JiraInstanceConfig
from planny_jira.config import get_jira_instance_config, get_worklog_instance_names
from planny_jira.worklog_service import WorklogService
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.app.context import AppContext, build_context

if TYPE_CHECKING:  # annotations only; importing these would close an import cycle
    from planny_api.modules.quick_actions.outlook import OutlookCleanService
    from planny_api.modules.quick_actions.tempo import TempoService

# auto_error=False so a missing Authorization header raises InvalidTokenError
# like every other auth failure, instead of FastAPI's {"detail": ...} shape.
security = HTTPBearer(auto_error=False)

logger = structlog.get_logger(__name__)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Provide a database session per request.

    Commits on success, rolls back on exception, always closes.
    """
    async with get_database().session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate the current user from a JWT bearer token.

    Raises:
        InvalidTokenError: the token is missing, malformed, expired, or points
            at a user that no longer exists.
    """
    if credentials is None:
        # No Authorization header at all. Treated as an invalid token so the
        # client only has to understand one error shape (finding H9).
        raise InvalidTokenError()

    payload = verify_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise InvalidTokenError()

    user = await db.get(User, int(user_id))
    if not user:
        raise InvalidTokenError("User not found")

    return await promote_configured_admin(db, user)


async def promote_configured_admin(db: AsyncSession, user: User) -> User:
    """Promote *user* when their email matches the configured administrator.

    Done at authentication rather than only at startup because the administrator
    account may not exist when the process boots: accounts are created on first
    use, by the guest endpoint or by a Jira sync. The check is a string
    comparison and the write happens at most once per account.
    """
    configured = (settings.admin_email or "").strip().lower()
    if not configured or user.is_admin:
        return user

    if (user.email or "").strip().lower() != configured:
        return user

    user.role = UserRole.ADMIN.value
    await db.flush()
    logger.info("user.promoted_to_admin", user_id=user.id)
    return user


# ── Application context ──────────────────────────────────────────────────────


def get_context(request: Request) -> AppContext:
    """Return the application context for this process.

    The lifespan normally builds it. The lazy fallback exists because
    ``httpx.ASGITransport`` — used throughout the test suite — does not run
    lifespan events, and an ASGI server that skips the lifespan should still
    serve requests rather than 500. The lifespan remains the owner in
    production: it builds the context up front and closes it on shutdown.

    Overriding this one dependency lets a test replace every resource at once,
    which is why the clients are no longer module-level caches.
    """
    app = request.app
    context: AppContext | None = getattr(app.state, "ctx", None)
    if context is None:
        context = build_context(getattr(app.state, "settings", None) or settings)
        app.state.ctx = context
    return context


# ── Jira integration ─────────────────────────────────────────────────────────


def resolve_jira_configs() -> dict[str, JiraInstanceConfig]:
    """Resolve both Jira instance configs from the single configuration source.

    Raises:
        ValueError: an instance name is unknown, or an instance has no base URL.
    """
    env = settings.jira_env()
    names = get_worklog_instance_names(env)
    configs = {
        role: get_jira_instance_config(names[role], env) for role in ("internal", "external")
    }

    # Validate that the instances are actually usable, not merely named.
    # Previously the gate only checked that the instance *name* resolved, so a
    # completely empty configuration still passed and failed later as an
    # obscure httpx "missing protocol" error at request time (finding H16).
    missing = [role for role, cfg in configs.items() if not cfg.base_url]
    if missing:
        raise ValueError(f"Jira instance(s) without a base URL: {', '.join(sorted(missing))}")

    return configs


def _has_credentials(config: JiraInstanceConfig) -> bool:
    """Whether an instance carries usable credentials."""
    if not config.api_token:
        return False
    return bool(config.email) or config.auth_type == "bearer"


async def require_jira_config() -> None:
    """Gate for Jira routes — raises 503 unless Jira is genuinely configured.

    Verifies that both instances resolve *and* that each has a base URL and
    credentials, so the route fails at the gate rather than mid-request.
    """
    try:
        configs = resolve_jira_configs()
    except (ValueError, KeyError) as exc:
        raise IntegrationUnavailableError(
            "Jira integrations not configured. Set INTERNAL_ATLASSIAN_BASE_URL, "
            "EXTERNAL_ATLASSIAN_BASE_URL and API tokens in .env"
        ) from exc

    unauthenticated = [role for role, cfg in configs.items() if not _has_credentials(cfg)]
    if unauthenticated:
        raise IntegrationUnavailableError(
            "Jira instance(s) missing credentials: " + ", ".join(sorted(unauthenticated))
        )


def get_jira_issue_client(context: AppContext = Depends(get_context)) -> JiraHttpClient:
    """Return the external Jira client, or fail if Jira is not configured."""
    if context.jira_issue_client is None:
        raise IntegrationUnavailableError("Jira integration is not configured")
    return context.jira_issue_client


def get_jira_worklog_service(context: AppContext = Depends(get_context)) -> WorklogService:
    """Return the worklog service, or fail if Jira is not configured."""
    if context.jira_worklog_service is None:
        raise IntegrationUnavailableError("Jira integration is not configured")
    return context.jira_worklog_service


# ── Quick actions ────────────────────────────────────────────────────────────


def get_outlook_clean_service(context: AppContext = Depends(get_context)) -> OutlookCleanService:
    """Return the Outlook cleaner service."""
    return context.outlook_clean_service


def get_tempo_service(context: AppContext = Depends(get_context)) -> TempoService:
    """Return the Tempo export service."""
    return context.tempo_service
