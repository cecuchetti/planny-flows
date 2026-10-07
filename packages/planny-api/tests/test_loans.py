"""Loan registry API tests.

The fixture mirrors ``test_borrowers.py``: a real application, a real HTTP
client and an in-memory SQLite database created from the model metadata, so the
tests exercise the router → service → repository path rather than mocking it.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from planny_core.database import Base
from planny_core.models import Borrower, Loan
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_api.dependencies import get_db
from planny_api.main import create_app


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


async def make_borrower(client: AsyncClient, first: str = "Ana", last: str = "Pérez") -> int:
    response = await client.post(
        "/api/v1/borrowers", json={"firstName": first, "lastName": last}
    )
    assert response.status_code == 201, response.text
    return int(response.json()["borrower"]["id"])


def payload(borrower_id: int, **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "borrowerId": borrower_id,
        "amount": "1500.50",
        "currency": "USD",
        "date": "2026-10-07",
        "concept": "Préstamo personal",
        "lender": "Ecuche",
        "city": "Córdoba",
    }
    body.update(overrides)
    return body


def error(response: object) -> dict[str, object]:
    return response.json()["error"]  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_create_happy_path_assigns_number_and_derives_balance(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    response = await client.post(
        "/api/v1/loans", json=payload(borrower_id, advancePaid="500.25")
    )
    assert response.status_code == 201, response.text
    loan = response.json()["loan"]
    assert loan["number"] == "00001"
    assert loan["amount"] == "1500.50"
    assert loan["advancePaid"] == "500.25"
    assert loan["pendingBalance"] == "1000.25"
    assert loan["currency"] == "USD"
    assert loan["city"] == "Córdoba"
    assert loan["installmentAmount"] is None
    assert loan["borrower"] == {"id": borrower_id, "firstName": "Ana", "lastName": "Pérez"}


@pytest.mark.asyncio
async def test_create_defaults_city_currency_date_and_advance(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    response = await client.post(
        "/api/v1/loans",
        json={
            "borrowerId": borrower_id,
            "amount": 1000,
            "date": "2026-10-07",
            "concept": "Préstamo",
            "lender": "Ecuche",
        },
    )
    assert response.status_code == 201, response.text
    loan = response.json()["loan"]
    assert loan["city"] == "Córdoba"
    assert loan["currency"] == "USD"
    assert loan["advancePaid"] == "0.00"
    assert loan["pendingBalance"] == "1000.00"


@pytest.mark.asyncio
async def test_create_next_number_increments(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    first = await client.post("/api/v1/loans", json=payload(borrower_id))
    second = await client.post("/api/v1/loans", json=payload(borrower_id))
    assert first.json()["loan"]["number"] == "00001"
    assert second.json()["loan"]["number"] == "00002"

    listed = await client.get("/api/v1/loans")
    assert [item["number"] for item in listed.json()["loans"]] == ["00002", "00001"]


@pytest.mark.asyncio
async def test_numbering_continues_after_a_backfilled_maximum(
    client: AsyncClient, db: AsyncSession
) -> None:
    borrower_id = await make_borrower(client)
    legacy = Borrower(firstName="Legacy", lastName="Row")
    db.add(legacy)
    await db.flush()
    db.add(
        Loan(
            number=41,
            borrower_id=legacy.id,
            amount=10,
            advancePaid=0,
            currency="USD",
            date=date(2020, 1, 1),
            concept="Legado",
            lender="Viejo",
            city="Córdoba",
        )
    )
    await db.flush()

    response = await client.post("/api/v1/loans", json=payload(borrower_id))
    assert response.status_code == 201, response.text
    assert response.json()["loan"]["number"] == "00042"


@pytest.mark.asyncio
async def test_advance_paid_must_be_within_range(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)

    negative = await client.post("/api/v1/loans", json=payload(borrower_id, advancePaid="-1"))
    assert negative.status_code == 400
    assert error(negative)["code"] == "BAD_USER_INPUT"
    assert "fields" in error(negative)["data"]
    assert "adelantado" in str(error(negative)["data"])

    excessive = await client.post(
        "/api/v1/loans", json=payload(borrower_id, amount="100", advancePaid="100.01")
    )
    assert excessive.status_code == 400
    assert error(excessive)["code"] == "BAD_USER_INPUT"


@pytest.mark.asyncio
async def test_installment_must_not_be_negative(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    response = await client.post(
        "/api/v1/loans", json=payload(borrower_id, installmentAmount="-5")
    )
    assert response.status_code == 400
    assert error(response)["code"] == "BAD_USER_INPUT"
    assert error(response)["message"] == "Revisá los datos del préstamo."


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides",
    [
        {"amount": "0"},
        {"amount": "-10"},
        {"amount": "abc"},
        {"borrowerId": None},
        {"concept": "  "},
        {"lender": ""},
        {"date": " "},
        {"currency": "EUR"},
    ],
)
async def test_required_and_validated_fields_are_rejected(
    client: AsyncClient, overrides: dict[str, object]
) -> None:
    borrower_id = await make_borrower(client)
    response = await client.post("/api/v1/loans", json=payload(borrower_id, **overrides))
    assert response.status_code == 400, response.text
    assert error(response)["code"] == "BAD_USER_INPUT"
    assert error(response)["message"] == "Revisá los datos del préstamo."


@pytest.mark.asyncio
async def test_unknown_borrower_is_not_found(client: AsyncClient) -> None:
    response = await client.post("/api/v1/loans", json=payload(9999))
    assert response.status_code == 404
    assert error(response)["code"] == "ENTITY_NOT_FOUND"
    assert error(response)["message"] == "No encontramos esa persona."


@pytest.mark.asyncio
async def test_currency_is_locked_once_advance_paid(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    created = await client.post("/api/v1/loans", json=payload(borrower_id, advancePaid="10"))
    loan_id = created.json()["loan"]["id"]

    response = await client.put(
        f"/api/v1/loans/{loan_id}", json=payload(borrower_id, advancePaid="10", currency="ARS")
    )
    assert response.status_code == 400
    assert error(response)["code"] == "BAD_USER_INPUT"
    assert "moneda" in str(error(response)["data"])


@pytest.mark.asyncio
async def test_currency_can_change_before_any_advance_paid(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    created = await client.post("/api/v1/loans", json=payload(borrower_id))
    loan_id = created.json()["loan"]["id"]

    response = await client.put(
        f"/api/v1/loans/{loan_id}", json=payload(borrower_id, currency="ARS")
    )
    assert response.status_code == 200, response.text
    assert response.json()["loan"]["currency"] == "ARS"


@pytest.mark.asyncio
async def test_amount_below_advance_is_rejected(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    created = await client.post("/api/v1/loans", json=payload(borrower_id, advancePaid="800"))
    loan_id = created.json()["loan"]["id"]

    response = await client.put(
        f"/api/v1/loans/{loan_id}", json=payload(borrower_id, amount="500", advancePaid="800")
    )
    assert response.status_code == 400
    assert error(response)["code"] == "BAD_USER_INPUT"


@pytest.mark.asyncio
async def test_number_is_immutable(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    created = await client.post("/api/v1/loans", json=payload(borrower_id))
    loan_id = created.json()["loan"]["id"]

    response = await client.put(
        f"/api/v1/loans/{loan_id}", json=payload(borrower_id, number="00999")
    )
    assert response.status_code == 200, response.text
    assert response.json()["loan"]["number"] == "00001"


@pytest.mark.asyncio
async def test_installment_can_be_set_then_cleared(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    created = await client.post(
        "/api/v1/loans", json=payload(borrower_id, installmentAmount="25")
    )
    assert created.json()["loan"]["installmentAmount"] == "25.00"
    loan_id = created.json()["loan"]["id"]

    # An explicit null is a real edit: it clears the installment. Omitting the
    # key would leave it alone, which is why the service uses a sentinel.
    cleared = await client.put(
        f"/api/v1/loans/{loan_id}", json=payload(borrower_id, installmentAmount=None)
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["loan"]["installmentAmount"] is None


@pytest.mark.asyncio
async def test_update_edits_descriptive_fields(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    created = await client.post("/api/v1/loans", json=payload(borrower_id))
    loan_id = created.json()["loan"]["id"]

    response = await client.put(
        f"/api/v1/loans/{loan_id}",
        json=payload(borrower_id, concept="Viaje", lender="Otra", city="Villa María"),
    )
    assert response.status_code == 200, response.text
    loan = response.json()["loan"]
    assert loan["concept"] == "Viaje"
    assert loan["lender"] == "Otra"
    assert loan["city"] == "Villa María"


@pytest.mark.asyncio
async def test_get_delete_and_not_found(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    created = await client.post("/api/v1/loans", json=payload(borrower_id))
    loan_id = created.json()["loan"]["id"]

    fetched = await client.get(f"/api/v1/loans/{loan_id}")
    assert fetched.status_code == 200
    assert fetched.json()["loan"]["number"] == "00001"

    deleted = await client.delete(f"/api/v1/loans/{loan_id}")
    assert deleted.status_code == 204

    for method, url, body in (
        ("get", f"/api/v1/loans/{loan_id}", None),
        ("put", f"/api/v1/loans/{loan_id}", payload(borrower_id)),
        ("delete", f"/api/v1/loans/{loan_id}", None),
    ):
        call = getattr(client, method)
        response = await (call(url) if body is None else call(url, json=body))
        assert response.status_code == 404, response.text
        assert response.json()["error"]["code"] == "ENTITY_NOT_FOUND"
        assert response.json()["error"]["message"] == "No encontramos ese préstamo."


@pytest.mark.asyncio
async def test_delete_linked_borrower_is_blocked(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    await client.post("/api/v1/loans", json=payload(borrower_id))

    response = await client.delete(f"/api/v1/borrowers/{borrower_id}")
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "CONFLICT"
    assert "préstamos vinculados" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_borrower_directory_reports_the_linked_loan_count(client: AsyncClient) -> None:
    first = await make_borrower(client, "Ana", "Pérez")
    await make_borrower(client, "Luz", "Sosa")
    await client.post("/api/v1/loans", json=payload(first))
    await client.post("/api/v1/loans", json=payload(first))

    listed = await client.get("/api/v1/borrowers")
    counts = {
        item["firstName"]: item["loanCount"] for item in listed.json()["borrowers"]
    }
    assert counts == {"Ana": 2, "Luz": 0}


@pytest.mark.asyncio
async def test_versioned_and_unversioned_paths_agree(client: AsyncClient) -> None:
    borrower_id = await make_borrower(client)
    await client.post("/api/v1/loans", json=payload(borrower_id))

    canonical = await client.get("/api/v1/loans")
    alias = await client.get("/loans")
    assert alias.status_code == canonical.status_code == 200
    assert alias.json() == canonical.json()

    created = await client.post("/loans", json=payload(borrower_id))
    assert created.status_code == 201
    assert created.json()["loan"]["number"] == "00002"


@pytest.mark.asyncio
async def test_partial_update_keeps_the_fields_it_omits(client: AsyncClient) -> None:
    """A `PUT` naming one field must not demand the ones it left out."""
    borrower_id = await make_borrower(client)
    created = await client.post(
        "/api/v1/loans", json=payload(borrower_id, advancePaid="10", installmentAmount="25")
    )
    loan_id = created.json()["loan"]["id"]

    changed = await client.put(f"/api/v1/loans/{loan_id}", json={"concept": "Viaje"})
    assert changed.status_code == 200, changed.text
    loan = changed.json()["loan"]
    assert loan["concept"] == "Viaje"
    # Everything the request did not name survives, including the borrowed person.
    assert loan["lender"] == "Ecuche"
    assert loan["amount"] == "1500.50"
    assert loan["advancePaid"] == "10.00"
    assert loan["installmentAmount"] == "25.00"
    assert loan["pendingBalance"] == "1490.50"
    assert loan["borrower"]["id"] == borrower_id

    # An explicit null is still a real edit: it clears the installment.
    cleared = await client.put(f"/api/v1/loans/{loan_id}", json={"installmentAmount": None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["loan"]["installmentAmount"] is None
    assert cleared.json()["loan"]["concept"] == "Viaje"


@pytest.mark.asyncio
async def test_advance_above_amount_blames_only_the_advance(client: AsyncClient) -> None:
    """On create nothing is "already registered", so only the advance is at fault."""
    borrower_id = await make_borrower(client)
    response = await client.post(
        "/api/v1/loans", json=payload(borrower_id, amount="100", advancePaid="500")
    )
    assert response.status_code == 400
    fields = error(response)["data"]["fields"]
    assert "advancePaid" in fields
    assert "amount" not in fields, fields
    assert "ya registrado" not in str(fields)


@pytest.mark.asyncio
async def test_borrower_detail_reports_the_same_count_as_the_directory(
    client: AsyncClient,
) -> None:
    borrower_id = await make_borrower(client)
    await client.post("/api/v1/loans", json=payload(borrower_id))

    detail = await client.get(f"/api/v1/borrowers/{borrower_id}")
    assert detail.status_code == 200
    assert detail.json()["borrower"]["loanCount"] == 1

    updated = await client.put(
        f"/api/v1/borrowers/{borrower_id}", json={"firstName": "Ana", "lastName": "Pérez"}
    )
    assert updated.status_code == 200
    assert updated.json()["borrower"]["loanCount"] == 1
