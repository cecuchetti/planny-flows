"""Epic 5 migration tests: names, transform, idempotent load, reconciliation.

The Mongo extraction itself is a thin motor wrapper and is not exercised here;
the transform, load and reconcile stages run against in-memory SQLite and
hand-built legacy documents, which is where all the migration logic lives.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date
from decimal import Decimal

import pytest
from planny_core.db.base import Base
from planny_core.models import Borrower, Loan, Payment  # noqa: F401 — register tables
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from planny_loans.migration import load, names, reconcile, transform


@pytest.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.commit()
    await engine.dispose()


def raw_loan(
    number: str,
    borrower: str,
    amount: float,
    *,
    currency: str = "USD",
    date: str = "2025-07-06 00:00:00",
    concept: str = "Préstamo",
    lender: str = "Carlos",
    city: str = "Córdoba",
    advance: float | None = None,
    payments: list[dict] | None = None,
) -> dict:
    return {
        "number": number,
        "borrower": borrower,
        "amount": amount,
        "currency": currency,
        "date": date,
        "concept": concept,
        "lender": lender,
        "city": city,
        "manualPendingBalance": advance,
        "payments": payments or [],
    }


def payment(amount: float, date: str = "2025-07-07 00:59:53") -> dict:
    return {"amount": amount, "date": date}


class TestNames:
    def test_split_name_splits_on_first_whitespace_run(self) -> None:
        assert names.split_name("Ana Pérez") == names.NameSplit("Ana", "Pérez", False)
        assert names.split_name("Juan Carlos Pérez") == names.NameSplit(
            "Juan", "Carlos Pérez", False
        )

    def test_split_name_normalises_whitespace(self) -> None:
        assert names.split_name("  Ana    Pérez  ") == names.NameSplit("Ana", "Pérez", False)

    def test_split_name_flags_single_word_and_empty(self) -> None:
        single = names.split_name("Madonna")
        assert single.ambiguous is True
        assert single.first_name == "Madonna" and single.last_name == ""
        assert names.split_name("").ambiguous is True

    def test_resolve_borrowers_deduplicates_case_and_whitespace(self) -> None:
        plan = names.resolve_borrowers(
            ["Susana Campanella", "susana campanella", "Luciana Milano"]
        )
        assert len(plan.mappings) == 2
        susana = plan.by_source_name["susana campanella"]
        assert (susana.first_name, susana.last_name) == ("Susana", "Campanella")
        assert plan.ambiguous == []

    def test_resolve_borrowers_queues_ambiguous_names(self) -> None:
        plan = names.resolve_borrowers(["Madonna", "Ana Pérez"])
        assert len(plan.mappings) == 2
        assert len(plan.ambiguous) == 1
        assert plan.ambiguous[0].first_name == "Madonna"

    def test_resolve_borrowers_applies_overrides_and_merges(self) -> None:
        plan = names.resolve_borrowers(
            ["J. Pérez", "Juan Pérez"], overrides={"J. Pérez": ("Juan", "Pérez")}
        )
        assert len(plan.mappings) == 1
        mapping = next(iter(plan.mappings.values()))
        assert (mapping.first_name, mapping.last_name) == ("Juan", "Pérez")
        assert sorted(mapping.source_names) == ["J. Pérez", "Juan Pérez"]


class TestTransform:
    def test_build_plan_derives_status_and_closed_at(self) -> None:
        raw = [
            raw_loan("00002", "Susana Campanella", 1700, payments=[payment(300), payment(150)]),
            raw_loan("00003", "Luciana Milano", 600000, currency="ARS", advance=390000,
                     payments=[payment(30000), payment(30000), payment(150000)]),
        ]
        plan = transform.build_plan(raw)
        assert len(plan.loans) == 2
        assert plan.source_loan_count == 2
        assert plan.source_payment_count == 5
        assert plan.skipped == []

        active = plan.loans[0]
        assert active.status == "active"
        assert active.closed_at is None
        assert active.borrower_key == names.dedup_key("Susana", "Campanella")

        closed = plan.loans[1]
        assert closed.status == "closed"
        assert closed.closed_at is not None
        assert closed.advance == Decimal("390000.00")

    def test_build_plan_skips_invalid_loans(self) -> None:
        raw = [
            raw_loan("00002", "Susana Campanella", 1700),
            raw_loan("abc", "Ana Pérez", 100),
            raw_loan("00004", "Ana Pérez", 100, currency="EUR"),
            raw_loan("00005", "Madonna", 100),
            raw_loan("00002", "Ana Pérez", 999),  # duplicate number
        ]
        plan = transform.build_plan(raw)
        assert [s.reason for s in plan.skipped] == [
            "número inválido: 'abc'",
            "moneda no soportada: 'EUR'",
            "prestatario sin resolver: 'Madonna'",
            "número duplicado",
        ]
        assert len(plan.loans) == 1
        assert plan.loans[0].number == 2


class TestLoad:
    async def test_load_plan_creates_borrowers_loans_and_snapshots(
        self, db_session: AsyncSession
    ) -> None:
        raw = [
            raw_loan(
                "00002",
                "Susana Campanella",
                1700,
                payments=[payment(300, "2025-07-07 00:59:53"), payment(150, "2025-08-15 21:33:37")],
            ),
            raw_loan("00003", "Susana Campanella", 500, payments=[payment(500)]),
        ]
        plan = transform.build_plan(raw)
        report = await load.load_plan(db_session, plan)
        await db_session.commit()

        assert report.borrowers_created == 1
        assert report.loans_created == 2
        assert report.payments_created == 3

        borrowers = list(
            (await db_session.execute(select(Borrower))).scalars().all()
        )
        assert len(borrowers) == 1

        loans = list(
            (
                await db_session.execute(select(Loan).order_by(Loan.number))
            ).scalars().all()
        )
        assert [loan.number for loan in loans] == [2, 3]
        assert loans[1].status == "closed"
        assert loans[1].closedAt is not None

        first = loans[0]
        payments = list(
            (
                await db_session.execute(
                    select(Payment).where(Payment.loan_id == first.id).order_by(Payment.id)
                )
            ).scalars().all()
        )
        assert [p.amount for p in payments] == [Decimal("300.00"), Decimal("150.00")]
        # The second payment's snapshot names the first by its assigned id.
        history = payments[1].paymentsHistoryAtPayment
        assert len(history) == 2
        assert history[0]["id"] == payments[0].id
        assert history[0]["amount"] == "300.00"
        assert payments[1].totalPaidAtPayment == Decimal("450.00")
        assert payments[1].pendingBalanceAtPayment == Decimal("1250.00")

    async def test_load_plan_is_idempotent(self, db_session: AsyncSession) -> None:
        plan = transform.build_plan(
            [raw_loan("00002", "Susana Campanella", 1700, payments=[payment(300)])]
        )
        first = await load.load_plan(db_session, plan)
        await db_session.commit()
        second = await load.load_plan(db_session, plan)

        assert first.loans_created == 1
        assert second.loans_created == 0
        assert second.loans_skipped == 1
        assert second.borrowers_reused == 1
        assert second.payments_created == 0

        count = int(
            (
                await db_session.execute(select(func.count()).select_from(Loan))
            ).scalar_one()
        )
        assert count == 1


class TestReconcile:
    async def test_reconcile_matches_after_a_load(self, db_session: AsyncSession) -> None:
        raw = [
            raw_loan("00002", "Susana Campanella", 1700, payments=[payment(300), payment(150)]),
            raw_loan(
                "00003",
                "Luciana Milano",
                600000,
                currency="ARS",
                advance=390000,
                payments=[payment(30000), payment(30000)],
            ),
        ]
        plan = transform.build_plan(raw)
        await load.load_plan(db_session, plan)
        await db_session.commit()

        result = await reconcile.build(db_session, plan)
        assert result.matches is True
        assert result.source_loans == result.target_loans == 2
        assert result.source_payments == result.target_payments == 4
        assert result.source["USD"].principal == Decimal("1700.00")
        assert result.target["USD"].outstanding == Decimal("1250.00")
        assert result.source["ARS"].collected == result.target["ARS"].collected

    async def test_reconcile_ignores_unrelated_host_loans(
        self, db_session: AsyncSession
    ) -> None:
        plan = transform.build_plan(
            [raw_loan("00002", "Susana Campanella", 1700, payments=[payment(300)])]
        )
        await load.load_plan(db_session, plan)

        # A pre-existing host loan (made before the migration) must not enter the
        # comparison: reconciliation is about the loans the migration wrote.
        borrower = Borrower(firstName="Prueba", lastName="Integración")
        db_session.add(borrower)
        await db_session.flush()
        db_session.add(
            Loan(
                number=999,
                borrower_id=borrower.id,
                amount=Decimal("1000.00"),
                currency="USD",
                date=date(2026, 1, 1),
                concept="x",
                lender="y",
                city="Córdoba",
                status="active",
            )
        )
        await db_session.commit()

        result = await reconcile.build(db_session, plan)
        assert result.matches is True
        assert result.target_loans == 1
        assert result.target_payments == 1
        assert result.target["USD"].principal == Decimal("1700.00")
