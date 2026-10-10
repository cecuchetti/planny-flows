# Walkthrough: loan payments (register, snapshot, delete)

Target: `0a6d9c1250cab98f200155e67f7a2909c2cc6e39` — "feat: register, snapshot and delete loan payments" (17 files, +1493/−151), baseline `cd3b64a43f520f70be10f061aba996642e6a405a`.

_Closed after block 4: the review produced a design decision that is being built as its own change; blocks 5–8 were left unreviewed._

- [x] ## 1. Intent

_state: done_

_Accepted by the reviewer without changes._

**Problem:** The operator can register a loan and its advance-paid amount but cannot record a payment: there is no payment storage, and the derived balance only knows `amount − advancePaid`. Without payments the ledger is a list of what was lent, not what was collected. Epic 2's Stories 2.5 and 2.6 are unbuilt (FR10–FR13).

**Approach:** Add a `payment` table whose rows each carry an immutable snapshot, extend the single derived-balance function to subtract the payments sum (the one place Epic 3's status evaluation will later plug into), expose payment registration, history and deletion as nested routes under the loan, and give the loan edit view a payment section.

_Quoted verbatim from the `## Intent` section inside `<frozen-after-approval>` in [plan-loan-payments.md](../../_bmad-output/plan-loan-payments.md)._

- [x] ## 2. Broad strokes

_state: done_

_Re-anchored on the resumed review: `3a7e22d` rewrote the Loans client after this walkthrough paused, so the entry points below are the current ones._

The mechanism is one insert and one derivation. A payment is inserted with its snapshot already computed on the row, and every balance is recomputed at read time by summing that loan's payments. Nothing ever stores a balance.

- [packages/planny-loans/src/planny_loans/loans/router.py:91](../../packages/planny-loans/src/planny_loans/loans/router.py#L91) — the nested `POST /loans/{loan_id}/payments`; its siblings are the history at [router.py:81](../../packages/planny-loans/src/planny_loans/loans/router.py#L81) and the delete at [router.py:99](../../packages/planny-loans/src/planny_loans/loans/router.py#L99).
- [packages/planny-loans/src/planny_loans/loans/service.py:302](../../packages/planny-loans/src/planny_loans/loans/service.py#L302) — `create_payment`: validates against the true outstanding balance and freezes the snapshot on the new row.
- [packages/planny-loans/src/planny_loans/loans/service.py:93](../../packages/planny-loans/src/planny_loans/loans/service.py#L93) — `pending_balance`, the single place a balance is derived: `amount − advancePaid − Σ payments`.
- [packages/planny-core/src/planny_core/models/payment.py:28](../../packages/planny-core/src/planny_core/models/payment.py#L28) — the `payment` table with the four snapshot columns that make a row self-describing.
- [client/src/Loans/LoanForm/index.jsx:373](../../client/src/Loans/LoanForm/index.jsx#L373) — the edit view's payment section: register at [:279](../../client/src/Loans/LoanForm/index.jsx#L279) and delete at [:292](../../client/src/Loans/LoanForm/index.jsx#L292).

- [x] ## 3. Slice: the payment table and its migration

_state: done_

One row per payment, and each row carries its own frozen copy of the loan's state at that moment: the balance after the payment, the total collected, the advance in effect, and the history up to and including it. That is the decision that shapes everything else — a receipt re-rendered later cannot change, even if a later payment is deleted.

Read in this order:

1. [payment.py:28](../../packages/planny-core/src/planny_core/models/payment.py#L28) — the table. `amount` and the snapshot amounts are `Numeric(14,2)`; [payment.py:42](../../packages/planny-core/src/planny_core/models/payment.py#L42) is the JSON history.
2. [payment.py:27](../../packages/planny-core/src/planny_core/models/payment.py#L27) and the file's docstring — why the snapshot is stored rather than reconstructed from sibling rows.
3. [alembic/versions/7d1f4b2c9a30_add_payment.py:14](../../alembic/versions/7d1f4b2c9a30_add_payment.py#L14) — the revision, one step off `9c3e5a7b1d20`, with the index and the `ON DELETE CASCADE` foreign key.
4. [loan.py:58](../../packages/planny-core/src/planny_core/models/loan.py#L58) — the other side of the relationship, left lazy so the loan list stays one query.
5. [test_migrations.py:166](../../packages/planny-core/tests/test_migrations.py#L166) — what the suite pins about the table.

- [x] ## 4. Slice: derived balance, snapshot and the guards

_state: done_

The reviewer settled the design question this slice raised: a reversed collection must stay visible on the receipts of later payments, and the balance must recompute on its own.

- The balance already recomputes by construction, not by repair: there is no stored balance, and `pending_balance` sums the payments on every read ([service.py:93](../../packages/planny-loans/src/planny_loans/loans/service.py#L93), [repository.py:45](../../packages/planny-loans/src/planny_loans/loans/repository.py#L45)).
- What the decision changes is deletion: a reversed payment cannot be a `DELETE`, because a later receipt has to be able to name it. `create_payment`'s snapshot history stores each entry's id ([service.py:83](../../packages/planny-loans/src/planny_loans/loans/service.py#L83)), so the row has to survive.
- Measured behaviour today, for the record: loan of 1000 with payments 200 then 300 leaves the balance at 500.00 and the second payment's snapshot at `totalPaid: 500.00` with history `[{id 1, 200.00}, {id 2, 300.00}]`. Deleting the **earlier** payment recomputes the balance to 700.00 but leaves that snapshot byte-identical — it still names payment 1, which no longer exists.

The change that follows from this decision — reversing instead of deleting, excluding reversed payments from the balance and from the collection guards, a reversal marker with its migration, and the history showing the reversed row — is being built as its own change. The "esta cobranza fue revertida" wording belongs to the receipt itself, which is Epic 4.

- [ ] ## 5. Slice: the nested payment routes

_state: unreviewed (deferred)_

- [ ] ## 6. Slice: the loan edit view's payment section

_state: unreviewed (deferred)_

- [ ] ## 7. Slice: tests and the Cypress flows

_state: unreviewed (deferred)_

- [ ] ## 8. Periphery

_state: unreviewed (deferred)_
