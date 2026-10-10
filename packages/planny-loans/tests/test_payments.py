"""Payment API tests.

Same fixture as ``test_loans.py``: a real application, a real HTTP client and an
in-memory SQLite database created from the model metadata, so the tests exercise
the router → service → repository path rather than mocking it.

The reversal rows of the plan's matrix live here: a payment is never deleted, it
is marked with ``reversedAt`` and stops counting until the reversal is undone.
"""

from __future__ import annotations

import itertools
from collections.abc import AsyncIterator
from datetime import datetime
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


async def history(client: AsyncClient, loan_id: int) -> list[dict[str, object]]:
    """The loan's payment history as the API returns it, reversed rows included."""
    response = await client.get(f"/api/v1/loans/{loan_id}/payments")
    assert response.status_code == 200, response.text
    return list(response.json()["payments"])


async def reverse(client: AsyncClient, loan_id: int, payment_id: int) -> object:
    """The reversal the client already calls: ``DELETE`` on the payment itself."""
    return await client.delete(f"/api/v1/loans/{loan_id}/payments/{payment_id}")


async def undo_reversal(client: AsyncClient, loan_id: int, payment_id: int) -> object:
    """The dedicated endpoint that undoes a reversal."""
    return await client.delete(f"/api/v1/loans/{loan_id}/payments/{payment_id}/reversal")


def stored_history(payment: Payment, payment_id: int) -> dict[str, object]:
    """The stored snapshot entry for ``payment_id``, straight off the column."""
    return next(
        entry for entry in payment.paymentsHistoryAtPayment if entry["id"] == payment_id
    )


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
async def test_snapshot_is_frozen_when_a_later_payment_is_reversed(
    client: AsyncClient, db: AsyncSession
) -> None:
    """Reversing a later payment leaves an earlier snapshot byte-identical."""
    loan_id = await make_loan(client, amount="1000.00")
    first = await register(client, loan_id, "100.00")
    second = await register(client, loan_id, "200.00")
    first_before = (await history(client, loan_id))[0]
    # The snapshot is what the row holds, not what the create response said: the
    # row's own id is written after its insert, and a missed write would leave
    # the stored entry reading ``id: None`` while the response still looked right.
    db.expire_all()
    stored_before = (
        await db.execute(select(Payment).where(Payment.id == first["id"]))
    ).scalars().one()
    assert stored_before.paymentsHistoryAtPayment == [{"id": first["id"], "amount": "100.00"}]

    reversed_response = await reverse(client, loan_id, second["id"])
    assert reversed_response.status_code == 204  # type: ignore[attr-defined]

    after = await history(client, loan_id)
    # The reversed payment is still listed; only its mark changed.
    assert [item["id"] for item in after] == [first["id"], second["id"]]
    # Byte-identical: the first payment's snapshot was not rewritten, and the
    # first payment itself was not reversed.
    assert after[0] == first_before
    db.expire_all()
    stored_after = (
        await db.execute(select(Payment).where(Payment.id == first["id"]))
    ).scalars().one()
    assert stored_after.paymentsHistoryAtPayment == stored_before.paymentsHistoryAtPayment


@pytest.mark.asyncio
async def test_reverse_marks_the_row_and_raises_the_balance(client: AsyncClient) -> None:
    """REVERSE_HAPPY: the row survives marked, and the balance goes back up."""
    loan_id = await make_loan(client, amount="1000.00")
    payment = await register(client, loan_id, "400.00")
    assert await balance(client, loan_id) == "600.00"
    assert payment["reversedAt"] is None

    response = await reverse(client, loan_id, payment["id"])

    assert response.status_code == 204
    assert await balance(client, loan_id) == "1000.00"
    # LIST_SHOWS_REVERSED: the reversed payment is still in the history, marked
    # with the date the server stamped.
    listed = await history(client, loan_id)
    assert [item["id"] for item in listed] == [payment["id"]]
    assert listed[0]["reversedAt"] is not None
    assert datetime.fromisoformat(str(listed[0]["reversedAt"])) > datetime.fromisoformat(
        str(payment["createdAt"])
    )


@pytest.mark.asyncio
async def test_reverse_recomputes_the_balance_from_the_active_payments(
    client: AsyncClient,
) -> None:
    """REVERSE_RECALC: only the payment still in force counts."""
    loan_id = await make_loan(client, amount="1000.00")
    first = await register(client, loan_id, "300.00")
    await register(client, loan_id, "200.00")
    assert await balance(client, loan_id) == "500.00"

    assert (await reverse(client, loan_id, first["id"])).status_code == 204

    assert await balance(client, loan_id) == "800.00"
    # Reversing frees the money up again: the reversed 300.00 is collectable.
    replacement = await register(client, loan_id, "300.00")
    assert replacement["amount"] == "300.00"
    assert await balance(client, loan_id) == "500.00"


@pytest.mark.asyncio
async def test_reverse_annotates_the_snapshots_that_name_the_payment(
    client: AsyncClient, db: AsyncSession
) -> None:
    """REVERSE_SNAPSHOT: a later receipt shows the reversal, without a rewrite."""
    loan_id = await make_loan(client, amount="1000.00")
    first = await register(client, loan_id, "100.00")
    second = await register(client, loan_id, "200.00")
    # The later snapshot names both payments, and neither carries a reversal mark.
    assert (await history(client, loan_id))[1]["snapshot"]["paymentsHistory"] == [
        {"id": first["id"], "amount": "100.00"},
        {"id": second["id"], "amount": "200.00"},
    ]

    assert (await reverse(client, loan_id, first["id"])).status_code == 204

    later = (await history(client, loan_id))[1]
    entries = later["snapshot"]["paymentsHistory"]
    reversed_entry = next(entry for entry in entries if entry["id"] == first["id"])
    assert reversed_entry["amount"] == "100.00"
    assert reversed_entry["reversedAt"] is not None
    # The amounts frozen on the later row are untouched: a reversal moves no money.
    assert later["snapshot"]["pendingBalance"] == "700.00"
    assert later["snapshot"]["totalPaid"] == "300.00"
    # And the annotation is what is stored, not only what was returned.
    db.expire_all()
    stored = (
        await db.execute(select(Payment).where(Payment.id == second["id"]))
    ).scalars().one()
    assert stored_history(stored, first["id"])["reversedAt"] is not None
    assert stored_history(stored, second["id"]) == {"id": second["id"], "amount": "200.00"}


@pytest.mark.asyncio
async def test_reversing_twice_is_rejected(client: AsyncClient) -> None:
    """REVERSE_TWICE: an operator error, not a no-op — nothing moves."""
    loan_id = await make_loan(client, amount="1000.00")
    payment = await register(client, loan_id, "400.00")
    assert (await reverse(client, loan_id, payment["id"])).status_code == 204
    stamped = (await history(client, loan_id))[0]["reversedAt"]

    response = await reverse(client, loan_id, payment["id"])

    assert response.status_code == 400, response.text
    assert error(response)["code"] == "BAD_USER_INPUT"
    assert error(response)["message"] == "Este pago ya está revertido."
    assert await balance(client, loan_id) == "1000.00"
    # The date the receipt may already quote did not move.
    assert (await history(client, loan_id))[0]["reversedAt"] == stamped


@pytest.mark.asyncio
async def test_undoing_a_reversal_puts_the_payment_back(client: AsyncClient) -> None:
    """REVERSE_UNREVERSE: a mistaken reversal costs nothing."""
    loan_id = await make_loan(client, amount="1000.00")
    first = await register(client, loan_id, "100.00")
    second = await register(client, loan_id, "200.00")
    assert (await reverse(client, loan_id, first["id"])).status_code == 204
    assert await balance(client, loan_id) == "800.00"

    response = await undo_reversal(client, loan_id, first["id"])

    assert response.status_code == 204
    assert await balance(client, loan_id) == "700.00"
    listed = await history(client, loan_id)
    assert [item["reversedAt"] for item in listed] == [None, None]
    # The later snapshot stops showing the reversal, back to the bytes it froze.
    assert listed[1]["snapshot"]["paymentsHistory"] == [
        {"id": first["id"], "amount": "100.00"},
        {"id": second["id"], "amount": "200.00"},
    ]


@pytest.mark.asyncio
async def test_undoing_a_reversal_that_never_happened_is_rejected(client: AsyncClient) -> None:
    loan_id = await make_loan(client, amount="1000.00")
    payment = await register(client, loan_id, "100.00")

    response = await undo_reversal(client, loan_id, payment["id"])

    assert response.status_code == 400, response.text
    assert error(response)["code"] == "BAD_USER_INPUT"


@pytest.mark.asyncio
async def test_reversal_unknown_is_not_found(client: AsyncClient) -> None:
    """REVERSE_UNKNOWN: an id that is absent, or belongs to another loan."""
    loan_id = await make_loan(client)
    other_loan_id = await make_loan(client)
    elsewhere = await register(client, other_loan_id, "10.00")

    missing = await reverse(client, loan_id, 9999)
    assert missing.status_code == 404
    assert error(missing)["code"] == "ENTITY_NOT_FOUND"
    assert error(missing)["message"] == "No encontramos ese pago."

    # A payment id that belongs to another loan is not reachable through this one.
    foreign = await reverse(client, loan_id, elsewhere["id"])
    assert foreign.status_code == 404
    assert error(foreign)["code"] == "ENTITY_NOT_FOUND"

    # And undoing a reversal is scoped to the loan the same way.
    undone = await undo_reversal(client, loan_id, elsewhere["id"])
    assert undone.status_code == 404
    assert error(undone)["code"] == "ENTITY_NOT_FOUND"


@pytest.mark.asyncio
async def test_deleting_a_loan_deletes_its_active_and_reversed_payments(
    client: AsyncClient, db: AsyncSession
) -> None:
    """LOAN_DELETE_STILL_CASCADES: the loan takes every row, reversed included."""
    loan_id = await make_loan(client, amount="1000.00")
    active = await register(client, loan_id, "10.00")
    reversed_payment = await register(client, loan_id, "20.00")
    assert (await reverse(client, loan_id, reversed_payment["id"])).status_code == 204

    response = await client.delete(f"/api/v1/loans/{loan_id}")

    assert response.status_code == 204
    remaining = await db.execute(select(Payment).where(Payment.loan_id == loan_id))
    assert list(remaining.scalars().all()) == []
    assert active["reversedAt"] is None


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
async def test_the_collected_guard_still_counts_reversed_payments(client: AsyncClient) -> None:
    """GUARD_AUDITS_EVER_COLLECTED: a reversal takes money out of the balance,
    not out of the record of what was handed over.

    The amount may not drop below the audit total: otherwise the reversal could
    be undone afterwards and drive the derived balance below zero, where every
    later payment is refused and nothing can pay it back.
    """
    loan_id = await make_loan(client, amount="1000.00")
    payment = await register(client, loan_id, "900.00")
    assert (await reverse(client, loan_id, payment["id"])).status_code == 204
    # Reversed, so the balance is whole again...
    assert await balance(client, loan_id) == "1000.00"

    cut = await client.put(f"/api/v1/loans/{loan_id}", json={"amount": "100.00"})
    assert cut.status_code == 400, cut.text
    assert "cobrado" in str(error(cut)["data"])

    # ...and at the audit total the undo still lands on zero, never below it.
    allowed = await client.put(f"/api/v1/loans/{loan_id}", json={"amount": "900.00"})
    assert allowed.status_code == 200, allowed.text
    assert (await undo_reversal(client, loan_id, payment["id"])).status_code == 204
    assert await balance(client, loan_id) == "0.00"


@pytest.mark.asyncio
async def test_currency_stays_locked_once_every_payment_is_reversed(
    client: AsyncClient,
) -> None:
    """The currency lock follows money that was received, reversals included."""
    loan_id = await make_loan(client, amount="1000.00", currency="USD")
    payment = await register(client, loan_id, "100.00")
    assert (await reverse(client, loan_id, payment["id"])).status_code == 204

    response = await client.put(f"/api/v1/loans/{loan_id}", json={"currency": "ARS"})

    assert response.status_code == 400, response.text
    assert "moneda" in str(error(response)["data"])


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
