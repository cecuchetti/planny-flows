"""Payment API tests.

Same fixture as ``test_loans.py``: a real application, a real HTTP client and an
in-memory SQLite database created from the model metadata, so the tests exercise
the router → service → repository path rather than mocking it.
"""

from __future__ import annotations

import itertools
from collections.abc import AsyncIterator
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from planny_api.dependencies import get_db
from planny_api.main import create_app
from planny_core.database import Base
from planny_core.models import Payment
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


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
        value.session_factory = factory  # type: ignore[attr-defined]
        yield value
    await engine.dispose()


@pytest.fixture
async def db(client: AsyncClient) -> AsyncIterator[AsyncSession]:
    """A session on the same engine the client uses, for direct fixtures."""
    factory = client.session_factory  # type: ignore[attr-defined]
    async with factory() as session:
        yield session
        await session.commit()


_borrower_counter = itertools.count(1)


async def make_borrower(client: AsyncClient) -> int:
    """A fresh borrower: the directory rejects a duplicate normalized name."""
    response = await client.post(
        "/api/v1/borrowers",
        json={"firstName": "Ana", "lastName": f"Pérez {next(_borrower_counter)}"},
    )
    assert response.status_code == 201, response.text
    return int(response.json()["borrower"]["id"])


def loan_payload(borrower_id: int, **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "borrowerId": borrower_id,
        "amount": "1000.00",
        "currency": "USD",
        "date": "2026-10-07",
        "concept": "Préstamo personal",
        "lender": "Ecuche",
        "city": "Córdoba",
    }
    body.update(overrides)
    return body


async def make_loan(client: AsyncClient, **overrides: object) -> int:
    borrower_id = await make_borrower(client)
    response = await client.post("/api/v1/loans", json=loan_payload(borrower_id, **overrides))
    assert response.status_code == 201, response.text
    return int(response.json()["loan"]["id"])


def error(response: object) -> dict[str, object]:
    return response.json()["error"]  # type: ignore[attr-defined]


async def register(client: AsyncClient, loan_id: int, amount: object) -> dict[str, object]:
    response = await client.post(f"/api/v1/loans/{loan_id}/payments", json={"amount": amount})
    assert response.status_code == 201, response.text
    return response.json()["payment"]


async def balance(client: AsyncClient, loan_id: int) -> str:
    response = await client.get(f"/api/v1/loans/{loan_id}")
    assert response.status_code == 200, response.text
    return str(response.json()["loan"]["pendingBalance"])


@pytest.mark.asyncio
async def test_pay_happy_registers_and_drops_the_balance(client: AsyncClient) -> None:
    loan_id = await make_loan(client)
    assert await balance(client, loan_id) == "1000.00"

    payment = await register(client, loan_id, "250.50")

    assert payment["amount"] == "250.50"
    assert payment["snapshot"]["pendingBalance"] == "749.50"
    assert payment["snapshot"]["totalPaid"] == "250.50"
    assert payment["snapshot"]["advancePaid"] == "0.00"
    assert payment["snapshot"]["paymentsHistory"] == [
        {"id": payment["id"], "amount": "250.50"}
    ]
    assert await balance(client, loan_id) == "749.50"


@pytest.mark.asyncio
async def test_pay_advance_snapshot_records_the_advance_in_effect(client: AsyncClient) -> None:
    loan_id = await make_loan(client, amount="1000.00", advancePaid="200.00")

    payment = await register(client, loan_id, "300.00")

    # The snapshot carries the advance that was in effect at that moment.
    assert payment["snapshot"]["advancePaid"] == "200.00"
    assert payment["snapshot"]["pendingBalance"] == "500.00"
    assert payment["snapshot"]["totalPaid"] == "300.00"
    assert await balance(client, loan_id) == "500.00"


@pytest.mark.asyncio
async def test_pay_over_the_outstanding_balance_is_rejected(client: AsyncClient) -> None:
    loan_id = await make_loan(client, amount="1000.00", advancePaid="100.00")
    await register(client, loan_id, "400.00")

    response = await client.post(
        f"/api/v1/loans/{loan_id}/payments", json={"amount": "500.01"}
    )

    assert response.status_code == 400, response.text
    assert error(response)["code"] == "BAD_USER_INPUT"
    assert "saldo pendiente" in str(error(response)["data"])
    # Nothing was written: the balance is unchanged.
    assert await balance(client, loan_id) == "500.00"


@pytest.mark.asyncio
@pytest.mark.parametrize("amount", ["0", "-1", "", "  ", "abc", None])
async def test_pay_nonpositive_or_unparsable_is_rejected(
    client: AsyncClient, amount: object
) -> None:
    loan_id = await make_loan(client)

    response = await client.post(f"/api/v1/loans/{loan_id}/payments", json={"amount": amount})

    assert response.status_code == 400, response.text
    assert error(response)["code"] == "BAD_USER_INPUT"
    assert await balance(client, loan_id) == "1000.00"


@pytest.mark.asyncio
async def test_pay_unknown_loan_is_not_found(client: AsyncClient) -> None:
    response = await client.post("/api/v1/loans/9999/payments", json={"amount": "10"})

    assert response.status_code == 404
    assert error(response)["code"] == "ENTITY_NOT_FOUND"
    assert error(response)["message"] == "No encontramos ese préstamo."


@pytest.mark.asyncio
async def test_history_returns_oldest_first(client: AsyncClient) -> None:
    loan_id = await make_loan(client, amount="1000.00")
    first = await register(client, loan_id, "100.00")
    second = await register(client, loan_id, "200.00")

    response = await client.get(f"/api/v1/loans/{loan_id}/payments")

    assert response.status_code == 200, response.text
    assert [item["id"] for item in response.json()["payments"]] == [first["id"], second["id"]]
    assert [item["amount"] for item in response.json()["payments"]] == ["100.00", "200.00"]


@pytest.mark.asyncio
async def test_history_of_an_unknown_loan_is_not_found(client: AsyncClient) -> None:
    response = await client.get("/api/v1/loans/9999/payments")

    assert response.status_code == 404
    assert error(response)["code"] == "ENTITY_NOT_FOUND"


@pytest.mark.asyncio
async def test_snapshot_is_frozen_when_a_later_payment_is_deleted(
    client: AsyncClient, db: AsyncSession
) -> None:
    loan_id = await make_loan(client, amount="1000.00")
    first = await register(client, loan_id, "100.00")
    second = await register(client, loan_id, "200.00")
    before = await client.get(f"/api/v1/loans/{loan_id}/payments")
    first_before = before.json()["payments"][0]
    # The snapshot is what the row holds, not what the create response said: the
    # row's own id is written after its insert, and a missed write would leave
    # the stored entry reading ``id: None`` while the response still looked right.
    db.expire_all()
    stored_before = (
        await db.execute(select(Payment).where(Payment.id == first["id"]))
    ).scalars().one()
    assert stored_before.paymentsHistoryAtPayment == [{"id": first["id"], "amount": "100.00"}]

    deleted = await client.delete(f"/api/v1/loans/{loan_id}/payments/{second['id']}")
    assert deleted.status_code == 204

    after = await client.get(f"/api/v1/loans/{loan_id}/payments")
    assert [item["id"] for item in after.json()["payments"]] == [first["id"]]
    # Byte-identical: the first payment's snapshot was not rewritten.
    assert after.json()["payments"][0] == first_before
    db.expire_all()
    stored_after = (
        await db.execute(select(Payment).where(Payment.id == first["id"]))
    ).scalars().one()
    assert stored_after.paymentsHistoryAtPayment == stored_before.paymentsHistoryAtPayment


@pytest.mark.asyncio
async def test_pay_delete_recomputes_the_balance(client: AsyncClient) -> None:
    loan_id = await make_loan(client, amount="1000.00")
    payment = await register(client, loan_id, "400.00")
    assert await balance(client, loan_id) == "600.00"

    response = await client.delete(f"/api/v1/loans/{loan_id}/payments/{payment['id']}")

    assert response.status_code == 204
    assert await balance(client, loan_id) == "1000.00"
    listed = await client.get(f"/api/v1/loans/{loan_id}/payments")
    assert listed.json()["payments"] == []


@pytest.mark.asyncio
async def test_pay_delete_unknown_is_not_found(client: AsyncClient) -> None:
    loan_id = await make_loan(client)
    other_loan_id = await make_loan(client)
    elsewhere = await register(client, other_loan_id, "10.00")

    missing = await client.delete(f"/api/v1/loans/{loan_id}/payments/9999")
    assert missing.status_code == 404
    assert error(missing)["code"] == "ENTITY_NOT_FOUND"
    assert error(missing)["message"] == "No encontramos ese pago."

    # A payment id that belongs to another loan is not reachable through this one.
    foreign = await client.delete(f"/api/v1/loans/{loan_id}/payments/{elsewhere['id']}")
    assert foreign.status_code == 404
    assert error(foreign)["code"] == "ENTITY_NOT_FOUND"


@pytest.mark.asyncio
async def test_deleting_a_loan_deletes_its_payments(client: AsyncClient, db: AsyncSession) -> None:
    loan_id = await make_loan(client)
    await register(client, loan_id, "10.00")
    await register(client, loan_id, "20.00")

    response = await client.delete(f"/api/v1/loans/{loan_id}")

    assert response.status_code == 204
    remaining = await db.execute(select(Payment).where(Payment.loan_id == loan_id))
    assert list(remaining.scalars().all()) == []


@pytest.mark.asyncio
async def test_amount_below_what_was_collected_is_rejected(client: AsyncClient) -> None:
    """A pure amount cut below the collected total, with the advance field sent too."""
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "900.00")

    response = await client.put(
        f"/api/v1/loans/{loan_id}", json={"amount": "100.00", "advancePaid": "0.00"}
    )

    assert response.status_code == 400, response.text
    assert error(response)["code"] == "BAD_USER_INPUT"
    # The request moved the amount, so the amount is what is blamed.
    fields = error(response)["data"]["fields"]
    assert "amount" in fields, fields
    assert "advancePaid" not in fields, fields
    assert await balance(client, loan_id) == "100.00"


@pytest.mark.asyncio
async def test_amount_equal_to_what_was_collected_is_accepted(client: AsyncClient) -> None:
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "400.00")

    response = await client.put(f"/api/v1/loans/{loan_id}", json={"amount": "400.00"})

    assert response.status_code == 200, response.text
    assert response.json()["loan"]["pendingBalance"] == "0.00"


@pytest.mark.asyncio
async def test_currency_cannot_change_once_a_payment_exists(client: AsyncClient) -> None:
    loan_id = await make_loan(client, amount="1000.00", currency="USD")
    await register(client, loan_id, "100.00")

    response = await client.put(f"/api/v1/loans/{loan_id}", json={"currency": "ARS"})

    assert response.status_code == 400, response.text
    assert error(response)["code"] == "BAD_USER_INPUT"
    assert "moneda" in str(error(response)["data"])


@pytest.mark.asyncio
async def test_currency_still_changes_without_payments_or_advance(client: AsyncClient) -> None:
    loan_id = await make_loan(client, amount="1000.00", currency="USD")

    response = await client.put(f"/api/v1/loans/{loan_id}", json={"currency": "ARS"})

    assert response.status_code == 200, response.text
    assert response.json()["loan"]["currency"] == "ARS"


@pytest.mark.asyncio
async def test_a_row_with_a_recomputed_snapshot_is_readable(
    client: AsyncClient, db: AsyncSession
) -> None:
    """A migrated row carries a snapshot the API never computed; it must read back.

    The migration recomputes snapshots for legacy payments, so the stored shape
    is the contract the reader has to honour — not one only its own writer emits.
    """
    loan_id = await make_loan(client, amount="1000.00", advancePaid="100.00")
    db.add(
        Payment(
            loan_id=loan_id,
            amount=Decimal("250.00"),
            pendingBalanceAtPayment=Decimal("650.00"),
            totalPaidAtPayment=Decimal("350.00"),
            advancePaidAtPayment=Decimal("100.00"),
            paymentsHistoryAtPayment=[{"id": 1, "amount": 250.00}],
        )
    )
    await db.flush()

    listed = await client.get(f"/api/v1/loans/{loan_id}/payments")
    assert listed.status_code == 200, listed.text
    payment = listed.json()["payments"][0]
    assert payment["amount"] == "250.00"
    assert payment["snapshot"]["pendingBalance"] == "650.00"
    assert payment["snapshot"]["totalPaid"] == "350.00"
    assert payment["snapshot"]["advancePaid"] == "100.00"
    assert payment["snapshot"]["paymentsHistory"] == [{"id": 1, "amount": "250.00"}]
    # The derived balance counts the migrated payment too.
    assert await balance(client, loan_id) == "650.00"


@pytest.mark.asyncio
async def test_payment_date_is_the_server_time_not_the_payload(client: AsyncClient) -> None:
    loan_id = await make_loan(client)
    response = await client.post(
        f"/api/v1/loans/{loan_id}/payments",
        json={"amount": "10.00", "date": "1999-01-01T00:00:00"},
    )

    assert response.status_code == 201, response.text
    assert response.json()["payment"]["date"].startswith("20")
