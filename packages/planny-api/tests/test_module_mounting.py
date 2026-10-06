"""Module mounting: canonical /api/v1 routes and the automatic legacy alias.

This is the central Phase 2 gate. For every route that has an unversioned alias,
the alias must resolve and behave like the versioned route. That is what
guarantees the React client, which still calls the unversioned paths, keeps
working while the refactor proceeds.

The test is hermetic: it runs against an in-memory database, so it never touches
the configured one.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.config import settings
from planny_core.database import Base
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.dependencies import get_db
from planny_api.kernel.registry import discover_modules
from planny_api.main import create_app

API_PREFIX = "/api/v1"

# Path parameters need a concrete value to be routable at all.
PARAM_VALUES = {
    "issue_id": "1",
    "comment_id": "1",
    "project_id": "1",
    "issue_key": "TEST-1",
    "date": "2026-01-01",
}

METHODS = ("get", "post", "put", "patch", "delete")


def _concrete(path: str) -> str:
    """Replace path parameters with routable values."""
    for name, value in PARAM_VALUES.items():
        path = path.replace(f"{{{name}}}", value)
    return path


def _aliased_router_paths() -> set[str]:
    """Router-relative paths of modules that expose an unversioned alias.

    Derived from the routers themselves rather than from their ``prefix``: some
    modules (``projects``, ``auth``) have an empty prefix, so prefix matching
    would incorrectly treat every root-level path as aliased.

    Modules such as the Jira integrations declare ``legacy_alias=False`` because
    their legacy path *is* the canonical one, so they must not be expected to
    answer at the root.
    """
    modules = discover_modules(
        packages=settings.modules_packages,
        scan_packages=settings.modules_scan_packages,
        use_entry_points=settings.modules_use_entry_points,
    )
    paths: set[str] = set()
    for module in modules:
        if module.versioned and module.legacy_alias:
            paths.update(route.path for route in module.router.routes)
    return paths


def _has_alias(path: str) -> bool:
    """Whether *path* (versioned) has an unversioned counterpart."""
    return path[len(API_PREFIX) :] in _aliased_router_paths()


def _without_request_id(payload: dict[str, object]) -> dict[str, object]:
    """Drop the per-request id so two error envelopes can be compared."""
    return {key: value for key, value in payload.items() if key != "requestId"}


def _versioned_routes(app: FastAPI) -> list[tuple[str, str]]:
    """Return ``(method, path)`` pairs that must have a working alias."""
    routes: list[tuple[str, str]] = []
    for path, operations in app.openapi().get("paths", {}).items():
        if not path.startswith(API_PREFIX) or not _has_alias(path):
            continue
        for method in operations:
            if method.lower() in METHODS:
                routes.append((method.upper(), path))
    return sorted(routes)


@pytest.fixture
async def db_engine() -> Iterator[object]:
    """In-memory database so the parity check never touches real data."""
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False})
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
def app(db_engine: object) -> FastAPI:
    """A fresh application instance wired to the in-memory database."""
    application = create_app()
    factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)

    async def _override() -> Iterator[AsyncSession]:
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    application.dependency_overrides[get_db] = _override
    return application


@pytest.fixture
async def client(app: FastAPI) -> Iterator[AsyncClient]:
    """Async client bound to the app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
def _keep_legacy_aliases_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Parity only makes sense while the aliases are on."""
    monkeypatch.setattr(settings, "api_legacy_aliases", True)


def test_routes_exist(app: FastAPI) -> None:
    """The route set is not empty, otherwise the parity check proves nothing."""
    assert _versioned_routes(app)


def test_every_versioned_module_has_an_alias_or_opts_out() -> None:
    """Sanity check on the alias bookkeeping the parity test relies on."""
    modules = discover_modules(
        packages=settings.modules_packages,
        scan_packages=settings.modules_scan_packages,
        use_entry_points=settings.modules_use_entry_points,
    )
    opted_out = {m.name for m in modules if not (m.versioned and m.legacy_alias)}
    # Health is unversioned-only; the Jira modules are already canonical.
    assert opted_out == {"health", "jira_issues", "jira_worklogs"}


def test_no_doubled_api_prefix(app: FastAPI) -> None:
    """Regression for Pitfall 1: routers must not carry the prefix themselves.

    The Jira routers used to declare ``prefix="/api/v1/jira/..."``, which became
    ``/api/v1/api/v1/jira/...`` once mounted as modules, breaking all eight of
    their routes.
    """
    doubled = [path for path in app.openapi()["paths"] if path.count(API_PREFIX) > 1]
    assert doubled == []


def test_health_is_not_versioned(app: FastAPI) -> None:
    """Infrastructure probes keep their unversioned path.

    ``docker-compose.yml`` and four scripts under ``deploy/scripts`` curl
    ``/health``; versioning it would break them for no benefit.
    """
    paths = app.openapi()["paths"]
    assert "/health" in paths
    assert f"{API_PREFIX}/health" not in paths


def test_root_redirect_is_not_versioned(app: FastAPI) -> None:
    """Regression for Pitfall 2: ``GET /`` must not move under the prefix."""
    assert f"{API_PREFIX}/" not in app.openapi()["paths"]


def test_jira_routes_keep_their_canonical_path(app: FastAPI) -> None:
    """Pitfall 1, end to end: the Jira routes land exactly where they used to."""
    paths = app.openapi()["paths"]
    assert f"{API_PREFIX}/jira/issues" in paths
    assert f"{API_PREFIX}/jira/worklogs" in paths
    assert f"{API_PREFIX}/api" not in paths


@pytest.mark.parametrize("method,path", _versioned_routes(create_app()))
async def test_legacy_alias_resolves_like_versioned_route(
    client: AsyncClient,
    method: str,
    path: str,
) -> None:
    """The alias must resolve and produce the same status as the canonical route.

    Bodies are compared only for error responses: successful payloads can carry
    volatile values (a freshly minted JWT, timestamps) that legitimately differ
    between two calls.
    """
    legacy_path = _concrete(path[len(API_PREFIX) :])
    versioned_path = _concrete(path)

    versioned = await client.request(method, versioned_path)
    legacy = await client.request(method, legacy_path)

    assert legacy.status_code == versioned.status_code, (
        f"{method} {legacy_path} -> {legacy.status_code} but "
        f"{method} {versioned_path} -> {versioned.status_code}"
    )
    assert legacy.status_code != 404, f"alias not mounted: {method} {legacy_path}"
    if versioned.status_code >= 400:
        # ``requestId`` is minted per request, so it can never match between two
        # calls. Everything else in the envelope must.
        assert _without_request_id(legacy.json()) == _without_request_id(versioned.json())


async def test_legacy_alias_is_hidden_from_the_schema(app: FastAPI, client: AsyncClient) -> None:
    """Aliases work but are not documented, so /docs shows one canonical API."""
    paths = app.openapi()["paths"]
    assert "/issues" not in paths
    assert f"{API_PREFIX}/issues" in paths

    response = await client.get("/issues")
    assert response.status_code != 404
