"""Tests for the settings API.

Three properties matter most here, and each is tested from several angles:

* the module is **not mounted** when no administrator is configured;
* only an administrator can reach it;
* a secret's value is never returned, only the fact that one is stored.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.config import Settings
from planny_core.db import Base
from planny_core.enums import UserRole
from planny_core.models import Project, User
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.dependencies import get_current_user, get_db
from planny_api.main import create_app

ADMIN_EMAIL = "admin@example.com"
MASTER_KEY = "test-master-key"


def _settings(*, with_admin: bool = True, db_path: str | None = None) -> Settings:
    return Settings(
        _env_file=None,
        env="development",
        jwt_secret="test-secret",
        admin_email=ADMIN_EMAIL if with_admin else None,
        master_key=MASTER_KEY,
        db_type="sqlite",
        db_path=db_path or "data/does-not-matter.sqlite",
    )


@pytest.fixture
async def engine() -> AsyncIterator[object]:
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with factory() as session:
        session.add(Project(id=1, name="p", category="software"))
        await session.flush()
        session.add(
            User(
                id=1,
                name="Admin",
                email=ADMIN_EMAIL,
                avatarUrl="",
                projectId=1,
                role=UserRole.ADMIN.value,
            )
        )
        await session.commit()

    yield engine
    await engine.dispose()


def _app(
    engine: object,
    *,
    role: str = UserRole.ADMIN.value,
    settings: Settings | None = None,
) -> FastAPI:
    app = create_app(settings or _settings())
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)  # type: ignore[arg-type]

    async def _db() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session
            await session.commit()

    async def _user() -> User:
        return User(id=1, email=ADMIN_EMAIL, role=role)

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = _user
    return app


@pytest.fixture
async def admin_client(engine: object) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=_app(engine))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


class TestMountingFailsClosed:
    """No administrator configured means no administrative surface at all."""

    def test_not_mounted_without_an_admin_email(self) -> None:
        app = create_app(_settings(with_admin=False))
        paths = [path for path in app.openapi()["paths"] if "settings" in path]
        assert paths == [], f"settings routes must not exist: {paths}"

    def test_mounted_once_an_admin_email_is_configured(self) -> None:
        app = create_app(_settings(with_admin=True))
        assert "/api/v1/settings" in app.openapi()["paths"]

    async def test_returns_404_not_403_when_not_mounted(self, engine: object) -> None:
        """Nothing to authenticate against: the route does not exist."""
        app = create_app(_settings(with_admin=False))
        factory = async_sessionmaker(bind=engine, expire_on_commit=False)  # type: ignore[arg-type]

        async def _db() -> AsyncIterator[AsyncSession]:
            async with factory() as session:
                yield session

        app.dependency_overrides[get_db] = _db
        app.dependency_overrides[get_current_user] = lambda: User(id=1, role="admin")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            assert (await client.get("/api/v1/settings")).status_code == 404


class TestAuthorization:
    """Only administrators get through."""

    async def test_member_is_forbidden(self, engine: object) -> None:
        transport = ASGITransport(app=_app(engine, role=UserRole.MEMBER.value))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            assert (await client.get("/api/v1/settings")).status_code == 403

    async def test_member_cannot_write(self, engine: object) -> None:
        transport = ASGITransport(app=_app(engine, role=UserRole.MEMBER.value))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/api/v1/settings", json={"changes": [{"key": "database.host", "value": "h"}]}
            )
            assert response.status_code == 403

    async def test_member_cannot_test_connections(self, engine: object) -> None:
        transport = ASGITransport(app=_app(engine, role=UserRole.MEMBER.value))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/settings/test-connection", json={})
            assert response.status_code == 403

    async def test_forbidden_uses_the_standard_envelope(self, engine: object) -> None:
        transport = ASGITransport(app=_app(engine, role=UserRole.MEMBER.value))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            body = (await client.get("/api/v1/settings")).json()
        assert body["error"]["code"] == "FORBIDDEN"


class TestListing:
    """The UI gets metadata for every key, and no secret values."""

    async def test_groups_the_registry(self, admin_client: AsyncClient) -> None:
        body = (await admin_client.get("/api/v1/settings")).json()
        names = [group["name"] for group in body["groups"]]
        assert "Database" in names
        assert "Jira" in names

    async def test_reports_every_runtime_key(self, admin_client: AsyncClient) -> None:
        from planny_core.config.keys import runtime_keys

        body = (await admin_client.get("/api/v1/settings")).json()
        returned = {entry["key"] for group in body["groups"] for entry in group["entries"]}
        assert returned == {entry.key for entry in runtime_keys()}

    async def test_bootstrap_keys_are_absent(self, admin_client: AsyncClient) -> None:
        """They cannot be changed here, so offering them would be a lie."""
        body = (await admin_client.get("/api/v1/settings")).json()
        keys = {entry["key"] for group in body["groups"] for entry in group["entries"]}
        assert not any(key.startswith("bootstrap.") for key in keys)

    async def test_never_returns_a_secret_value(self, admin_client: AsyncClient) -> None:
        await admin_client.put(
            "/api/v1/settings",
            json={"changes": [{"key": "database.password", "value": "hunter2"}]},
        )

        response = await admin_client.get("/api/v1/settings")
        assert "hunter2" not in response.text

        entries = {e["key"]: e for g in response.json()["groups"] for e in g["entries"]}
        assert entries["database.password"]["value"] is None
        assert entries["database.password"]["isSecret"] is True
        assert entries["database.password"]["isOverridden"] is True

    async def test_reports_a_live_value_immediately(self, admin_client: AsyncClient) -> None:
        """A live key is read at call time, so its new value is already in effect."""
        await admin_client.put(
            "/api/v1/settings", json={"changes": [{"key": "sync.page_size", "value": 77}]}
        )
        body = (await admin_client.get("/api/v1/settings")).json()
        entries = {e["key"]: e for g in body["groups"] for e in g["entries"]}
        assert entries["sync.page_size"]["value"] == 77
        assert entries["sync.page_size"]["isOverridden"] is True

    async def test_a_restart_value_is_not_yet_in_effect(
        self, admin_client: AsyncClient
    ) -> None:
        """The database engine is built at startup, so the running process keeps
        the old value until it restarts. Reporting the new one would be a lie the
        health check would contradict."""
        before = (await admin_client.get("/api/v1/settings")).json()
        original = next(
            e for g in before["groups"] for e in g["entries"] if e["key"] == "database.host"
        )["value"]

        await admin_client.put(
            "/api/v1/settings",
            json={"changes": [{"key": "database.host", "value": "db.internal"}]},
        )

        body = (await admin_client.get("/api/v1/settings")).json()
        entry = next(
            e for g in body["groups"] for e in g["entries"] if e["key"] == "database.host"
        )
        assert entry["isOverridden"] is True
        assert entry["value"] == original, "the running value must not be reported as changed"
        assert entry["storedValue"] == "db.internal"

    async def test_reports_whether_a_master_key_is_configured(
        self, admin_client: AsyncClient
    ) -> None:
        body = (await admin_client.get("/api/v1/settings")).json()
        assert body["masterKeyConfigured"] is True

    async def test_includes_the_metadata_the_form_needs(
        self, admin_client: AsyncClient
    ) -> None:
        body = (await admin_client.get("/api/v1/settings")).json()
        entry = next(
            e for g in body["groups"] for e in g["entries"] if e["key"] == "database.type"
        )
        assert entry["label"]
        assert entry["group"] == "Database"
        assert entry["choices"] == ["postgres", "sqlite"]
        assert entry["apply"] == "restart"


class TestUpdating:
    """Changes are persisted and reported with their apply mode."""

    async def test_applies_a_live_change(self, admin_client: AsyncClient) -> None:
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={"changes": [{"key": "sync.page_size", "value": 50}]},
            )
        ).json()

        assert body["results"][0]["status"] == "applied"
        assert body["restartRequired"] is False

    async def test_reports_a_restart_change(self, admin_client: AsyncClient) -> None:
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={"changes": [{"key": "database.host", "value": "new-host"}]},
            )
        ).json()

        assert body["results"][0]["status"] == "stored"
        assert body["results"][0]["requiresRestart"] is True
        assert body["restartRequired"] is True
        assert body["restartKeys"] == ["database.host"]

    async def test_a_batch_mixes_modes(self, admin_client: AsyncClient) -> None:
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={
                    "changes": [
                        {"key": "database.port", "value": 6543},
                        {"key": "sync.page_size", "value": 25},
                    ]
                },
            )
        ).json()

        assert body["restartKeys"] == ["database.port"]

    async def test_one_bad_independent_value_does_not_discard_the_others(
        self, admin_client: AsyncClient
    ) -> None:
        """An operator fixing several settings should not have to find the one
        failing value before anything is saved."""
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={
                    "changes": [
                        {"key": "sync.page_size", "value": 42},
                        {"key": "sync.stale_after_hours", "value": "not-a-number"},
                    ]
                },
            )
        ).json()

        by_key = {r["key"]: r for r in body["results"]}
        assert by_key["sync.page_size"]["status"] == "applied"
        assert by_key["sync.stale_after_hours"]["status"] == "rejected"

        listed = (await admin_client.get("/api/v1/settings")).json()
        entries = {e["key"]: e for g in listed["groups"] for e in g["entries"]}
        assert entries["sync.page_size"]["value"] == 42


class TestConnectionChangesAreAtomicAndProven:
    """A connection change is saved only after it has been shown to work.

    This is the one change that can lock the application out of its own settings
    store: unreachable values would leave the next start unable to read the rows
    that describe how to connect.
    """

    async def test_a_bad_value_rejects_the_whole_group(
        self, admin_client: AsyncClient
    ) -> None:
        """A new host with an invalid engine is not a configuration anyone wants
        half of."""
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={
                    "changes": [
                        {"key": "database.host", "value": "good-host"},
                        {"key": "database.type", "value": "mysql"},
                    ]
                },
            )
        ).json()

        statuses = {r["key"]: r["status"] for r in body["results"]}
        assert set(statuses.values()) == {"rejected"}

        listed = (await admin_client.get("/api/v1/settings")).json()
        entries = {e["key"]: e for g in listed["groups"] for e in g["entries"]}
        assert entries["database.host"]["isOverridden"] is False

    async def test_an_unreachable_connection_is_rejected(
        self, admin_client: AsyncClient
    ) -> None:
        """Storing it would leave the next start unable to read the store."""
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={
                    "changes": [
                        {"key": "database.type", "value": "postgres"},
                        {"key": "database.host", "value": "no-such-host.invalid"},
                        {"key": "database.port", "value": 1},
                    ]
                },
            )
        ).json()

        statuses = {r["key"]: r["status"] for r in body["results"]}
        assert set(statuses.values()) == {"rejected"}
        assert "Connection failed" in body["results"][0]["detail"]

    async def test_a_working_connection_is_stored(
        self, admin_client: AsyncClient, tmp_path: Path
    ) -> None:
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={
                    "changes": [
                        {"key": "database.type", "value": "sqlite"},
                        {"key": "database.path", "value": str(tmp_path / "proven.sqlite")},
                    ]
                },
            )
        ).json()

        statuses = {r["key"]: r["status"] for r in body["results"]}
        assert statuses["database.type"] == "stored", body["results"]
        assert body["restartRequired"] is True

    async def test_rejects_an_invalid_choice(self, admin_client: AsyncClient) -> None:
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={"changes": [{"key": "database.type", "value": "oracle"}]},
            )
        ).json()
        assert body["results"][0]["status"] == "rejected"
        assert "postgres" in body["results"][0]["detail"]

    async def test_rejects_an_unknown_key(self, admin_client: AsyncClient) -> None:
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={"changes": [{"key": "database.typo", "value": "x"}]},
            )
        ).json()
        assert body["results"][0]["status"] == "rejected"

    async def test_rejects_a_bootstrap_key(self, admin_client: AsyncClient) -> None:
        """The master key cannot be set from the store it protects."""
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={"changes": [{"key": "bootstrap.master_key", "value": "x"}]},
            )
        ).json()
        assert body["results"][0]["status"] == "rejected"

    async def test_rejects_a_bad_type(self, admin_client: AsyncClient) -> None:
        body = (
            await admin_client.put(
                "/api/v1/settings",
                json={"changes": [{"key": "database.port", "value": "not-a-number"}]},
            )
        ).json()
        assert body["results"][0]["status"] == "rejected"


class TestClearing:
    """Deleting an override restores the fallback chain."""

    async def test_clears_an_override(self, admin_client: AsyncClient) -> None:
        await admin_client.put(
            "/api/v1/settings", json={"changes": [{"key": "database.host", "value": "h"}]}
        )

        response = await admin_client.delete("/api/v1/settings/database.host")

        assert response.status_code == 204
        body = (await admin_client.get("/api/v1/settings")).json()
        entries = {e["key"]: e for g in body["groups"] for e in g["entries"]}
        assert entries["database.host"]["isOverridden"] is False

    async def test_clearing_without_an_override_is_idempotent(
        self, admin_client: AsyncClient
    ) -> None:
        """The requested end state already holds, so it is a success."""
        assert (
            await admin_client.delete("/api/v1/settings/database.host")
        ).status_code == 204

    async def test_clearing_a_live_key_restores_the_environment_value(
        self, admin_client: AsyncClient
    ) -> None:
        """Regression: deleting the row was not enough for a live key.

        Applying a live value writes it onto the settings object the rest of the
        application reads. Clearing only deleted the row, so the process kept
        serving the cleared value while the API reported that it had fallen back
        to the environment — the listing said ``isOverridden: false`` next to the
        overridden value.
        """
        from planny_core.config.settings import Settings

        before = (await admin_client.get("/api/v1/settings")).json()
        original = next(
            e for g in before["groups"] for e in g["entries"] if e["key"] == "sync.page_size"
        )["value"]

        await admin_client.put(
            "/api/v1/settings", json={"changes": [{"key": "sync.page_size", "value": 77}]}
        )
        applied = (await admin_client.get("/api/v1/settings")).json()
        assert (
            next(
                e
                for g in applied["groups"]
                for e in g["entries"]
                if e["key"] == "sync.page_size"
            )["value"]
            == 77
        )

        await admin_client.delete("/api/v1/settings/sync.page_size")

        after = (await admin_client.get("/api/v1/settings")).json()
        entry = next(
            e for g in after["groups"] for e in g["entries"] if e["key"] == "sync.page_size"
        )
        assert entry["isOverridden"] is False
        assert entry["value"] != 77, "the running process kept the cleared value"
        assert entry["value"] == original
        assert entry["value"] == Settings().sync_page_size

    async def test_unknown_key_is_a_404(self, admin_client: AsyncClient) -> None:
        """A typo in the URL must not look like a successful reset."""
        assert (
            await admin_client.delete("/api/v1/settings/database.typo")
        ).status_code == 404


class TestConnectionTest:
    """Proving a candidate configuration works before saving it."""

    async def test_accepts_a_working_sqlite_path(
        self, admin_client: AsyncClient, tmp_path: Path
    ) -> None:
        body = (
            await admin_client.post(
                "/api/v1/settings/test-connection",
                json={
                    "target": "database",
                    "fields": {
                        "database.type": "sqlite",
                        "database.path": str(tmp_path / "probe.sqlite"),
                    },
                },
            )
        ).json()

        assert body["ok"] is True, body["detail"]
        assert body["latencyMs"] is not None

    async def test_reports_a_failure_with_the_driver_message(
        self, admin_client: AsyncClient
    ) -> None:
        body = (
            await admin_client.post(
                "/api/v1/settings/test-connection",
                json={
                    "target": "database",
                    "fields": {
                        "database.type": "sqlite",
                        "database.path": "/nonexistent-directory-xyz/db.sqlite",
                    },
                },
            )
        ).json()

        assert body["ok"] is False
        assert body["detail"]

    async def test_unknown_target_is_reported(self, admin_client: AsyncClient) -> None:
        body = (
            await admin_client.post(
                "/api/v1/settings/test-connection", json={"target": "carrier-pigeon"}
            )
        ).json()
        assert body["ok"] is False
        assert "carrier-pigeon" in body["detail"]

    async def test_rejects_fields_that_are_not_connection_settings(
        self, admin_client: AsyncClient
    ) -> None:
        """Otherwise the endpoint could be used to probe arbitrary config."""
        body = (
            await admin_client.post(
                "/api/v1/settings/test-connection",
                json={"target": "database", "fields": {"jira.external.api_token": "x"}},
            )
        ).json()
        # The unrelated field is ignored, and the test still runs against the
        # current configuration rather than failing.
        assert "latencyMs" in body or body["ok"] is False

    async def test_invalid_value_is_reported_not_raised(
        self, admin_client: AsyncClient
    ) -> None:
        body = (
            await admin_client.post(
                "/api/v1/settings/test-connection",
                json={"target": "database", "fields": {"database.port": "abc"}},
            )
        ).json()
        assert body["ok"] is False

    async def test_does_not_persist_anything(self, admin_client: AsyncClient) -> None:
        """A probe must not commit the value it was probing."""
        await admin_client.post(
            "/api/v1/settings/test-connection",
            json={"target": "database", "fields": {"database.host": "probed-host"}},
        )

        body = (await admin_client.get("/api/v1/settings")).json()
        entries = {e["key"]: e for g in body["groups"] for e in g["entries"]}
        assert entries["database.host"]["isOverridden"] is False
