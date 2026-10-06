"""Tests for application startup configuration guards."""

from __future__ import annotations

import pytest
from planny_core.config import DEV_JWT_SECRET, settings
from planny_core.errors import InsecureConfigurationError

from planny_api.main import create_app


def test_startup_aborts_in_production_with_dev_jwt_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The app refuses to boot rather than serve traffic with a public secret."""
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "jwt_secret", DEV_JWT_SECRET)

    with pytest.raises(InsecureConfigurationError):
        create_app()


def test_startup_proceeds_in_production_with_custom_jwt_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A real secret lets the app boot normally in production."""
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "jwt_secret", "a-real-unique-secret")

    assert create_app() is not None
