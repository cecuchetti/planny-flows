"""Tests for roles and the administrative gate.

Before roles existed, every authenticated user had identical privileges —
including the anonymous accounts that ``POST /authentication/guest`` creates for
anyone who asks. The settings module reads and writes infrastructure
credentials, so it cannot be exposed on top of that model.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from planny_core.config import settings
from planny_core.db import Base
from planny_core.enums import DEFAULT_USER_ROLE, UserRole
from planny_core.models import Project, User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.core.security.policies import require_admin
from planny_api.dependencies import get_current_user, get_db, promote_configured_admin
from planny_api.main import create_app

ADMIN_EMAIL = "admin@example.com"


@pytest.fixture
async def db_session() -> Iterator[AsyncSession]:
    """In-memory database with a project (users need one) and two accounts."""
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False})
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with factory() as session:
        session.add(Project(id=1, name="p", category="software"))
        await session.flush()
        session.add_all(
            [
                User(id=1, name="Admin", email=ADMIN_EMAIL, avatarUrl="", projectId=1),
                User(id=2, name="Member", email="member@example.com", avatarUrl="", projectId=1),
                User(id=3, name="Guest", email="guest@jira.guest", avatarUrl="", projectId=1),
            ]
        )
        await session.commit()
        yield session

    await engine.dispose()


class TestUserRoleModel:
    """The role column and its safe default."""

    async def test_defaults_to_member(self, db_session: AsyncSession) -> None:
        """A user created without an explicit role must not be privileged."""
        user = User(name="New", email="new@example.com", avatarUrl="", projectId=1)
        db_session.add(user)
        await db_session.flush()

        assert user.role == DEFAULT_USER_ROLE.value
        assert not user.is_admin

    async def test_admin_flag(self) -> None:
        assert User(role=UserRole.ADMIN.value).is_admin is True
        assert User(role=UserRole.MEMBER.value).is_admin is False

    async def test_existing_rows_get_the_unprivileged_default(
        self, db_session: AsyncSession
    ) -> None:
        users = (await db_session.execute(select(User))).scalars().all()
        assert {user.role for user in users} == {UserRole.MEMBER.value}


class TestPromoteConfiguredAdmin:
    """Promotion happens on authentication, keyed on the configured email."""

    async def test_promotes_the_configured_email(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "admin_email", ADMIN_EMAIL)
        user = await db_session.get(User, 1)

        await promote_configured_admin(db_session, user)

        assert user.is_admin

    async def test_promotion_is_case_insensitive(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "admin_email", ADMIN_EMAIL.upper())
        user = await db_session.get(User, 1)

        await promote_configured_admin(db_session, user)

        assert user.is_admin

    @pytest.mark.parametrize("user_id", [2, 3])
    async def test_leaves_other_users_alone(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch, user_id: int
    ) -> None:
        monkeypatch.setattr(settings, "admin_email", ADMIN_EMAIL)
        user = await db_session.get(User, user_id)

        await promote_configured_admin(db_session, user)

        assert not user.is_admin

    async def test_does_nothing_without_configuration(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "admin_email", None)
        user = await db_session.get(User, 1)

        await promote_configured_admin(db_session, user)

        assert not user.is_admin

    async def test_is_idempotent(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "admin_email", ADMIN_EMAIL)
        user = await db_session.get(User, 1)

        await promote_configured_admin(db_session, user)
        await promote_configured_admin(db_session, user)

        assert user.is_admin


class TestRequireAdmin:
    """The dependency that guards administrative surfaces."""

    @staticmethod
    def _app(user: User) -> FastAPI:
        app = create_app()

        @app.get("/admin-only", dependencies=[Depends(require_admin)])
        async def _admin_only() -> dict[str, bool]:
            return {"ok": True}

        app.dependency_overrides[get_current_user] = lambda: user
        return app

    async def _call(self, app: FastAPI) -> int:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return (await client.get("/admin-only")).status_code

    async def test_admin_is_allowed(self) -> None:
        user = User(id=1, role=UserRole.ADMIN.value)
        assert await self._call(self._app(user)) == 200

    async def test_member_is_forbidden(self) -> None:
        user = User(id=2, role=UserRole.MEMBER.value)
        assert await self._call(self._app(user)) == 403

    async def test_unprivileged_default_is_forbidden(self) -> None:
        """A freshly constructed user has role ``None`` until flushed."""
        user = User(id=3)
        assert await self._call(self._app(user)) == 403

    async def test_forbidden_uses_the_standard_envelope(self) -> None:
        user = User(id=2, role=UserRole.MEMBER.value)
        app = self._app(user)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            body = (await client.get("/admin-only")).json()

        assert body["error"]["code"] == "FORBIDDEN"
        assert body["error"]["status"] == 403


class TestEndToEndPromotion:
    """The configured admin is promoted the first time they authenticate."""

    async def test_authenticating_promotes_the_configured_admin(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
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
                User(id=1, name="A", email=ADMIN_EMAIL, avatarUrl="", projectId=1)
            )
            await session.commit()

        monkeypatch.setattr(settings, "admin_email", ADMIN_EMAIL)

        from planny_core.auth import create_token

        app = create_app()

        async def _db() -> Iterator[AsyncSession]:
            async with factory() as session:
                yield session
                await session.commit()

        app.dependency_overrides[get_db] = _db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/v1/currentUser",
                headers={"Authorization": f"Bearer {create_token(1)}"},
            )

        assert response.status_code == 200

        async with factory() as session:
            user = await session.get(User, 1)
            assert user is not None
            assert user.is_admin, "authenticating as the configured admin must promote them"

        await engine.dispose()
