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
