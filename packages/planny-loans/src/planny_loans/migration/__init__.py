"""The one-time legacy-data migration (Epic 5).

Operational tooling, not an API domain: it exposes no ``MODULE``/``MODULES`` and
is never mounted by the kernel. It is invoked as a CLI — ``planny-migrate`` or
``python -m planny_loans.migration`` — to run the extract → transform → load
pipeline with a dry-run, a name-split/dedup spike, and a reconciliation report.
"""

from __future__ import annotations

from planny_loans.migration import extract, load, reconcile, report, transform

__all__ = ["extract", "load", "reconcile", "report", "transform"]
