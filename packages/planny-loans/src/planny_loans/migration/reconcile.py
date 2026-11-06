"""Post-migration reconciliation: source totals against the host database.

Every figure is compared per currency and never combined, matching the product's
currency rule. The comparison is over the *loadable* set — the loans the migration
actually wrote, identified by their legacy numbers — so a difference is a real
migration defect. A pre-existing host loan (created before the migration) is never
folded into the comparison, and the skipped loans are reported separately as the
explained difference between raw and migrated counts.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from planny_core.models import Loan, Payment
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from planny_loans.loans.service import ACTIVE
from planny_loans.migration.money import ZERO, money
from planny_loans.migration.transform import MigrationPlan, PlannedLoan

__all__ = ["Reconciliation", "Totals", "build"]


@dataclass
class Totals:
    """One currency's reconciliation figures."""

    principal: Decimal = ZERO
    collected: Decimal = ZERO
    outstanding: Decimal = ZERO


@dataclass
class Reconciliation:
    """Source and target side by side, with the differences explained."""

    source_loans: int
    source_payments: int
    target_loans: int
    target_payments: int
    source: dict[str, Totals]
    target: dict[str, Totals]
    differences: list[str]

    @property
    def matches(self) -> bool:
        return not self.differences


def _loan_collected(loan: PlannedLoan) -> Decimal:
    return money(loan.advance + sum((p.amount for p in loan.payments), ZERO))


def source_totals(loans: list[PlannedLoan]) -> tuple[dict[str, Totals], int, int]:
    """Per-currency totals over the loadable set, plus its counts."""
    per: dict[str, Totals] = {}
    for loan in loans:
        totals = per.setdefault(loan.currency, Totals())
        outstanding = ZERO
        if loan.status == ACTIVE:
            outstanding = money(
                loan.amount - loan.advance - sum((p.amount for p in loan.payments), ZERO)
            )
        per[loan.currency] = Totals(
            principal=money(totals.principal + loan.amount),
            collected=money(totals.collected + _loan_collected(loan)),
            outstanding=money(totals.outstanding + outstanding),
        )
    return per, len(loans), sum(len(loan.payments) for loan in loans)


async def target_totals(
    db: AsyncSession, loan_numbers: set[int]
) -> tuple[dict[str, Totals], int, int]:
    """Per-currency totals for the migrated loans, plus their counts.

    Scoped to ``loan_numbers`` so a pre-existing host loan (created before the
    migration) is never folded into the comparison — reconciliation is about the
    data the migration wrote, not the whole database.
    """
    if not loan_numbers:
        return {}, 0, 0

    number_filter = Loan.number.in_(loan_numbers)
    loan_count = int(
        (
            await db.execute(select(func.count()).select_from(Loan).where(number_filter))
        ).scalar_one()
    )
    payment_count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Payment)
                .join(Loan, Payment.loan_id == Loan.id)
                .where(number_filter, Payment.reversedAt.is_(None))
            )
        ).scalar_one()
    )

    paid = (
        select(
            Payment.loan_id.label("loan_id"),
            func.coalesce(func.sum(Payment.amount), 0).label("paid"),
        )
        .join(Loan, Payment.loan_id == Loan.id)
        .where(Payment.reversedAt.is_(None), number_filter)
        .group_by(Payment.loan_id)
        .subquery()
    )
    outstanding_expr = (
        func.coalesce(Loan.amount, 0)
        - func.coalesce(Loan.advancePaid, 0)
        - func.coalesce(paid.c.paid, 0)
        - func.coalesce(Loan.writtenOffAmount, 0)
    )
    rows = (
        await db.execute(
            select(
                Loan.currency,
                func.sum(func.coalesce(Loan.amount, 0)).label("principal"),
                func.sum(func.coalesce(Loan.advancePaid, 0)).label("advance"),
                func.sum(func.coalesce(paid.c.paid, 0)).label("payments"),
                func.sum(case((Loan.status == ACTIVE, outstanding_expr), else_=0)).label(
                    "outstanding"
                ),
            )
            .outerjoin(paid, paid.c.loan_id == Loan.id)
            .where(number_filter)
            .group_by(Loan.currency)
        )
    ).all()

    per: dict[str, Totals] = {}
    for row in rows:
        per[str(row.currency)] = Totals(
            principal=Decimal(row.principal),
            collected=Decimal(row.advance) + Decimal(row.payments),
            outstanding=Decimal(row.outstanding),
        )
    return per, loan_count, payment_count


def _diff_currencies(source: dict[str, Totals], target: dict[str, Totals]) -> list[str]:
    differences: list[str] = []
    for currency in sorted(set(source) | set(target)):
        src = source.get(currency, Totals())
        tgt = target.get(currency, Totals())
        if (src.principal, src.collected, src.outstanding) != (
            tgt.principal,
            tgt.collected,
            tgt.outstanding,
        ):
            differences.append(
                f"{currency}: origen principal={src.principal} cobrado={src.collected} "
                f"pendiente={src.outstanding} vs destino principal={tgt.principal} "
                f"cobrado={tgt.collected} pendiente={tgt.outstanding}"
            )
    return differences


async def build(db: AsyncSession, plan: MigrationPlan) -> Reconciliation:
    """Compare the loadable set against the host database."""
    source, source_loans, source_payments = source_totals(plan.loans)
    target, target_loans, target_payments = await target_totals(
        db, {loan.number for loan in plan.loans}
    )

    differences = _diff_currencies(source, target)
    if (source_loans, source_payments) != (target_loans, target_payments):
        differences.append(
            f"conteos: origen ({source_loans} préstamos, {source_payments} pagos) vs "
            f"destino ({target_loans} préstamos, {target_payments} pagos)"
        )

    return Reconciliation(
        source_loans=source_loans,
        source_payments=source_payments,
        target_loans=target_loans,
        target_payments=target_payments,
        source=source,
        target=target,
        differences=differences,
    )
