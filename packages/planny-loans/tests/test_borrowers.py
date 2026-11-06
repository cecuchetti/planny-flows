from __future__ import annotations

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from planny_api.dependencies import get_db
from planny_api.main import create_app
from planny_core.database import Base
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_loans.borrowers import repository


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
    assert borrower["email"] == "ana.perez@example.com"

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


@pytest.mark.asyncio
async def test_borrower_with_null_contact_gets_deterministic_mocks(
    client: AsyncClient,
) -> None:
    """Contact fields are non-null and stable across requests."""
    created = await client.post(
        "/api/v1/borrowers", json={"firstName": "Verónica", "lastName": "Álvarez"}
    )
    assert created.status_code == 201
    first = created.json()["borrower"]

    # Repeat the same request — values must be identical.
    second = await client.get(f"/api/v1/borrowers/{first['id']}")
    assert second.status_code == 200
    second_data = second.json()["borrower"]

    for field in ("email", "phone", "address", "nationalId"):
        assert first[field] is not None, f"{field} should be mocked, not None"
        assert first[field] == second_data[field], f"{field} must be stable"

    assert first["email"] == "veronica.alvarez@example.com"
    assert "Córdoba" in first["address"]
    assert first["nationalId"].count("-") == 2  # CUIT-like format


@pytest.mark.asyncio
async def test_borrower_with_real_contact_data_is_not_overridden(
    client: AsyncClient,
) -> None:
    """Real contact data must NEVER be replaced by mocks."""
    created = await client.post(
        "/api/v1/borrowers",
        json={
            "firstName": "Juan",
            "lastName": "Pérez",
            "email": "juanito@real.com",
            "phone": "+54 11 5555-1234",
            "address": "Av. Siempre Viva 742",
            "nationalId": "20-12345678-9",
        },
    )
    assert created.status_code == 201
    borrower = created.json()["borrower"]
    assert borrower["email"] == "juanito@real.com"
    assert borrower["phone"] == "+54 11 5555-1234"
    assert borrower["address"] == "Av. Siempre Viva 742"
    assert borrower["nationalId"] == "20-12345678-9"


@pytest.mark.asyncio
async def test_list_borrowers_searches_by_email_and_national_id(client: AsyncClient) -> None:
    created = await client.post(
        "/api/v1/borrowers",
        json={
            "firstName": "María",
            "lastName": "González",
            "email": "maria.gonzalez@example.com",
            "nationalId": "27-00000005-5",
        },
    )
    assert created.status_code == 201

    # Search by partial email
    by_email = await client.get("/api/v1/borrowers", params={"search": "gonzalez@example"})
    assert by_email.status_code == 200
    assert any(b["nationalId"] == "27-00000005-5" for b in by_email.json()["borrowers"])

    # Search by partial nationalId (DNI suffix)
    by_dni = await client.get("/api/v1/borrowers", params={"search": "00000005-5"})
    assert by_dni.status_code == 200
    assert any(b["nationalId"] == "27-00000005-5" for b in by_dni.json()["borrowers"])

    # Search by nonexistent term returns empty
    no_match = await client.get("/api/v1/borrowers", params={"search": "zzzzznonexistent999"})
    assert no_match.status_code == 200
    assert len(no_match.json()["borrowers"]) == 0


async def _linked() -> int:
    return 1


@pytest.mark.asyncio
async def test_link_count_propagates_unexpected_database_errors() -> None:
    db = AsyncMock()
    db.execute.side_effect = OperationalError("SELECT", {}, RuntimeError("database offline"))
    with pytest.raises(OperationalError):
        await repository.linked_loan_count(db, 1)


# ── Detail-endpoint helpers ─────────────────────────────────────────────────


async def _make_borrower(client: AsyncClient, first: str = "Ana", last: str = "Pérez") -> int:
    response = await client.post(
        "/api/v1/borrowers", json={"firstName": first, "lastName": last}
    )
    assert response.status_code == 201, response.text
    return int(response.json()["borrower"]["id"])


def _loan_payload(borrower_id: int, **overrides: object) -> dict[str, object]:
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


# ── Detail-endpoint tests ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_borrower_detail_has_mocked_profile_fields(client: AsyncClient) -> None:
    """Detail endpoint returns all mocked profile fields."""
    borrower_id = await _make_borrower(client)
    response = await client.get(f"/api/v1/borrowers/{borrower_id}")
    assert response.status_code == 200
    body = response.json()["borrower"]

    fields = [
        "dni", "fiscalStatus", "altPhone", "city", "postalCode",
        "occupation", "monthlyIncome", "enabledForLoans", "notifyWhatsApp",
        "incomeCertification",
    ]
    for field in fields:
        assert field in body, f"Missing field: {field}"
        assert body[field] is not None, f"Null field: {field}"

    assert body["enabledForLoans"] is True
    assert body["notifyWhatsApp"] is True
    assert isinstance(body["incomeCertification"], dict)
    assert "updatedAt" in body["incomeCertification"]


@pytest.mark.asyncio
async def test_borrower_detail_mocked_fields_are_deterministic(
    client: AsyncClient,
) -> None:
    """Same borrower id → same mocked field values across requests."""
    borrower_id = await _make_borrower(client)

    first = await client.get(f"/api/v1/borrowers/{borrower_id}")
    assert first.status_code == 200
    first_data = first.json()["borrower"]

    second = await client.get(f"/api/v1/borrowers/{borrower_id}")
    assert second.status_code == 200
    second_data = second.json()["borrower"]

    deterministic_fields = [
        "dni", "fiscalStatus", "altPhone", "city", "postalCode",
        "occupation", "monthlyIncome",
    ]
    for field in deterministic_fields:
        assert first_data[field] == second_data[field], (
            f"{field} must be deterministic, got "
            f"{first_data[field]!r} vs {second_data[field]!r}"
        )


@pytest.mark.asyncio
async def test_borrower_detail_loans_matches_created_loans(
    client: AsyncClient,
) -> None:
    """Detail ``loans`` list contains every loan for that borrower."""
    borrower_id = await _make_borrower(client)

    # Create two loans
    r1 = await client.post("/api/v1/loans", json=_loan_payload(borrower_id))
    assert r1.status_code == 201
    loan1 = r1.json()["loan"]

    r2 = await client.post(
        "/api/v1/loans", json=_loan_payload(borrower_id, amount="2500.00", date="2026-11-01")
    )
    assert r2.status_code == 201
    loan2 = r2.json()["loan"]

    detail = await client.get(f"/api/v1/borrowers/{borrower_id}")
    assert detail.status_code == 200
    loans = detail.json()["borrower"]["loans"]

    assert len(loans) == 2
    loan_ids = {ln["id"] for ln in loans}
    assert loan1["id"] in loan_ids
    assert loan2["id"] in loan_ids


@pytest.mark.asyncio
async def test_borrower_detail_activity_has_loan_creation_events(
    client: AsyncClient,
) -> None:
    """Activity contains one ``modificacion`` per loan."""
    borrower_id = await _make_borrower(client)
    await client.post("/api/v1/loans", json=_loan_payload(borrower_id))
    await client.post(
        "/api/v1/loans", json=_loan_payload(borrower_id, amount="800.00", date="2026-11-15")
    )

    detail = await client.get(f"/api/v1/borrowers/{borrower_id}")
    assert detail.status_code == 200
    activity = detail.json()["borrower"]["activity"]

    modificaciones = [e for e in activity if e["category"] == "modificacion"]
    assert len(modificaciones) == 2
    for event in modificaciones:
        assert "formalizado" in event["title"]
        assert event["detail"] is not None


@pytest.mark.asyncio
async def test_borrower_detail_activity_has_payment_events(
    client: AsyncClient,
) -> None:
    """Activity contains one ``cobro`` per payment made on the borrower's loans."""
    borrower_id = await _make_borrower(client)
    r = await client.post("/api/v1/loans", json=_loan_payload(borrower_id))
    assert r.status_code == 201
    loan_id = r.json()["loan"]["id"]

    # Make a payment
    rp = await client.post(f"/api/v1/loans/{loan_id}/payments", json={"amount": "500.00"})
    assert rp.status_code == 201

    detail = await client.get(f"/api/v1/borrowers/{borrower_id}")
    assert detail.status_code == 200
    activity = detail.json()["borrower"]["activity"]

    cobros = [e for e in activity if e["category"] == "cobro"]
    assert len(cobros) == 1
    assert "Pago" in cobros[0]["title"]


@pytest.mark.asyncio
async def test_borrower_detail_activity_sorted_newest_first(
    client: AsyncClient,
) -> None:
    """Activity timeline is sorted descending by date."""
    borrower_id = await _make_borrower(client)
    await client.post(
        "/api/v1/loans", json=_loan_payload(borrower_id, date="2026-01-15")
    )
    await client.post(
        "/api/v1/loans", json=_loan_payload(borrower_id, date="2026-06-20")
    )

    detail = await client.get(f"/api/v1/borrowers/{borrower_id}")
    assert detail.status_code == 200
    activity = detail.json()["borrower"]["activity"]

    dates = [e["date"] for e in activity]
    assert dates == sorted(dates, reverse=True), (
        f"Activity must be newest first: {dates}"
    )


@pytest.mark.asyncio
async def test_borrower_list_does_not_include_heavy_detail_fields(
    client: AsyncClient,
) -> None:
    """The list endpoint must NOT carry ``loans`` or ``activity`` keys."""
    borrower_id = await _make_borrower(client)
    await client.post("/api/v1/loans", json=_loan_payload(borrower_id))

    response = await client.get("/api/v1/borrowers")
    assert response.status_code == 200
    borrowers = response.json()["borrowers"]
    assert len(borrowers) >= 1

    for b in borrowers:
        assert "loans" not in b, "list must not include loans"
        assert "activity" not in b, "list must not include activity"


@pytest.mark.asyncio
async def test_borrower_detail_activity_is_capped_at_25(
    client: AsyncClient,
) -> None:
    """Detail activity timeline is capped at 25 events."""
    borrower_id = await _make_borrower(client)
    # Create many loans (each produces one activity event)
    for i in range(30):
        await client.post(
            "/api/v1/loans",
            json=_loan_payload(
                borrower_id,
                amount=f"{100 + i}.00",
                date=f"2026-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}",
            ),
        )

    detail = await client.get(f"/api/v1/borrowers/{borrower_id}")
    assert detail.status_code == 200
    activity = detail.json()["borrower"]["activity"]
    assert len(activity) <= 25
