"""FastAPI dependencies — DB sessions, auth, and shared utilities."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from functools import lru_cache

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from planny_core.auth import verify_token
from planny_core.database import async_session_factory
from planny_core.errors import IntegrationUnavailableError, InvalidTokenError
from planny_core.models.user import User
from planny_jira.client import JiraHttpClient
from planny_jira.config import get_jira_instance_config, get_worklog_instance_names
from planny_jira.worklog_service import WorklogService
from sqlalchemy.ext.asyncio import AsyncSession

security = HTTPBearer()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Provide a database session per request.

    Commits on success, rolls back on exception, always closes.
    """
    async with async_session_factory() as session:
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

    Extracts the JWT from the ``Authorization: Bearer`` header, verifies
    the signature and expiration, loads the ``User`` from the database,
    and returns it.

    Raises ``InvalidTokenError`` (→ 401) on failure.
    """
    token = credentials.credentials
    payload = verify_token(token)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise InvalidTokenError()

    user = await db.get(User, int(user_id_str))
    if not user:
        raise InvalidTokenError("User not found")
    return user


# ── Jira integration dependencies ─────────────────────────────────────────────


async def require_jira_config() -> None:
    """Gates Jira routes — raises 503 if Jira integrations are not configured.

    Tries to load instance config for both internal and external instances.
    If either fails (missing YAML, missing env vars, unknown instance names),
    raises ``IntegrationUnavailableError`` (→ 503).
    """
    try:
        names = get_worklog_instance_names()
        get_jira_instance_config(names["internal"])
        get_jira_instance_config(names["external"])
    except (ValueError, KeyError) as exc:
        raise IntegrationUnavailableError(
            "Jira integrations not configured. Set INTERNAL_ATLASSIAN_BASE_URL, "
            "EXTERNAL_ATLASSIAN_BASE_URL and API tokens in .env"
        ) from exc


@lru_cache(maxsize=1)
def get_jira_worklog_service() -> WorklogService:
    """Singleton WorklogService with both Jira clients.

    Results are cached via ``lru_cache`` so clients are created only once.
    """
    names = get_worklog_instance_names()
    internal_config = get_jira_instance_config(names["internal"])
    external_config = get_jira_instance_config(names["external"])

    internal_client = JiraHttpClient(internal_config)
    external_client = JiraHttpClient(external_config)

    return WorklogService(
        internal_client=internal_client,
        external_client=external_client,
        tempo_issue_key=internal_config.fixed_issue_key or "VIS-2",
        external_account_id=external_config.my_account_id,
    )


@lru_cache(maxsize=1)
def get_jira_issue_client() -> JiraHttpClient:
    """Singleton external JiraHttpClient for issue operations."""
    names = get_worklog_instance_names()
    external_config = get_jira_instance_config(names["external"])
    return JiraHttpClient(external_config)
