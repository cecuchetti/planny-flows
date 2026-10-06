"""Tests for the runtime settings store.

Two properties matter more than the rest and are tested from several angles:

* the store **fails closed** — it never starts with stored secrets it cannot read;
* a secret is **never read back** through the listing used by the settings API.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_core.config.crypto import MasterKeyMismatchError, key_id
from planny_core.config.store import MissingMasterKeyError, SettingsStore
from planny_core.db import Base
from planny_core.errors import InvalidConfigurationError
from planny_core.models import AppSetting, Project, User

MASTER_KEY = "test-master-key"


@pytest.fixture
async def db_session() -> Iterator[AsyncSession]:
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with factory() as session:
        session.add(Project(id=1, name="p", category="software"))
        await session.flush()
        session.add(User(id=1, name="A", email="a@example.com", avatarUrl="", projectId=1))
        await session.commit()
        yield session

    await engine.dispose()


@pytest.fixture
def store() -> SettingsStore:
    return SettingsStore(master_key=MASTER_KEY)


class TestRoundTrip:
    """Values survive storage with their type intact."""

    async def test_saves_and_loads_a_string(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        await store.save(db_session, "jira.external.base_url", "https://jira.example.com")
        assert await store.load(db_session) == {
            "jira.external.base_url": "https://jira.example.com"
        }

    async def test_preserves_the_integer_type(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        """A port read back as "5432" would fail validation later, not here."""
        await store.save(db_session, "database.port", 6543)
        loaded = await store.load(db_session)
        assert loaded["database.port"] == 6543
        assert isinstance(loaded["database.port"], int)

    async def test_survives_values_that_need_json_escaping(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        """Templates and SQL snippets are stored verbatim, quotes included."""
        value = 'Working on "issue" {issueKey}\n\tend'
        await store.save(db_session, "quick_actions.worklog_default_description", value)
        assert (
            await store.load(db_session)
        )["quick_actions.worklog_default_description"] == value

    async def test_survives_non_ascii(self, db_session: AsyncSession, store: SettingsStore) -> None:
        await store.save(db_session, "database.host", "servidor-ñandú")
        assert (await store.load(db_session))["database.host"] == "servidor-ñandú"

    async def test_a_second_save_replaces(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        await store.save(db_session, "database.host", "first")
        await store.save(db_session, "database.host", "second")

        rows = (await db_session.execute(select(AppSetting))).scalars().all()
        assert len(rows) == 1
        assert (await store.load(db_session))["database.host"] == "second"

    async def test_records_who_changed_it(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        await store.save(db_session, "database.host", "h", user_id=1)
        row = (await db_session.execute(select(AppSetting))).scalars().first()
        assert row is not None
        assert row.updated_by == 1
        assert row.updated_at is not None


class TestSecrets:
    """Secrets are encrypted at rest and never read back."""

    async def test_is_stored_encrypted(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        await store.save(db_session, "database.password", "hunter2")

        row = (await db_session.execute(select(AppSetting))).scalars().first()
        assert row is not None
        assert row.value is not None
        assert "hunter2" not in row.value
        assert row.is_secret is True
        assert row.key_id == key_id(MASTER_KEY)

    async def test_round_trips_through_encryption(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        await store.save(db_session, "database.password", "hunter2")
        assert (await store.load(db_session))["database.password"] == "hunter2"

    async def test_does_not_record_a_key_id_for_plain_values(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        await store.save(db_session, "database.host", "h")
        row = (await db_session.execute(select(AppSetting))).scalars().first()
        assert row is not None
        assert row.key_id is None

    async def test_listing_never_returns_a_secret(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        """An admin may replace a token; reading it back would put every
        credential on screen and into every captured response body."""
        await store.save(db_session, "database.password", "hunter2")
        await store.save(db_session, "database.host", "visible")

        rows = {row.key: row for row in await store.rows(db_session)}

        assert rows["database.password"].value is None
        assert rows["database.password"].is_secret is True
        assert rows["database.host"].value == "visible"


class TestFailsClosed:
    """The store never starts with secrets it cannot read."""

    async def test_saving_a_secret_without_a_master_key_is_refused(
        self, db_session: AsyncSession
    ) -> None:
        store = SettingsStore(master_key=None)
        with pytest.raises(MissingMasterKeyError):
            await store.save(db_session, "database.password", "hunter2")

    async def test_loading_a_stored_secret_without_a_master_key_is_refused(
        self, db_session: AsyncSession
    ) -> None:
        """Skipping the row would start with credentials the operator believes
        are configured but which are silently not in effect."""
        await SettingsStore(master_key=MASTER_KEY).save(
            db_session, "database.password", "hunter2"
        )

        with pytest.raises(MissingMasterKeyError) as excinfo:
            await SettingsStore(master_key=None).load(db_session)

        assert "MASTER_KEY" in str(excinfo.value)

    async def test_a_different_master_key_is_detected(
        self, db_session: AsyncSession
    ) -> None:
        await SettingsStore(master_key=MASTER_KEY).save(
            db_session, "database.password", "hunter2"
        )

        with pytest.raises(MasterKeyMismatchError) as excinfo:
            await SettingsStore(master_key="a-different-key").load(db_session)

        assert "different MASTER_KEY" in str(excinfo.value)

    async def test_plain_values_still_load_without_a_master_key(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        """Only secrets fail closed; the rest must keep working."""
        await store.save(db_session, "database.host", "h")

        loaded = await SettingsStore(master_key=None).load(db_session)

        assert loaded == {"database.host": "h"}


class TestValidation:
    """The store rejects what the registry rejects."""

    async def test_unknown_key_is_refused(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        with pytest.raises(KeyError):
            await store.save(db_session, "database.typo", "x")

    async def test_invalid_choice_is_refused(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        with pytest.raises(InvalidConfigurationError):
            await store.save(db_session, "database.type", "mysql")

    async def test_bootstrap_keys_cannot_be_stored(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        """The master key in the store would be encrypted with itself."""
        with pytest.raises(KeyError):
            await store.save(db_session, "bootstrap.master_key", "x")

    async def test_a_hand_inserted_bootstrap_row_cannot_replace_the_master_key(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        """Regression: the registry used to expose every key to the store.

        A row written directly into the table as ``bootstrap.master_key`` was read
        as an override, which would have replaced the key used to decrypt the
        store with one supplied through the database.
        """
        db_session.add(
            AppSetting(key="bootstrap.master_key", value='"attacker-key"', is_secret=False)
        )
        db_session.add(AppSetting(key="database.host", value='"h"', is_secret=False))
        await db_session.flush()

        loaded = await store.load(db_session)

        assert loaded == {"database.host": "h"}

    async def test_unknown_row_is_skipped_on_load(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        """A retired key must not prevent startup."""
        db_session.add(AppSetting(key="database.retired", value='"x"', is_secret=False))
        await db_session.flush()

        assert await store.load(db_session) == {}


class TestDelete:
    """Clearing an override restores the fallback chain."""

    async def test_removes_the_row(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        await store.save(db_session, "database.host", "h")
        assert await store.delete(db_session, "database.host") is True
        assert await store.load(db_session) == {}

    async def test_reports_when_there_was_nothing(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        assert await store.delete(db_session, "database.host") is False

    async def test_does_not_touch_other_keys(
        self, db_session: AsyncSession, store: SettingsStore
    ) -> None:
        await store.save(db_session, "database.host", "h")
        await store.save(db_session, "database.port", 5432)

        await store.delete(db_session, "database.host")

        assert await store.load(db_session) == {"database.port": 5432}


class TestMasterKeyReporting:
    def test_has_master_key(self) -> None:
        assert SettingsStore(master_key="k").has_master_key is True
        assert SettingsStore(master_key=None).has_master_key is False
        assert SettingsStore(master_key="").has_master_key is False
