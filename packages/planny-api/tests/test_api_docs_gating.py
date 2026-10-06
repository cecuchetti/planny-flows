"""Tests for API documentation gating (H12 regression).

The interactive docs (``/docs``, ``/redoc``) and the OpenAPI schema
(``/openapi.json``) must all be disabled when ``env == "production"``.

Regression note: only ``docs_url`` used to be gated, which left ``/redoc``
and ``/openapi.json`` publicly served in production even though ``/docs``
returned 404.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.config import settings

from planny_api.main import create_app

DOC_ENDPOINTS = ("/docs", "/redoc", "/openapi.json")


@pytest.fixture
def production_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Run with ``env == "production"``."""
    monkeypatch.setattr(settings, "env", "production")
    yield


@pytest.fixture
def development_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Run with ``env == "development"``."""
    monkeypatch.setattr(settings, "env", "development")
    yield


async def _get(app: FastAPI, path: str) -> int:
    """Perform a GET request against *app* and return the status code."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(path)
        return response.status_code


@pytest.mark.parametrize("path", DOC_ENDPOINTS)
async def test_docs_disabled_in_production(production_env: None, path: str) -> None:
    """Every documentation endpoint returns 404 in production."""
    app = create_app()
    assert await _get(app, path) == 404


@pytest.mark.parametrize("path", DOC_ENDPOINTS)
async def test_docs_enabled_outside_production(development_env: None, path: str) -> None:
    """Every documentation endpoint is served outside production."""
    app = create_app()
    assert await _get(app, path) == 200


async def test_openapi_schema_is_not_built_in_production(production_env: None) -> None:
    """No schema is generated in production, not just hidden from the docs UI."""
    app = create_app()
    assert app.openapi_url is None
    assert app.docs_url is None
    assert app.redoc_url is None
