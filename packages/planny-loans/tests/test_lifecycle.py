"""Loan lifecycle API tests.

Same fixture as ``test_loans.py`` and ``test_payments.py``: a real application, a
real HTTP client and an in-memory SQLite database created from the model
metadata, so the tests exercise the router → service → repository path rather
than mocking it.

One test per row of the plan's I/O matrix, plus the guards the matrix implies
(closing an already-closed loan, reopening an active one) and the fully-paid
reopen edge the plan's ``REOPEN`` row has to survive.
"""

from __future__ import annotations

import itertools
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from planny_api.dependencies import get_db
from planny_api.main import create_app
from planny_core.database import Base
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


_borrower_counter = itertools.count(1)


async def make_borrower(client: AsyncClient) -> int:
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


async def get_loan(client: AsyncClient, loan_id: int) -> dict[str, object]:
    response = await client.get(f"/api/v1/loans/{loan_id}")
    assert response.status_code == 200, response.text
    return dict(response.json()["loan"])


async def register(client: AsyncClient, loan_id: int, amount: object) -> dict[str, object]:
    response = await client.post(f"/api/v1/loans/{loan_id}/payments", json={"amount": amount})
    assert response.status_code == 201, response.text
    return dict(response.json()["payment"])


async def balance(client: AsyncClient, loan_id: int) -> str:
    return str((await get_loan(client, loan_id))["pendingBalance"])


async def reverse(client: AsyncClient, loan_id: int, payment_id: int) -> object:
    return await client.delete(f"/api/v1/loans/{loan_id}/payments/{payment_id}")


async def close(client: AsyncClient, loan_id: int) -> object:
    return await client.post(f"/api/v1/loans/{loan_id}/close")


async def reopen(client: AsyncClient, loan_id: int) -> object:
    return await client.post(f"/api/v1/loans/{loan_id}/reopen")


@pytest.mark.asyncio
async def test_a_new_loan_is_active_with_no_close_record(client: AsyncClient) -> None:
    loan_id = await make_loan(client)
    loan = await get_loan(client, loan_id)
    assert loan["status"] == "active"
    assert loan["closedAt"] is None
    assert loan["writtenOffAmount"] is None


@pytest.mark.asyncio
async def test_auto_close_when_a_payment_reaches_zero(client: AsyncClient) -> None:
    """AUTO_CLOSE: a payment that settles the balance closes the loan."""
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "1000.00")

    loan = await get_loan(client, loan_id)
    assert loan["status"] == "closed"
    assert loan["closedAt"] is not None
    assert loan["pendingBalance"] == "0.00"


@pytest.mark.asyncio
async def test_auto_reopen_when_a_reversal_raises_the_balance(client: AsyncClient) -> None:
    """AUTO_REOPEN: reversing the closing payment reopens the loan."""
    loan_id = await make_loan(client, amount="1000.00")
    payment = await register(client, loan_id, "1000.00")
    assert (await get_loan(client, loan_id))["status"] == "closed"

    assert (await reverse(client, loan_id, payment["id"])).status_code == 204

    loan = await get_loan(client, loan_id)
    assert loan["status"] == "active"
    assert loan["closedAt"] is None
    assert loan["pendingBalance"] == "1000.00"


@pytest.mark.asyncio
async def test_manual_close_condones_the_outstanding_balance(client: AsyncClient) -> None:
    """MANUAL_CLOSE_WRITEOFF: the write-off is recorded and the balance settles."""
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "300.00")

    response = await close(client, loan_id)

    assert response.status_code == 200, response.text
    loan = response.json()["loan"]
    assert loan["status"] == "closed"
    assert loan["closedAt"] is not None
    assert loan["writtenOffAmount"] == "700.00"
    assert loan["pendingBalance"] == "0.00"


@pytest.mark.asyncio
async def test_manual_close_with_no_outstanding_records_no_writeoff(client: AsyncClient) -> None:
    """MANUAL_CLOSE_PAID: a zero balance closes without a write-off line.

    The loan is taken to a zero balance through its own flows (pay it off, then
    reopen it), so the close path sees an active loan whose pending is exactly
    zero and must not invent a write-off.
    """
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "1000.00")
    assert (await reopen(client, loan_id)).json()["loan"]["status"] == "active"

    response = await close(client, loan_id)

    assert response.status_code == 200, response.text
    loan = response.json()["loan"]
    assert loan["status"] == "closed"
    assert loan["closedAt"] is not None
    assert loan["writtenOffAmount"] is None
    assert loan["pendingBalance"] == "0.00"


@pytest.mark.asyncio
async def test_reopen_clears_close_and_writeoff(client: AsyncClient) -> None:
    """REOPEN: a closed loan returns to active with both close fields cleared."""
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "300.00")
    assert (await close(client, loan_id)).json()["loan"]["writtenOffAmount"] == "700.00"

    response = await reopen(client, loan_id)

    assert response.status_code == 200, response.text
    loan = response.json()["loan"]
    assert loan["status"] == "active"
    assert loan["closedAt"] is None
    assert loan["writtenOffAmount"] is None
    # The condoned amount returns to the balance.
    assert loan["pendingBalance"] == "700.00"


@pytest.mark.asyncio
async def test_reopen_a_fully_paid_loan_stays_active(client: AsyncClient) -> None:
    """Reopening a fully-paid loan must not be immediately re-closed by the
    automatic evaluation: the balance is still zero, but the operator asked for
    it, so it stays active."""
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "1000.00")

    response = await reopen(client, loan_id)

    assert response.status_code == 200, response.text
    loan = response.json()["loan"]
    assert loan["status"] == "active"
    assert loan["closedAt"] is None
    assert loan["writtenOffAmount"] is None
    assert loan["pendingBalance"] == "0.00"


@pytest.mark.asyncio
async def test_reopened_fully_paid_loan_survives_a_descriptive_edit(
    client: AsyncClient,
) -> None:
    """The automatic evaluation is transition-based, not state-based: an active
    loan whose balance is already zero stays active when a descriptive edit
    re-runs the evaluation."""
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "1000.00")
    assert (await get_loan(client, loan_id))["status"] == "closed"
    assert (await reopen(client, loan_id)).json()["loan"]["status"] == "active"

    descriptive = await client.put(
        f"/api/v1/loans/{loan_id}", json={"concept": "Viaje", "lender": "Otro"}
    )

    assert descriptive.status_code == 200, descriptive.text
    loan = descriptive.json()["loan"]
    assert loan["status"] == "active"
    assert loan["closedAt"] is None


@pytest.mark.asyncio
async def test_reversal_on_a_written_off_loan_clears_the_writeoff(
    client: AsyncClient,
) -> None:
    """Auto-reopen clears the write-off: a condoned amount only means anything
    while the loan is closed, and a reversal that raises the balance back above
    zero reopens the loan — otherwise a dangling write-off would survive with no
    other path to clear it."""
    loan_id = await make_loan(client, amount="1000.00")
    payment = await register(client, loan_id, "300.00")
    assert (await close(client, loan_id)).json()["loan"]["writtenOffAmount"] == "700.00"

    assert (await reverse(client, loan_id, payment["id"])).status_code == 204

    loan = await get_loan(client, loan_id)
    assert loan["status"] == "active"
    assert loan["closedAt"] is None
    assert loan["writtenOffAmount"] is None
    # The condoned amount and the reversed payment both return to the balance.
    assert loan["pendingBalance"] == "1000.00"


@pytest.mark.asyncio
async def test_closed_loan_rejects_a_new_payment(client: AsyncClient) -> None:
    """CLOSED_REJECTS_PAYMENT: a closed loan accepts no new collection."""
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "1000.00")
    assert (await get_loan(client, loan_id))["status"] == "closed"

    response = await client.post(f"/api/v1/loans/{loan_id}/payments", json={"amount": "10.00"})

    assert response.status_code == 400, response.text
    assert error(response)["code"] == "BAD_USER_INPUT"
    assert "cerrado" in str(error(response)["data"])


@pytest.mark.asyncio
async def test_closed_loan_rejects_balance_edits_but_allows_descriptive(
    client: AsyncClient,
) -> None:
    """CLOSED_EDIT_GUARD: amount/advance/currency are locked; descriptive pass."""
    borrower_id = await make_borrower(client)
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "1000.00")
    assert (await get_loan(client, loan_id))["status"] == "closed"

    for overrides in ({"amount": "2000.00"}, {"advancePaid": "10.00"}, {"currency": "ARS"}):
        response = await client.put(
            f"/api/v1/loans/{loan_id}", json=loan_payload(borrower_id, **overrides)
        )
        assert response.status_code == 400, response.text
        assert error(response)["code"] == "BAD_USER_INPUT"
        assert "cerrado" in str(error(response)["data"])

    # A descriptive-only edit still goes through, and the close record survives.
    descriptive = await client.put(
        f"/api/v1/loans/{loan_id}",
        json={"concept": "Viaje", "lender": "Otro", "city": "Villa María"},
    )
    assert descriptive.status_code == 200, descriptive.text
    loan = descriptive.json()["loan"]
    assert loan["concept"] == "Viaje"
    assert loan["status"] == "closed"
    assert loan["closedAt"] is not None


@pytest.mark.asyncio
async def test_a_descriptive_edit_does_not_move_the_close_date(client: AsyncClient) -> None:
    """Editing a closed loan's description must not restamp its ``closedAt``."""
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "1000.00")
    closed_at = (await get_loan(client, loan_id))["closedAt"]

    response = await client.put(f"/api/v1/loans/{loan_id}", json={"concept": "Viaje"})

    assert response.status_code == 200, response.text
    assert response.json()["loan"]["closedAt"] == closed_at


@pytest.mark.asyncio
async def test_list_splits_active_and_closed_with_counts_and_order(client: AsyncClient) -> None:
    """SPLIT_LIST: active newest first, closed most-recently-closed first."""
    first = await make_loan(client)
    second = await make_loan(client)
    third = await make_loan(client)
    assert (await close(client, second)).status_code == 200
    assert (await close(client, third)).status_code == 200

    response = await client.get("/api/v1/loans")

    assert response.status_code == 200, response.text
    loans = response.json()["loans"]
    assert [loan["id"] for loan in loans["active"]] == [first]
    assert [loan["id"] for loan in loans["closed"]] == [third, second]


@pytest.mark.asyncio
async def test_close_an_already_closed_loan_is_rejected(client: AsyncClient) -> None:
    loan_id = await make_loan(client, amount="1000.00")
    await register(client, loan_id, "300.00")
    assert (await close(client, loan_id)).status_code == 200

    response = await close(client, loan_id)

    assert response.status_code == 400, response.text
    assert error(response)["code"] == "BAD_USER_INPUT"
    # The recorded write-off is untouched by the refused second close.
    assert (await get_loan(client, loan_id))["writtenOffAmount"] == "700.00"


@pytest.mark.asyncio
async def test_reopen_an_active_loan_is_rejected(client: AsyncClient) -> None:
    loan_id = await make_loan(client, amount="1000.00")

    response = await reopen(client, loan_id)

    assert response.status_code == 400, response.text
    assert error(response)["code"] == "BAD_USER_INPUT"
    assert (await get_loan(client, loan_id))["status"] == "active"
