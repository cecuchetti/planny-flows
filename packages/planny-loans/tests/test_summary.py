"""Portfolio summary API tests (Epic 6, FR30-36).

Same fixture as the other loan tests: a real application, a real HTTP client and
an in-memory SQLite database created from the model metadata, so the tests
exercise the router → service → repository path rather than mocking it.

The matrix rows that are data-shaped live here (SUMMARY_EMPTY,
SUMMARY_PER_CURRENCY, RECOVERY_RATE, NEAR_COMPLETION, RECENT_ACTIVITY,
COLLECTED_MONTH). The two navigation rows (DASHBOARD_LANDING, DASHBOARD_DRILL)
are behaviours of the client and are covered in Cypress.
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


async def register(client: AsyncClient, loan_id: int, amount: object) -> dict[str, object]:
    response = await client.post(f"/api/v1/loans/{loan_id}/payments", json={"amount": amount})
    assert response.status_code == 201, response.text
    return response.json()["payment"]


async def summary(client: AsyncClient) -> dict[str, object]:
    response = await client.get("/api/v1/loans/summary")
    assert response.status_code == 200, response.text
    return response.json()


def by_currency(body: dict[str, object], currency: str) -> dict[str, object]:
    entry = next(item for item in body["currencies"] if item["currency"] == currency)  # type: ignore[union-attr]
    return entry  # type: ignore[return-value]


@pytest.mark.asyncio
async def test_summary_empty_returns_empty_currencies_and_lists(client: AsyncClient) -> None:
    """SUMMARY_EMPTY: no loans → empty currencies and empty lists."""
    assert await summary(client) == {"currencies": [], "nearCompletion": [], "recentPayments": []}


@pytest.mark.asyncio
async def test_summary_reports_each_currency_separately(client: AsyncClient) -> None:
    """SUMMARY_PER_CURRENCY: every metric sits under its own currency."""
    usd = await make_loan(client, amount="1000.00", currency="USD", advancePaid="100.00")
    await make_loan(client, amount="2000.00", currency="ARS")
    await register(client, usd, "300.00")

    body = await summary(client)
    assert {item["currency"] for item in body["currencies"]} == {"USD", "ARS"}

    usd_card = by_currency(body, "USD")
    assert usd_card["principal"] == "1000.00"
    # collected = advance 100 + payment 300
    assert usd_card["collected"] == "400.00"
    assert usd_card["outstanding"] == "600.00"
    assert usd_card["writtenOff"] == "0.00"
    assert usd_card["activeCount"] == 1
    assert usd_card["closedCount"] == 0
    assert usd_card["averageOutstanding"] == "600.00"

    ars_card = by_currency(body, "ARS")
    assert ars_card["principal"] == "2000.00"
    assert ars_card["collected"] == "0.00"
    assert ars_card["outstanding"] == "2000.00"
    assert ars_card["averageOutstanding"] == "2000.00"


@pytest.mark.asyncio
async def test_recovery_rate_is_collected_over_principal(client: AsyncClient) -> None:
    """RECOVERY_RATE: ``collected / principal``, and 0 when nothing was collected."""
    usd = await make_loan(client, amount="1000.00", currency="USD", advancePaid="200.00")
    await register(client, usd, "300.00")
    await make_loan(client, amount="1000.00", currency="ARS")

    body = await summary(client)
    # collected 500 / principal 1000
    assert by_currency(body, "USD")["recoveryRate"] == "0.50"
    assert by_currency(body, "ARS")["recoveryRate"] == "0.00"


@pytest.mark.asyncio
async def test_near_completion_lists_active_loans_at_or_above_threshold(
    client: AsyncClient,
) -> None:
    """NEAR_COMPLETION: recovered ≥ 80% of principal, active only, with remaining."""
    hit = await make_loan(client, amount="1000.00", currency="USD", advancePaid="800.00")
    miss = await make_loan(client, amount="1000.00", currency="USD", advancePaid="799.00")
    # Fully paid and closed: recovered 100% but no longer active, so excluded.
    closed = await make_loan(client, amount="100.00", currency="USD")
    await register(client, closed, "100.00")

    body = await summary(client)
    ids = [item["loanId"] for item in body["nearCompletion"]]
    assert hit in ids
    assert miss not in ids
    assert closed not in ids

    entry = next(item for item in body["nearCompletion"] if item["loanId"] == hit)
    assert entry["number"] == "00001"
    assert entry["remainingBalance"] == "200.00"
    assert entry["currency"] == "USD"
    assert str(entry["borrower"]).startswith("Ana")


@pytest.mark.asyncio
async def test_near_completion_threshold_is_exact_at_a_cent_boundary(
    client: AsyncClient,
) -> None:
    """The ≥ 80% gate compares exact Decimals, not a rounded threshold.

    800.03 of 1000.04 is 79.9992% — below 80% — so it must be excluded. Rounding
    the threshold down (0.8 × 1000.04 = 800.032 → 800.03) would let it through.
    """
    below = await make_loan(client, amount="1000.04", currency="USD", advancePaid="800.03")

    body = await summary(client)
    assert below not in [item["loanId"] for item in body["nearCompletion"]]


@pytest.mark.asyncio
async def test_recent_activity_returns_the_newest_active_payments(
    client: AsyncClient,
) -> None:
    """RECENT_ACTIVITY: the 5 most recent, in force, newest first."""
    loan = await make_loan(client, amount="10000.00", currency="USD")
    payment_ids = [
        (await register(client, loan, amount))["id"]
        for amount in ("100.00", "200.00", "300.00", "400.00", "500.00", "600.00")
    ]

    recent = (await summary(client))["recentPayments"]
    assert len(recent) == 5
    assert [item["paymentId"] for item in recent] == list(reversed(payment_ids[-5:]))
    assert recent[0]["amount"] == "600.00"
    assert recent[0]["currency"] == "USD"
    assert recent[0]["loanNumber"] == "00001"


@pytest.mark.asyncio
async def test_recent_activity_excludes_reversed_payments(client: AsyncClient) -> None:
    """A reversed payment is not collection, so it leaves the activity list."""
    loan = await make_loan(client, amount="1000.00", currency="USD")
    first = await register(client, loan, "100.00")
    second = await register(client, loan, "200.00")
    assert (
        await client.delete(f"/api/v1/loans/{loan}/payments/{second['id']}")
    ).status_code == 204

    recent_ids = [item["paymentId"] for item in (await summary(client))["recentPayments"]]
    assert first["id"] in recent_ids
    assert second["id"] not in recent_ids


@pytest.mark.asyncio
async def test_collected_this_month_sums_active_payments_per_currency(
    client: AsyncClient, db: AsyncSession
) -> None:
    """COLLECTED_MONTH: the current calendar month's collections, per currency."""
    usd = await make_loan(client, amount="1000.00", currency="USD")
    ars = await make_loan(client, amount="2000.00", currency="ARS")
    await register(client, usd, "100.00")
    await register(client, ars, "250.00")

    # An old, still-active payment is collected overall but not *this month*.
    db.add(
        Payment(
            loan_id=usd,
            amount=Decimal("500.00"),
            date=datetime(2020, 1, 1, 0, 0, 0),
            pendingBalanceAtPayment=Decimal("400.00"),
            totalPaidAtPayment=Decimal("600.00"),
            advancePaidAtPayment=Decimal("0.00"),
            paymentsHistoryAtPayment=[],
        )
    )
    await db.flush()

    body = await summary(client)
    assert by_currency(body, "USD")["collectedThisMonth"] == "100.00"
    assert by_currency(body, "ARS")["collectedThisMonth"] == "250.00"


@pytest.mark.asyncio
async def test_outstanding_counts_only_active_loans(client: AsyncClient) -> None:
    """Closed loans contribute zero to outstanding, and the counts split correctly."""
    active = await make_loan(client, amount="1000.00", currency="USD")
    closed = await make_loan(client, amount="500.00", currency="USD")
    await register(client, active, "100.00")
    await register(client, closed, "500.00")  # closes it

    card = by_currency(await summary(client), "USD")
    assert card["outstanding"] == "900.00"
    assert card["activeCount"] == 1
    assert card["closedCount"] == 1


@pytest.mark.asyncio
async def test_written_off_is_reported_per_currency(client: AsyncClient) -> None:
    """A manual close condones the pending balance into ``writtenOff``."""
    loan = await make_loan(client, amount="1000.00", currency="USD", advancePaid="100.00")
    await register(client, loan, "300.00")  # outstanding 600
    assert (await client.post(f"/api/v1/loans/{loan}/close")).status_code == 200

    card = by_currency(await summary(client), "USD")
    assert card["writtenOff"] == "600.00"
    assert card["outstanding"] == "0.00"
