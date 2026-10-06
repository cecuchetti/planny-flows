"""Settings router — administrative configuration surface.

Every route requires the admin role. See :mod:`planny_api.modules.settings` for why
the module is not mounted at all until an administrator is configured.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from planny_core.models import User
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.app.context import AppContext
from planny_api.core.security.policies import require_admin
from planny_api.dependencies import get_context, get_db
from planny_api.modules.settings.schemas import (
    ConnectionTestRequest,
    ConnectionTestResult,
    SettingsList,
    SettingsUpdateRequest,
    SettingsUpdateResponse,
)
from planny_api.modules.settings.service import SettingsService

# Paths are RELATIVE. The module registry adds the /api/v1 prefix when mounting.
router = APIRouter(prefix="/settings", tags=["settings"])

AdminUser = Annotated[User, Depends(require_admin)]


def get_settings_service(context: AppContext = Depends(get_context)) -> SettingsService:
    """Build the service around the settings the *application* was created with.

    Reading the module-level singleton instead would ignore the settings the app
    was built with, so a differently configured instance — a test, or a second
    app in the same process — would read and write through the wrong master key.
    """
    return SettingsService(context.settings)


ServiceDep = Annotated[SettingsService, Depends(get_settings_service)]


@router.get(
    "",
    response_model=SettingsList,
    summary="List every configurable setting",
)
async def list_settings(
    service: ServiceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: AdminUser,
) -> SettingsList:
    """Return the configuration surface, grouped for the UI.

    Secret values are never included; the response reports only that one is set.
    """
    return await service.list_settings(db)


@router.put(
    "",
    response_model=SettingsUpdateResponse,
    summary="Change one or more settings",
)
async def update_settings(
    payload: SettingsUpdateRequest,
    service: ServiceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: AdminUser,
) -> SettingsUpdateResponse:
    """Persist a batch of changes and report what took effect.

    Changes that need a restart are reported in ``restartKeys``; they are stored
    regardless, so an operator can fix several things and restart once.
    """
    return await service.apply_changes(
        db,
        {change.key: change.value for change in payload.changes},
        user_id=admin.id,
    )


@router.delete(
    "/{key}",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Clear an override so the key falls back",
)
async def clear_setting(
    key: str,
    service: ServiceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: AdminUser,
) -> Response:
    """Delete a stored override.

    Clearing is how a value returns to the environment: deleting the row restores
    the fallback instead of freezing today's value in place.
    """
    await service.clear(db, key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/test-connection",
    response_model=ConnectionTestResult,
    summary="Test a candidate configuration without saving it",
)
async def test_connection(
    payload: ConnectionTestRequest,
    service: ServiceDep,
    _admin: AdminUser,
) -> ConnectionTestResult:
    """Try a candidate connection and report the driver's own error if it fails.

    This is what makes the bootstrap cache safe to use: a bad database value is
    discovered here, before it is stored, while the cache still holds a working
    connection to start from.
    """
    return await service.test_connection(payload.target, payload.fields)
