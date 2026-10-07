---
title: 'Loan registry and Préstamos views'
type: 'feature'
ticket: ''
created: '2026-10-07'
status: 'built'
baseline_revision: 'b3003cb866c390655d5b2fdb7d3fff9c640ff96f'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context:
  - 'docs/architecture/architecture-contract.md'
  - 'docs/loans-copy-style.md'
  - '.custom/loan-app-migration/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/loans` registers people but not loans: no loan record, no numbered ledger, and `borrowers/repository.py:37` counts a `loan` table that does not exist, so a person who owes money can still be deleted. Epic 2's registry half is unbuilt (FR1–FR5, FR19, FR21, FR37, FR38; UX-DR5, UX-DR14).

**Approach:** Add an auto-discovered `loans` backend domain (CRUD, server-assigned zero-padded number, derived pending balance, Spanish validation) plus the two views that use it: "Nuevo Préstamo" (create/edit, live preview, Story 1.5 picker) and "Préstamos" (cards with edit and delete). Personas gains a linked-loan count.

## Boundaries & Constraints

**Always:** backend vertical (`router`→`service`→`repository`) with every query in `repository.py`; money `Numeric(14,2)` rounded to 2 decimals through one `_money()` helper; host error envelope with catalogued codes and Spanish messages; canonical `/api/v1/loans` (the alias is automatic); reuse `ConfirmModal`, `shared/utils/toast`, `shared/utils/api`, `Button`, `Styles.js`; copy in casual Rioplatense voseo.

**Never:** touch `app/factory.py`, the kernel or the module registry; SQL or `sqlalchemy.orm` in `router.py`; accept or edit a client-supplied `number`; add `status`/`closedAt`/`writtenOffAmount` (Epic 3), payments, receipts, dashboard or migration work; a second toast provider or browser alerts; new client dependencies (no jsdom, no testing-library) — UI behavior is covered in Cypress.

**Deferred by the human's split — do not build:** payment records and their snapshot fields (Story 2.1's snapshot criterion), the edit view's payment-history rows (UX-DR5), Story 2.8's migration spike.

## Decisions

- `loan.borrower_id` stays snake_case: `borrowers/repository.py:33-45` binds that name and returns 0 when the table is missing, so renaming it would silently disable the delete guard.
- `number` is a unique `int` serialized zero-padded (`"00001"`); next = `max(number)+1`, so a backfilled legacy maximum continues the sequence. The column takes explicit values for Epic 5's backfill; the API never does.
- `pendingBalance` is not stored: the service derives `amount − advancePaid`, the serializer exposes it; payments add the sum term later.
- `concept` and `lender` are required (PRD FR-A1); `city` defaults `"Córdoba"`, `currency` `USD`, `date` today, `advancePaid` to `0` and `installmentAmount` to `null`; advance-paid is labelled "Pago adelantado". Currency is editable only while `advancePaid == 0`; an amount edit driving the balance below 0 is rejected.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| CREATE_HAPPY | valid payload, existing borrower | 201, `number:"00001"`, `pendingBalance = amount − advancePaid` | none |
| CREATE_NEXT | numbers `00001`,`00002` | next is `00003` | none |
| AFTER_BACKFILL | a row with `number=41` | next is `00042` | none |
| ADVANCE_INVALID | `advancePaid < 0` or `> amount` | rejected | 400 `BAD_USER_INPUT` (es) |
| INSTALLMENT_INVALID | `installmentAmount < 0` | rejected | 400 `BAD_USER_INPUT` (es) |
| REQUIRED_MISSING | `amount<=0`, or blank borrower/concept/lender/date | rejected | 400 `BAD_USER_INPUT` |
| UNKNOWN_BORROWER | `borrowerId` absent from `borrower` | rejected | 404 `ENTITY_NOT_FOUND` (es) |
| LOCKED_CURRENCY | edit `currency` while `advancePaid>0` | rejected | 400 `BAD_USER_INPUT` (es) |
| AMOUNT_BELOW_ADVANCE | edit `amount` below `advancePaid` | rejected | 400 `BAD_USER_INPUT` |
| NUMBER_IMMUTABLE | edit payload carrying `number` | ignored, number unchanged | none |
| DELETE_LINKED_BORROWER | delete a borrower holding a real loan row | blocked | 409 `CONFLICT` (es) |
| NOT_FOUND | unknown id on get/put/delete | rejected | 404 `ENTITY_NOT_FOUND` (es) |

</frozen-after-approval>

## Code Map

Roots: `packages/planny-core/src/planny_core/`, `packages/planny-api/src/planny_api/`, `packages/planny-api/tests/`, `packages/planny-core/tests/`, `client/src/Loans/`, `client/cypress/integration/`.

- `models/loan.py` — NEW `Loan(Base)`, `__tablename__="loan"`; model it on `borrower.py` (`id` PK, `createdAt`/`updatedAt` `DateTime(default=datetime.utcnow)`). Columns: `number` int unique, `borrower_id` `ForeignKey("borrower.id")` + index, `amount`/`advancePaid`/`installmentAmount` `Numeric(14,2)` (`daily_hours.py:27`), `currency` `String(3)`, `date` `Date`, `concept` `String(500)`, `lender` `String(200)`, `city` `String(120)`; eagerly-loaded `borrower` relationship (`issue.py:71`) so the list stays one query.
- `models/__init__.py` — import and `__all__` entry (`Borrower` at :17, :42).
- `alembic/versions/<rev>_add_loan.py` — NEW, hand-written after `6b4f2c9d1a77_add_borrower.py` with `down_revision="6b4f2c9d1a77"` (the current single head) and a revision id of the implementer's choosing; table, unique index on `number`, index on `borrower_id`. No autogenerate.
- `modules/loans/__init__.py` — `MODULE = ApiModule(name="loans", router=router, auth=False, tags=("loans",))`.
- `modules/loans/schemas.py` — `LoanRequest` shaped like `BorrowerRequest` (`populate_by_name=True`, camelCase aliases).
- `modules/loans/serializers.py` — `loan_to_dict(loan, pending_balance)`: camelCase, padded `number`, nested `borrower:{id,firstName,lastName}`.
- `modules/loans/repository.py` — `AsyncSession` passed in; `list_loans` (`createdAt DESC, id DESC`), `get`, `next_number`, `borrower_exists`.
- `modules/loans/service.py` — `_money()`, validation, `create`/`update`/`delete`, balance derivation; Spanish errors as at `borrowers/service.py:26`.
- `modules/loans/router.py` — `APIRouter(prefix="/loans")`; `""` GET/POST, `"/{loan_id}"` GET/PUT/DELETE; 201/204; delegates to `service` only.
- `modules/borrowers/repository.py` — leave the raw `loan.borrower_id` SQL; it is the interface the new table must honour.
- `modules/borrowers/router.py` — pass the real count to `borrower_to_dict` (`loanCount` is hardcoded 0 today) — Story 2.7.
- `tests/test_loans.py` — NEW; `client` fixture from `test_borrowers.py:17-37`, real HTTP.
- `tests/test_migrations.py` — extend the schema assertions to `loan`.
- `money.js` + `money.test.js` — `CURRENCIES`, `formatAmount`, `formatLoanNumber`, `pendingBalancePreview`; pure, so node-environment Jest fits.
- `LoanForm/index.jsx` — create/edit form: picker, fields, live preview, save → toast → Préstamos.
- `LoansList/index.jsx` — cards, loading/empty/error+retry, Editar/Eliminar.
- `BorrowerPicker.jsx` — make it controlled: accept `value`, render the selection and let it be changed, keep `onChange(borrower)`.
- `index.jsx` — swap the `new-loan` and `loans` placeholders for the new views; edit route `/loans/new-loan/<id>`.
- `copy.js` — extend `loanCopy`, add form and list strings; keep `loanNavigation`'s five keys in order (`copy.test.js`).
- `Styles.js` — add only `Card`, `Select`, `ErrorText`, `Muted`.
- `Borrowers/index.jsx` — render `loanCount`.
- `loans.spec.js` — extend with create/list/edit/delete; keep the Jira-500 guard.

## Tasks & Acceptance

**Execution:**
- [ ] `models/loan.py` + `models/__init__.py` — add and register `Loan`.
- [ ] `alembic/versions/<rev>_add_loan.py` — one linear revision off `6b4f2c9d1a77`.
- [ ] `modules/loans/` (5 files) — the vertical slice.
- [ ] `tests/test_loans.py` — one test per matrix row plus versioned/unversioned parity.
- [ ] `tests/test_migrations.py` + `modules/borrowers/router.py` — migration coverage and a real `loanCount`.
- [ ] `money.js` + `money.test.js` — formatting and preview math.
- [ ] `copy.js` + `BorrowerPicker.jsx` — strings and controlled selection (edit mode must preselect).
- [ ] `LoanForm/index.jsx` + `LoansList/index.jsx` + `Styles.js` + `index.jsx` — the two views and the edit route.
- [ ] `Borrowers/index.jsx` + `loans.spec.js` — show the count, plus Cypress create/list/edit/delete flows.

**Acceptance Criteria:**
- Given a registered loan, when Préstamos renders, then its card shows `Nº 00001`, amount with currency label, borrower, date, concept, lender, installment when set, and the derived pending balance, newest first.
- Given a loan card, when I press Editar, then the form opens prefilled with that person already selected and a live preview, and saving returns me to Préstamos with a success toast and an updated card.
- Given a loan card, when I press Eliminar, then a ConfirmModal states the consequence, only confirmation removes the loan, and a toast reports it.
- Given Personas, when a person has loans, then the row shows the count and deleting that person is refused with a Spanish message.
- Given a failing request, when a view loads, then it shows a Spanish error with a retry action, never a browser alert.

## Implementation Notes

- Money crosses the wire as a two-decimal **string** (`"1500.50"`), not a float.
  `Numeric(14,2)` comes back from SQLAlchemy as `Decimal`, and serializing that
  to a JSON number reintroduces binary-float rounding on the client. The client
  parses with `toAmount()` for arithmetic and renders with `amountWithCurrency()`.
- `Loan.borrower` needed an explicit `await db.refresh(loan, ["borrower"])` after
  create and update: `lazy="joined"` applies to a `select()`, not to a newly
  added instance, and the serializer reads the relationship.
- A relationship was added on both sides (`Loan.borrower` /
  `Borrower.loans`) rather than a `backref`, so the ORM configuration stays
  explicit and `__init__.py` still lists the model once.
- The loan form's `<form>` cannot contain the picker's inline-creation `<form>`
  (HTML forbids nested forms, so the browser drops the inner element and its
  submit button becomes inert). `BorrowerPicker` now wires saving to the button
  itself; the inner `<form>` is kept for the standalone case, where Enter still
  submits. This was a real pre-existing bug in the picker, not a test artefact.
- `seed-loans` placeholder routes were left alone; only `loans` and `new-loan`
  were replaced. The `new-loan` view doubles as the edit view through
  `key={loanId || 'new'}`, so entering and leaving edit mode remounts the form.
- **Corrected during implementation review.** The two Cypress confirmation cases
  were first parked with `it.skip` on the diagnosis that headless Chrome never
  opens `shared/components/Modal` from its `renderLink` trigger. That diagnosis
  was wrong. `ConfirmModal`'s `renderLink` hands the caller an `open` callback to
  wire itself, and both `Borrowers/index.jsx` and the new `LoansList/index.jsx`
  spread the callback object onto `Button` (`{...props}`) instead: `open` landed
  on the DOM node and `Button` kept its default no-op `onClick`, so **the dialog
  never opened and delete was unreachable in the UI** — a pre-existing bug that
  also affected the Personas directory shipped by the foundation plan. Fixed at
  both call sites as `renderLink={({ open }) => <Button onClick={open}>…`; both
  cases now run and pass, so AC 3 and AC 4 are covered by a green test.

## Plan Change Log

- No route, contract or scope changes. `loanId` is passed to `LoanForm` as the
  URL string (`PropTypes.string`) rather than a number, to match the route param.

## Review Triage Log

Lens: `quick` (pinned), 1 lens, 5 findings. Verdicts: 1 medium, 3 low, 1 false.
Routes: 4 patch, 1 rejected. No intent_gap or bad_plan, so no loopback
(`review_loop_iteration` stays 0).

| # | Finding | Verdict | Route | Evidence and action |
|---|---|---|---|---|
| 1 | `modules/loans/service.py` — on create, `advancePaid > amount` stamps a second error on `amount` reading "…ya registrado", a state create cannot reach | low | patch | Confirmed against the live app: create `amount=100, advancePaid=500` returned `fields` with **both** `advancePaid` and `amount`. No end-user harm today — `shared/utils/toast.js` renders only `error.message`, and no Loans view reads `error.data.fields` — so the harm is to API consumers. The correction is copy, not added complexity, so it is not rejected. **Action:** the conflict is now attributed to the field the request actually moved, with wording that holds on both create and update. Guarded by `test_advance_above_amount_blames_only_the_advance`. |
| 2 | `modules/loans/router.py` — `_values()` emits every key, so the service's `_MISSING` sentinel never fires and `PUT` rejects any body that omits a field | medium | patch | Confirmed: `PUT /api/v1/loans/{id} {"concept":"Nuevo"}` → 400 `{"lender":"El prestamista es obligatorio.","amount":"El monto es obligatorio."}` although both were stored. `service.py` documented the opposite behaviour, and `PUT /api/v1/borrowers/{id}` does fall back to stored values, so the two sibling modules disagreed — a named future caller (Epic 3's closed-loan "descriptive fields only" edit) would hit it. **Action:** `_values()` now emits only `model_fields_set`, so an omitted field keeps its stored value while an explicit `null` still clears one. Guarded by `test_partial_update_keeps_the_fields_it_omits`. |
| 3 | `modules/borrowers/router.py` — only the list route passes a real count, so the detail and update responses report `loanCount: 0` | low | patch | Confirmed: with one loan, `GET /api/v1/borrowers` → `1`, `GET /api/v1/borrowers/{id}` → `0`, `PUT` → `0`. POST is **not** affected — a new borrower genuinely has none. Not user-visible today (the Personas view and the picker both use the list), but one resource reporting two counts is a trap for the next caller. The fix reuses the existing `repository.linked_loan_count`, so it is a direct correction. **Action:** get and update now pass the real count. Guarded by `test_borrower_detail_reports_the_same_count_as_the_directory`. |
| 4 | `client/src/Loans/index.jsx` — clicking "Nuevo Préstamo" from the edit form cannot leave edit mode | false | rejected | Refuted by running it: `select('new-loan')` calls `navigate('/loans/new-loan', {replace: true})` from `/loans/new-loan/12`, and that **does** change `location.pathname`; the effect re-derives `editLoanId('/loans/new-loan') === null`, so `key={loanId \|\| 'new'}` remounts the form in create mode. A temporary Cypress probe confirmed the heading becomes "Nuevo Préstamo" with no person selected. The claim assumed the pathname was unchanged. |
| 5 | `client/src/Loans/copy.js` — the delete dialog promises removal of payments this change neither stores nor deletes | low | patch | Confirmed: the message read "Se elimina el préstamo y sus pagos asociados." while the diff contains no payment storage and `service.delete` removes only the `Loan` row. `architecture-contract.md:300` lists "claiming a state it is not in" as a violation. The dialog appears on every loan delete and the fix is a direct copy correction. **Action:** the message now states only what the code does; the Cypress assertion was moved to the corrected copy rather than deleted. |

Pre-existing, not this change's: `npx prettier --check "src/**/*.{js,jsx}"` reports 61
unformatted files at the baseline too (e.g. `src/shared/utils/styles.js`, which this
change never touches). Every file this change touches is Prettier-clean. Not counted
as a finding — no lens raised it and it is not caused here.

## Verification

**Commands:**
- `uv run pytest packages/planny-api/tests/test_loans.py -v` -- expected: all pass
- `uv run pytest packages/ -v` -- expected: 778 plus the new tests, all pass
- `uv run pytest packages/planny-api/tests/test_architecture.py -v` -- expected: pass
- `uv run --with alembic alembic upgrade head` -- expected: revision applies, one head (`uv run alembic` alone doesn't resolve; finding H15)
- `uv run ruff check packages/` and `uv run mypy packages/` -- expected: clean
- `cd client && npm run test:jest` -- expected: pass
- `cd client && npx eslint src && npx prettier --check "src/**/*.{js,jsx}"` -- expected: clean
- `cd client && npm run build` -- expected: production build succeeds
- Cypress `loans.spec.js` -- start the client dev server first (`npm run start:client`, port 8192) as a background job; expected: all flows pass

**Results (final run, after review patches):**
- `uv run pytest packages/ -v` -- 814 passed (baseline 778 + 36 new).
- `uv run pytest packages/planny-api/tests/test_architecture.py -v` -- 22 passed.
- `uv run ruff check packages/` -- clean. `uv run mypy packages/` -- clean, 124 files.
- `cd client && npm run test:jest` -- 50 passed. `npm run build` -- succeeds.
- `npx eslint src` -- clean; `npx eslint cypress/integration/loans.spec.js` -- clean.
- Cypress `loans.spec.js` -- 8 passed, 0 skipped, 0 pending.
- `npx prettier --check "src/**/*.{js,jsx}"` -- **fails at the baseline too**: 61 files are
  unformatted, none of them touched by this change (see the Review Triage Log). Prettier
  reports every file this change touches as clean, and `cypress/integration/loans.spec.js`
  is clean. The drift predates this work and is reported to the human rather than fixed here.
- Cypress needs `ELECTRON_RUN_AS_NODE` unset in this environment, or the browser never starts.

**Manual checks:** register a loan and confirm the currency label, padded number and pending balance; open Personas and confirm the count and blocked delete; edit currency on a loan with advance-paid and confirm the refusal.
