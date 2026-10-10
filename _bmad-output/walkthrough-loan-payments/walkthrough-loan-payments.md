# Walkthrough: loan payments (register, snapshot, delete)

Target: `0a6d9c1250cab98f200155e67f7a2909c2cc6e39` — "feat: register, snapshot and delete loan payments" (17 files, +1493/−151), baseline `cd3b64a43f520f70be10f061aba996642e6a405a`.

- [x] ## 1. Intent

_state: done_

_Accepted by the reviewer without changes._

**Problem:** The operator can register a loan and its advance-paid amount but cannot record a payment: there is no payment storage, and the derived balance only knows `amount − advancePaid`. Without payments the ledger is a list of what was lent, not what was collected. Epic 2's Stories 2.5 and 2.6 are unbuilt (FR10–FR13).

**Approach:** Add a `payment` table whose rows each carry an immutable snapshot, extend the single derived-balance function to subtract the payments sum (the one place Epic 3's status evaluation will later plug into), expose payment registration, history and deletion as nested routes under the loan, and give the loan edit view a payment section.

_Quoted verbatim from the `## Intent` section inside `<frozen-after-approval>` in [plan-loan-payments.md](../../_bmad-output/plan-loan-payments.md)._

- [ ] ## 2. Broad strokes

_state: paused_

The change has one mechanism: a payment row is inserted with its snapshot already computed, and every balance is recomputed by summing the payments of the loan at read time. Nothing stores a balance. Open these in order and the whole shape is visible.

- [packages/planny-loans/src/planny_loans/loans/router.py:91](../../packages/planny-loans/src/planny_loans/loans/router.py#L91) — the nested `POST /loans/{loan_id}/payments` route; its siblings at [router.py:81](../../packages/planny-loans/src/planny_loans/loans/router.py#L81) and [router.py:99](../../packages/planny-loans/src/planny_loans/loans/router.py#L99) are the history and the delete.
- [packages/planny-loans/src/planny_loans/loans/service.py:302](../../packages/planny-loans/src/planny_loans/loans/service.py#L302) — `create_payment`, which validates against the true outstanding balance and freezes the snapshot on the new row.
- [packages/planny-loans/src/planny_loans/loans/service.py:93](../../packages/planny-loans/src/planny_loans/loans/service.py#L93) — `pending_balance`, the single place a balance is derived: `amount − advancePaid − Σ payments`.
- [packages/planny-core/src/planny_core/models/payment.py:28](../../packages/planny-core/src/planny_core/models/payment.py#L28) — the `payment` table and the four snapshot columns that make a payment row self-describing.
- [client/src/Loans/LoanForm/index.jsx:273](../../client/src/Loans/LoanForm/index.jsx#L273) — the edit view's payment section: register, history, and per-row delete behind the existing confirmation dialog.

### Paused: reviewer raised visual integration

The reviewer stopped the walkthrough here. Their constraint, verbatim: *"No solo falta el enlace, el estilo visual de la aplicación es completamente diferente a la aplicacion original de manejo de proyectos. Debe ser una sola aplicacion integrada, con el mismo estilo y mismos componentes visuales"* — Loans must be one application with the project-management views, sharing the same visual language and components.

What is already true (verified in this session, not assumed): the "Préstamos" sidebar entry exists below Kanban Board, gated by the build flag, at [client/src/Project/Sidebar/index.jsx:65](../../client/src/Project/Sidebar/index.jsx#L65), and the route is registered at [client/src/App/Routes.jsx:48](../../client/src/App/Routes.jsx#L48). The gap is styling: the Loans views carry their own palette and raw form controls in [client/src/Loans/Styles.js:1](../../client/src/Loans/Styles.js#L1) instead of the shared components under [client/src/shared/components/index.js:1](../../client/src/shared/components/index.js#L1) and the design tokens in [client/src/shared/utils/styles.js:1](../../client/src/shared/utils/styles.js#L1).

The reviewer asked for that as a separate change; it is being planned as its own build, not as part of this walkthrough. This block and blocks 3–8 remain unreviewed.

- [ ] ## 3. Slice: the payment table and its migration

_state: unvisited_

- [ ] ## 4. Slice: derived balance, snapshot and the guards

_state: unvisited_

- [ ] ## 5. Slice: the nested payment routes

_state: unvisited_

- [ ] ## 6. Slice: the loan edit view's payment section

_state: unvisited_

- [ ] ## 7. Slice: tests and the Cypress flows

_state: unvisited_

- [ ] ## 8. Periphery

_state: unvisited_
