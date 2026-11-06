"""Transform -> load: write the plan into the host database, idempotently.

Idempotency is anchored on the loan's unique ``number``: a run only creates a loan
that is not already present, so re-running produces no duplicates. Payments are
idempotent as a consequence — they are only ever created together with the loan
they belong to.

Snapshots are recomputed in source-payment order exactly the way the payment
service recomputes them, reusing its ``history_entry`` builder so the frozen shape
cannot drift from the one receipts read back.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from planny_core.models import Borrower, Loan, Payment
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from planny_loans.borrowers import repository as borrowers_repository
from planny_loans.loans.service import history_entry
from planny_loans.migration.money import ZERO, money
from planny_loans.migration.transform import MigrationPlan, PlannedLoan

__all__ = ["LoadReport", "load_plan"]


@dataclass
class LoadReport:
    """What a load did (or, in dry-run, would do)."""

    dry_run: bool = False
    borrowers_created: int = 0
    borrowers_reused: int = 0
    loans_created: int = 0
    loans_skipped: int = 0
    payments_created: int = 0


async def _loan_number_exists(db: AsyncSession, number: int) -> bool:
    result = await db.execute(select(Loan.id).where(Loan.number == number))
    return result.first() is not None


async def _create_borrowers(
    db: AsyncSession, plan: MigrationPlan, report: LoadReport, dry_run: bool
) -> dict[str, int]:
    """Create (or reuse) the target borrowers, keyed by their dedup key."""
    ids: dict[str, int] = {}
    for mapping in plan.borrowers.mappings.values():
        if mapping.ambiguous:
            continue
        existing = await borrowers_repository.find_by_name(
            db, mapping.first_name, mapping.last_name
        )
        if existing is not None:
            ids[mapping.key] = existing.id
            report.borrowers_reused += 1
            continue
        report.borrowers_created += 1
        if dry_run:
            continue
        borrower = Borrower(firstName=mapping.first_name, lastName=mapping.last_name)
        db.add(borrower)
        await db.flush()
        ids[mapping.key] = borrower.id
    return ids


async def _create_loan(
    db: AsyncSession, planned: PlannedLoan, borrower_id: int
) -> int:
    """Insert one loan and its payments, returning the payment count."""
    loan = Loan(
        number=planned.number,
        borrower_id=borrower_id,
        amount=planned.amount,
        advancePaid=planned.advance,
        installmentAmount=None,
        currency=planned.currency,
        date=planned.date,
        concept=planned.concept,
        lender=planned.lender,
        city=planned.city,
        status=planned.status,
        closedAt=planned.closed_at,
    )
    db.add(loan)
    await db.flush()

    created: list[Payment] = []
    for planned_payment in planned.payments:
        history: list[dict[str, Any]] = [
            history_entry(p.amount, p.id, date=p.date) for p in created
        ]
        entry = history_entry(planned_payment.amount, date=planned_payment.date)
        history.append(entry)
        total = money(sum((p.amount for p in created), ZERO) + planned_payment.amount)
        pending = money(planned.amount - planned.advance - total)
        payment = Payment(
            loan_id=loan.id,
            loan=loan,
            amount=planned_payment.amount,
            date=planned_payment.date,
            pendingBalanceAtPayment=pending,
            totalPaidAtPayment=total,
            advancePaidAtPayment=planned.advance,
            paymentsHistoryAtPayment=history,
        )
        db.add(payment)
        await db.flush()
        # The snapshot carries the row's own id, which only exists after the flush.
        if entry["id"] is None:
            entry["id"] = payment.id
            flag_modified(payment, "paymentsHistoryAtPayment")
            await db.flush()
        created.append(payment)

    return len(created)


async def load_plan(
    db: AsyncSession, plan: MigrationPlan, *, dry_run: bool = False
) -> LoadReport:
    """Load *plan* into the host database.

    The caller owns the transaction boundary: this function flushes but never
    commits, so a dry-run (which only reads) writes nothing and a real run commits
    atomically through the caller's session.
    """
    report = LoadReport(dry_run=dry_run)
    borrower_ids = await _create_borrowers(db, plan, report, dry_run)

    for planned in plan.loans:
        mapping = plan.borrowers.mappings.get(planned.borrower_key)
        if mapping is None or mapping.ambiguous:
            report.loans_skipped += 1
            continue
        if await _loan_number_exists(db, planned.number):
            report.loans_skipped += 1
            continue
        if dry_run:
            report.loans_created += 1
            report.payments_created += len(planned.payments)
            continue
        borrower_id = borrower_ids.get(planned.borrower_key)
        if borrower_id is None:
            report.loans_skipped += 1
            continue
        report.payments_created += await _create_loan(db, planned, borrower_id)
        report.loans_created += 1

    return report
