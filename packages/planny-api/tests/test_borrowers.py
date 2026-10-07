from __future__ import annotations

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from planny_core.database import Base
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.dependencies import get_db
from planny_api.main import create_app
from planny_api.modules.borrowers import repository


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    engine = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False})
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app = create_app()
    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as value:
        yield value
    await engine.dispose()


@pytest.mark.asyncio
async def test_borrower_crud_and_canonical_alias_parity(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/borrowers", json={"firstName": " Ana ", "lastName": "Pérez"}
    )
    assert response.status_code == 201
    borrower = response.json()["borrower"]
    assert borrower["firstName"] == "Ana"
    assert borrower["email"] is None

    alias = await client.get("/borrowers", params={"search": "pére"})
    canonical = await client.get("/api/v1/borrowers", params={"search": "pére"})
    assert alias.status_code == canonical.status_code == 200
    assert alias.json() == canonical.json()

    updated = await client.put(
        f"/borrowers/{borrower['id']}",
        json={"firstName": "Ana", "lastName": "Pérez", "phone": "11"},
    )
    assert updated.status_code == 200
    assert updated.json()["borrower"]["phone"] == "11"


@pytest.mark.asyncio
async def test_invalid_duplicate_missing_and_delete(client: AsyncClient) -> None:
    invalid = await client.post("/borrowers", json={"firstName": " ", "lastName": "Sosa"})
    assert invalid.status_code == 400
    assert invalid.json()["error"]["code"] == "BAD_USER_INPUT"
    assert invalid.json()["error"]["message"] == "Revisá los datos de la persona."
    created = await client.post("/borrowers", json={"firstName": "Luz", "lastName": "Sosa"})
    duplicate = await client.post("/borrowers", json={"firstName": " luz ", "lastName": " sosa "})
    assert duplicate.status_code == 409
    assert await client.delete(f"/borrowers/{created.json()['borrower']['id']}")
    missing = await client.get(f"/borrowers/{created.json()['borrower']['id']}")
    assert missing.status_code == 404
    assert missing.json()["error"]["message"] == "No encontramos esa persona."


@pytest.mark.asyncio
async def test_delete_is_blocked_when_a_future_loan_is_linked(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = await client.post("/borrowers", json={"firstName": "Mati", "lastName": "López"})
    monkeypatch.setattr(repository, "linked_loan_count", lambda db, borrower_id: _linked())
    response = await client.delete(f"/borrowers/{created.json()['borrower']['id']}")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


async def _linked() -> int:
    return 1


@pytest.mark.asyncio
async def test_link_count_propagates_unexpected_database_errors() -> None:
    db = AsyncMock()
    db.execute.side_effect = OperationalError("SELECT", {}, RuntimeError("database offline"))
    with pytest.raises(OperationalError):
        await repository.linked_loan_count(db, 1)
