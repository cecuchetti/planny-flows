---
title: 'Loan payments: register, snapshot, delete'
type: 'feature'
ticket: ''
created: '2026-10-07'
status: 'ready-for-dev'
baseline_revision: 'cd3b64a43f520f70be10f061aba996642e6a405a'
route: 'full'
route_source: 'auto'
risk: 'high'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context:
  - '.custom/loan-app-migration/_bmad-output/planning-artifacts/epics.md'
  - 'docs/architecture/architecture-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The operator can register a loan and its advance-paid amount but cannot record a payment: there is no payment storage, and the derived balance only knows `amount − advancePaid`. Without payments the ledger is a list of what was lent, not what was collected. Epic 2's Stories 2.5 and 2.6 are unbuilt (FR10–FR13).

**Approach:** Add a `payment` table whose rows each carry an immutable snapshot, extend the single derived-balance function to subtract the payments sum (the one place Epic 3's status evaluation will later plug into), expose payment registration, history and deletion as nested routes under the loan, and give the loan edit view a payment section.

## Boundaries & Constraints

**Always:** keep the model in `planny_core/models/` and the revision in the root `alembic/versions/`; store each snapshot on its own row rather than recomputing it from siblings; derive the balance, never store it; round money through the existing `_money()` and serialize it as the existing two-decimal string; timestamp payments on the server; reject with the host error envelope, catalogued codes and Spanish messages; reuse `ConfirmModal` and the toast.

**Never:** add a stored `pendingBalance` column; add `status`/`closedAt`/`writtenOffAmount` (Epic 3) or receipts (Epic 4); accept a client-supplied payment date; let a loan deletion orphan its payments; change any existing loan or borrower behaviour beyond the balance gaining its payments term; add client dependencies.

## Decisions

- **The snapshot is stored, not reconstructed.** `paymentsHistoryAtPayment` holds the list up to and including that payment. Reconstructing it from sibling rows would silently rewrite a past receipt the moment a later payment is deleted, which is exactly the fidelity Epic 4's historical receipts depend on.
- **One recalculation point.** `service.pending_balance` becomes `async def pending_balance(db, loan)` and sums the payments; every balance-affecting path (loan create/update, payment create/delete) goes through it, and its docstring marks it as where Epic 3's status evaluation attaches. The four router call sites become `await`.
- **Table `payment`, FK column `loan_id`** — snake_case, matching the `loan.borrower_id` convention that the borrowers count guard already binds.
- **Loan deletion cascades to its payments** (FR5), which makes the delete dialog's consequence true again: its copy returns to naming the associated payments, undoing the earlier change made when they did not exist.
- **Routes are nested** under the loan (`/loans/{loan_id}/payments`), following the `jira/issues/{issue_key}/transitions` precedent; history is its own `GET` so the lean loan list stays one query.
- Payment `date` is `datetime.utcnow` at insert, never from the payload (FR10).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| PAY_HAPPY | amount within the outstanding balance | 201; snapshot stored; balance drops by exactly that amount | none |
| PAY_ADVANCE_SNAPSHOT | loan with `advancePaid > 0` | snapshot records the advance in effect (FR-I3) | none |
| PAY_OVER | amount > `amount − advancePaid − Σ payments` | rejected | 400 `BAD_USER_INPUT` (es) |
| PAY_NONPOSITIVE | amount ≤ 0, blank, or non-numeric | rejected | 400 `BAD_USER_INPUT` (es) |
| PAY_UNKNOWN_LOAN | loan id absent | rejected | 404 `ENTITY_NOT_FOUND` (es) |
| HISTORY_ORDER | two payments | `GET …/payments` returns oldest first | none |
| SNAPSHOT_FROZEN | delete the *second* payment | the first payment's snapshot is byte-identical afterwards | none |
| PAY_DELETE | existing payment | 204; balance recomputed through the same point | none |
| PAY_DELETE_UNKNOWN | payment id absent from that loan | rejected | 404 `ENTITY_NOT_FOUND` (es) |
| LOAN_DELETE_CASCADE | loan with payments | loan and every payment gone | none |

</frozen-after-approval>

## Code Map

Roots: `packages/planny-core/src/planny_core/`, `packages/planny-loans/src/planny_loans/loans/`, `packages/planny-loans/tests/`, `packages/planny-core/tests/`, `alembic/versions/`, `client/src/Loans/`.

- `models/payment.py` — NEW `Payment(Base)`, `__tablename__="payment"`, modelled on `loan.py`: `id` PK, `loan_id` `ForeignKey("loan.id")` + index, `amount` `Numeric(14,2)`, `date` `DateTime`, and the four snapshot columns `pendingBalanceAtPayment`, `totalPaidAtPayment` (`Numeric(14,2)`), `advancePaidAtPayment` (`Numeric(14,2)`), `paymentsHistoryAtPayment` (`JSON`, the list up to and including this payment); `createdAt`. Add `payments` to `Loan` and `loan` to `Payment` as relationships, following the `Borrower.loans` / `Loan.borrower` pair.
- `models/__init__.py` — import and `__all__` entry, as `Loan` has.
- `alembic/versions/<rev>_add_payment.py` — NEW, hand-written like `9c3e5a7b1d20_add_loan.py`, `down_revision = "9c3e5a7b1d20"` (the current single head): the table, an index on `loan_id`, and a FK to `loan.id`.
- `loans/repository.py` — add `list_payments(db, loan_id)` ordered oldest first, `sum_payments(db, loan_id)`, `get_payment(db, loan_id, payment_id)` scoped to its loan, and `history(db, loan_id)` shaped for the snapshot.
- `loans/service.py` — `pending_balance` becomes async and subtracts the payments sum; `create_payment(db, loan_id, values)` validates against the outstanding balance, freezes the four snapshot fields and returns the row; `delete_payment(db, loan_id, payment_id)`; `delete` removes the loan's payments before the loan. `_money` stays the only rounding point, and the Epic 3 hook is documented on `pending_balance`.
- `loans/schemas.py` + `serializers.py` — a `PaymentRequest` in the `LoanRequest` style (`amount` only, permissive `object`, camelCase) and `payment_to_dict`, reusing `money()` so amounts stay two-decimal strings and dates ISO.
- `loans/router.py` — `POST`/`GET` on `""` → `"/{loan_id}/payments"` and `DELETE` on `"/{loan_id}/payments/{payment_id}"`, 201/200/204, delegating to `service`; the four existing call sites of `pending_balance` gain `await`.
- `tests/test_payments.py` — NEW; the `client` fixture and HTTP-only setup copied from `test_loans.py`, one test per matrix row.
- `../../planny-core/tests/test_migrations.py` — extend the table enumeration to `payment`, mirroring the `loan` block (`:165-171`).
- `money.js` — `pendingBalancePreview(amount, advancePaid, paymentsTotal = 0)` and a `paymentsTotal` helper; the existing Jest file covers it.
- `LoanForm/index.jsx` — an edit-mode payment section: amount input, register action, and the history list with per-row delete behind `ConfirmModal`. Its balance preview passes the payments total.
- `copy.js` — payment strings in voseo, and `loansListCopy.removeMessage` restored to name the associated payments.
- `cypress/integration/loans.spec.js` — a register-payment flow and a delete-payment flow, keeping the Jira-500 guard.

## Tasks & Acceptance

**Execution:**
- [ ] `models/payment.py` + `models/__init__.py` — the table and both relationship sides.
- [ ] `alembic/versions/<rev>_add_payment.py` — one linear revision off `9c3e5a7b1d20`.
- [ ] `loans/repository.py` + `loans/service.py` — the sums, the snapshots, the async balance and the cascade.
- [ ] `loans/schemas.py` + `loans/serializers.py` + `loans/router.py` — the nested payment routes.
- [ ] `tests/test_payments.py` — one test per matrix row.
- [ ] `../../planny-core/tests/test_migrations.py` — cover `payment`.
- [ ] `money.js` + `LoanForm/index.jsx` + `copy.js` — capture, history and deletion in the edit view.
- [ ] `cypress/integration/loans.spec.js` — the two new flows.

**Acceptance Criteria:**
- Given a loan with an outstanding balance, when I register a payment, then it is stored with a server timestamp and a snapshot, and the balance shown drops by exactly that amount.
- Given a payment larger than the outstanding balance, then it is rejected with a Spanish message and nothing is written.
- Given two payments, when I delete the later one, then the balance is recomputed and the earlier payment's snapshot is unchanged.
- Given a loan with payments, when I delete the loan, then its payments go with it.
- Given the edit view, when I register or delete a payment, then the history list and the balance refresh without a page reload and a toast reports the result.

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Verification

**Commands:**
- `uv run pytest packages/planny-loans/tests/test_payments.py -v` -- expected: all pass
- `uv run pytest packages/ -q` -- expected: 816 plus the new tests
- `uv run pytest packages/planny-api/tests/test_architecture.py -q` and `uv run pytest packages/planny-core/tests/test_migrations.py -q` -- expected: pass
- `uv run ruff check packages/` and `uv run mypy packages/` -- expected: clean
- `uv run --with alembic alembic upgrade head` -- expected: one head, the new revision applied
- `cd client && npm run test:jest && npx eslint src && npm run build` -- expected: pass
- Cypress `loans.spec.js` with the dev server on 8192 (`env -u ELECTRON_RUN_AS_NODE`) -- expected: the existing 8 plus the 2 new flows

**Manual checks:** register a partial payment and confirm the balance; delete it and confirm the balance returns; register an overpayment and confirm the Spanish refusal.
