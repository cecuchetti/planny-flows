- source_plan: none
  summary: Build the loan registry and payment-recording workflows.
  evidence: Split from the loan-manager delivery because it depends on the foundation and borrower directory but is independently shippable.
- source_plan: none
  summary: Add loan lifecycle controls for closing, reopening, write-offs, and active/closed views.
  evidence: Split from the loan-manager delivery because lifecycle controls can be delivered after the core loan registry.
- source_plan: none
  summary: Build payment receipts with historical snapshots, printing, and PNG export.
  evidence: Split from the loan-manager delivery because receipt delivery is a separate user-facing workflow built on registered payments.
- source_plan: none
  summary: Create the one-time legacy-data migration and reconciliation workflow.
  evidence: Split from the loan-manager delivery because migration is an operational deliverable to run after the destination domain is established.
- source_plan: none
  summary: Add the per-currency loan portfolio dashboard and drill-through activity views.
  evidence: Split from the loan-manager delivery because analytics can ship after loans and payments exist.
- source_plan: none
  summary: Register and delete loan payments with immutable snapshots and system-derived balances.
  evidence: Split from Epic 2 (loan registry and payments) on human confirmation so the registry ships as a reviewed increment first; payments attach to loans that must exist and are independently shippable on their own.
- source_plan: none
  summary: Run the migration spike validating data extraction and the borrower name-split/dedup heuristic against real legacy production data.
  evidence: Epic 2 Story 2.8 has a hard data dependency — no read-only copy of the legacy MongoDB source, its connection string, or the legacy application checkout is present in this workspace.
- source_plan: `_bmad-output/plan-portfolio-dashboard.md`
  summary: Move the whole app to timezone-aware timestamps so "cobrado del mes" (and every date) follows the operator's local calendar month instead of UTC.
  evidence: The dashboard's `collected_this_month` windows on `datetime.utcnow()`, matching the repo-wide naive-UTC convention, but an operator in a UTC-offset locale can see a payment near a month boundary counted in the adjacent UTC month. This is pre-existing, not introduced by the dashboard.
