"""Human- and machine-readable reports for the migration commands."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from planny_loans.migration.load import LoadReport
from planny_loans.migration.money import ZERO, money
from planny_loans.migration.reconcile import Reconciliation, Totals
from planny_loans.migration.transform import MigrationPlan

__all__ = ["render_migration", "render_reconciliation", "render_spike"]


def _f(value: Decimal | int | float) -> str:
    return f"{money(Decimal(str(value))):.2f}"


def _currency(currency: str, totals: Totals) -> dict[str, str]:
    return {
        "currency": currency,
        "principal": _f(totals.principal),
        "collected": _f(totals.collected),
        "outstanding": _f(totals.outstanding),
    }


def _base_payload(plan: MigrationPlan) -> dict[str, Any]:
    borrowers = [
        {
            "firstName": m.first_name,
            "lastName": m.last_name,
            "sourceNames": m.source_names,
            "ambiguous": m.ambiguous,
            "reasons": m.reasons,
        }
        for m in plan.borrowers.mappings.values()
    ]
    loans = []
    for loan in plan.loans:
        total_paid = sum((p.amount for p in loan.payments), ZERO)
        loans.append(
            {
                "number": loan.number,
                "borrower": loan.source_name,
                "currency": loan.currency,
                "amount": _f(loan.amount),
                "advancePaid": _f(loan.advance),
                "payments": len(loan.payments),
                "pendingBalance": _f(money(loan.amount - loan.advance - total_paid)),
                "status": loan.status,
                "closedAt": loan.closed_at.isoformat() if loan.closed_at else None,
                "warnings": loan.warnings,
            }
        )
    return {
        "source": {
            "loans": plan.source_loan_count,
            "payments": plan.source_payment_count,
        },
        "borrowers": borrowers,
        "loans": loans,
        "skipped": [{"number": s.source_number, "reason": s.reason} for s in plan.skipped],
        "warnings": plan.warnings,
    }


def render_spike(plan: MigrationPlan, *, as_json: bool = False) -> str:
    """The Story 2.8 spike report: extraction counts and the name heuristic."""
    return _render(_base_payload(plan), as_json)


def render_migration(
    plan: MigrationPlan,
    load_report: LoadReport,
    reconciliation: Reconciliation | None,
    *,
    as_json: bool = False,
) -> str:
    """The full run report: spike + load, plus reconciliation when it exists.

    A dry-run has no reconciliation — nothing was written, so there is nothing to
    compare against the source yet.
    """
    payload = _base_payload(plan)
    payload["load"] = {
        "dryRun": load_report.dry_run,
        "borrowersCreated": load_report.borrowers_created,
        "borrowersReused": load_report.borrowers_reused,
        "loansCreated": load_report.loans_created,
        "loansSkipped": load_report.loans_skipped,
        "paymentsCreated": load_report.payments_created,
    }
    if reconciliation is not None:
        payload["reconciliation"] = _reconciliation_payload(reconciliation)
    payload["cutover"] = {"nextLoanNumber": _next_loan_number(plan)}
    return _render(payload, as_json)


def _next_loan_number(plan: MigrationPlan) -> int:
    """The sequence continues from the migrated maximum (Story 5.5)."""
    return max((loan.number for loan in plan.loans), default=0) + 1


def _reconciliation_payload(reconciliation: Reconciliation) -> dict[str, Any]:
    return {
        "matches": reconciliation.matches,
        "source": {
            "loans": reconciliation.source_loans,
            "payments": reconciliation.source_payments,
            "currencies": [
                _currency(c, reconciliation.source[c])
                for c in sorted(reconciliation.source)
            ],
        },
        "target": {
            "loans": reconciliation.target_loans,
            "payments": reconciliation.target_payments,
            "currencies": [
                _currency(c, reconciliation.target[c])
                for c in sorted(reconciliation.target)
            ],
        },
        "differences": reconciliation.differences,
    }


def render_reconciliation(reconciliation: Reconciliation, *, as_json: bool = False) -> str:
    """The reconciliation report on its own."""
    return _render({"reconciliation": _reconciliation_payload(reconciliation)}, as_json)


def _render(payload: dict[str, Any], as_json: bool) -> str:
    if as_json:
        return json.dumps(payload, ensure_ascii=False, indent=2, default=str)
    return _render_text(payload)


def _render_text(payload: dict[str, Any]) -> str:
    lines: list[str] = []

    source = payload.get("source")
    if source:
        lines.append("Extracción")
        lines.append(f"  Préstamos: {source['loans']}")
        lines.append(f"  Pagos: {source['payments']}")
        lines.append("")

    borrowers = payload.get("borrowers")
    if borrowers is not None:
        lines.append(f"Prestatarios ({len(borrowers)})")
        for b in borrowers:
            state = " (revisar)" if b["ambiguous"] else ""
            names = ", ".join(b["sourceNames"])
            lines.append(f"  {b['firstName']} {b['lastName']}{state}  <-  {names}")
        lines.append("")

    loans = payload.get("loans")
    if loans is not None:
        lines.append(f"Préstamos ({len(loans)})")
        for loan in loans:
            lines.append(
                f"  Nº {loan['number']:>05}  {loan['borrower']}  {loan['currency']} "
                f"{loan['amount']}  pendiente {loan['pendingBalance']}  {loan['status']}"
            )
        lines.append("")

    skipped = payload.get("skipped")
    if skipped is not None:
        lines.append(f"Omitidos ({len(skipped)})")
        for item in skipped:
            lines.append(f"  {item['number']}: {item['reason']}")
        lines.append("")

    load = payload.get("load")
    if load is not None:
        mode = "ensayo (sin escritura)" if load["dryRun"] else "carga"
        lines.append(f"Carga ({mode})")
        lines.append(f"  Prestatarios creados: {load['borrowersCreated']}")
        lines.append(f"  Prestatarios reutilizados: {load['borrowersReused']}")
        lines.append(f"  Préstamos creados: {load['loansCreated']}")
        lines.append(f"  Préstamos omitidos: {load['loansSkipped']}")
        lines.append(f"  Pagos creados: {load['paymentsCreated']}")
        lines.append("")

    cutover = payload.get("cutover")
    if cutover is not None:
        lines.append(f"Corte: el siguiente préstamo será el Nº {cutover['nextLoanNumber']:05d}")
        lines.append("")

    recon = payload.get("reconciliation")
    if recon is not None:
        verdict = "✓ coincide" if recon["matches"] else "✗ difiere"
        lines.append(f"Reconciliación: {verdict}")
        lines.append(
            f"  Préstamos: origen {recon['source']['loans']} / "
            f"destino {recon['target']['loans']}"
        )
        lines.append(
            f"  Pagos: origen {recon['source']['payments']} / "
            f"destino {recon['target']['payments']}"
        )
        for c in recon["source"]["currencies"]:
            lines.append(
                f"  {c['currency']}: principal {c['principal']} · cobrado {c['collected']} "
                f"· pendiente {c['outstanding']}"
            )
        for difference in recon["differences"]:
            lines.append(f"  Diferencia: {difference}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"
