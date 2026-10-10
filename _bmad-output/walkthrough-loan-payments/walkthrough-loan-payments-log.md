# Review log: loan payments walkthrough

Target: 0a6d9c1250cab98f200155e67f7a2909c2cc6e39 — feat: register, snapshot and delete loan payments

## 1 — Orientation — narrative created

Session: session-b3eb375b-c3f2-4292-b0ea-4f900dc8a872 · Timestamp: 2026-10-10T12:46:40-03:00

- Action: created the narrative and this log for the walkthrough target.
- Result: walkthrough opened on commit 0a6d9c1; blocks 2–8 pending.
- Evidence: commit 0a6d9c1250cab98f200155e67f7a2909c2cc6e39 and `_bmad-output/plan-loan-payments.md`.
- Open: blocks 2–8 not yet visited.

## 2 — Broad strokes — paused for a separate change

Session: session-b3eb375b-c3f2-4292-b0ea-4f900dc8a872 · Timestamp: 2026-10-10T13:23:32-03:00

- Action: reviewer raised that the Loans client does not share the project app's visual language or components.
- Result: walkthrough paused mid-block; already-implemented sidebar entry and route verified in source and in the current build; styling gap accepted as a separate change to plan and build. Blocks 2–8 unreviewed.
- Evidence: [client/src/Project/Sidebar/index.jsx:65](../../client/src/Project/Sidebar/index.jsx#L65) and [client/src/App/Routes.jsx:48](../../client/src/App/Routes.jsx#L48), plus the current build containing the flag-gated entry.
- Open: the visual integration change, not yet started.

## 3 — Broad strokes + slice: payment table — resumed and re-anchored

Session: session-b3eb375b-c3f2-4292-b0ea-4f900dc8a872 · Timestamp: 2026-10-10T14:47:45-03:00

- Action: resumed the review after the visual-integration change landed; refreshed block 2's anchors and accepted it; opened the table/migration slice.
- Result: block 2 done, block 3 current.
- Evidence: commit 3a7e22d and the payment model/revision paths above — [payment.py:28](../../packages/planny-core/src/planny_core/models/payment.py#L28) and [alembic/versions/7d1f4b2c9a30_add_payment.py:14](../../alembic/versions/7d1f4b2c9a30_add_payment.py#L14).
- Open: blocks 3–8 still to review.

## 4 — Slice: derived balance, snapshot and the guards — slice accepted and the walkthrough closed

Session: session-b3eb375b-c3f2-4292-b0ea-4f900dc8a872 · Timestamp: 2026-10-10T15:02:03-03:00

- Action: reviewed the single derivation point, the single snapshot builder, the amount and currency guards, and the post-flush `flag_modified` write of the snapshot id.
- Result: reviewer decided that a reversed collection must remain nameable by later receipts and that the balance must recompute — which it already does, since the balance is derived on every read. "Revert" therefore replaces "delete" for payments; that change is being built as its own change, and the receipt wording is Epic 4. Blocks 5–8 left unreviewed; the source they target changed after the walkthrough paused.
- Evidence: the measured earlier-delete case above, plus the service/repository links.
- Open: blocks 5–8 unreviewed (deferred); the reversal change is separate.
