---
title: 'Loan manager foundation and borrower directory'
type: 'feature'
ticket: ''
created: '2026-10-07'
status: 'built'
baseline_revision: 'c976229372d7059e25b0c135605ebf9cb3bc676d'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context:
  - 'docs/architecture/architecture-contract.md'
  - 'docs/architecture/how-to-add-a-module.md'
  - '.custom/loan-app-migration/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Planny Flows has no isolated space for the new Spanish-language loan-management product, nor a durable borrower record that future loans can reference. Free-text people would make search, maintenance, and the later loan migration unreliable.

**Approach:** Add an independently discovered, unauthenticated borrower domain and a top-level `/loans` SPA shell. Deliver the five requested loan-navigation placeholders, a reusable people directory/picker, and use existing host feedback components rather than creating parallel infrastructure.

## Boundaries & Constraints

**Always:** keep the backend vertical (`router` → `service` → `repository`), use `planny_core` models and one linear Alembic revision, return the host error envelope with catalogued codes and Spanish borrower messages, expose canonical `/api/v1` paths, preserve SPA navigation without page reloads, provide accessible confirmation before destructive actions, and keep app copy in casual Rioplatense Spanish.

**Never:** inspect or port the legacy application; edit the app factory or module registry; put SQL in a router; couple loans routes to Jira project loading; build loans/payments/receipts/dashboard/migration work from deferred epics; use browser alerts; add another toast provider; silently delete borrowers that have future linked loans.

## Decisions

- Borrower API routes use the English resource name: `/api/v1/borrowers`, with the host's unversioned compatibility alias.
- Duplicate borrowers are rejected by normalized first-and-last-name identity; the API returns a Spanish conflict error rather than creating an ambiguous picker result.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create person | Valid first and last name; optional contact fields omitted | Persisted borrower and Spanish success toast; inline picker selects it | No error expected |
| Invalid person | Missing or whitespace-only required name | No persistence; field-aware Spanish API/UI feedback | Typed `BAD_USER_INPUT` envelope |
| Directory lookup | Search text matching first or last name | Matching borrowers update as the operator types | Empty state when no match/records |
| Delete borrower | No linked loans | Explicit confirmation, delete, and refreshed directory | No error expected |
| Protected delete | Borrower linked to future loan | Record remains and the operator sees an explanatory Spanish error | Typed conflict/rule error |

</frozen-after-approval>

## Code Map

- `packages/planny-api/src/planny_api/kernel/{registry,mounting,module}.py` -- discovery and canonical-plus-alias mounting; add no central registration.
- `packages/planny-api/src/planny_api/modules/comments/` -- compact vertical-slice API and API-test precedent.
- `packages/planny-api/src/planny_api/dependencies.py` -- default auth behavior; loans must explicitly opt out per the supplied single-operator requirement.
- `packages/planny-core/src/planny_core/models/__init__.py` and `alembic/env.py` -- model registration used by metadata and migrations.
- `client/src/App/Routes.jsx` -- top-level lazy route; `client/src/Project/index.jsx` must not host loans because it preloads Jira-board project data.
- `client/src/shared/components/{ConfirmModal,Form,Select,InputDebounced}/` and `client/src/shared/utils/toast.js` -- reuse existing feedback, form, selection, and debounced-input primitives.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/planny-core/src/planny_core/models/borrower.py`, `models/__init__.py`, and `alembic/versions/*_add_borrower.py` -- add the borrower table and one linear migration with required names plus nullable contact fields; reserve a relationship/count seam for the later loan FK.
- [ ] `packages/planny-api/src/planny_api/modules/borrowers/{__init__,router,service,repository,schemas,serializers}.py` and shared error catalog only if needed -- add auto-discovered CRUD, name search, Spanish validation, and a future-ready linked-loan deletion guard; router stays query-free and `auth=False` is explicit.
- [ ] `packages/planny-api/tests/test_borrowers.py` and relevant migration/architecture coverage -- prove canonical/alias parity, create/update/search, field failures, absent records, and delete success/block behavior with in-memory SQLite.
- [ ] `client/src/App/Routes.jsx` and `client/src/Loans/{index,Sidebar,Styles,copy}.js(x)` -- mount an independent five-view `/loans` shell; dashboard is the index route; all requested views are visible placeholders with active desktop/mobile navigation.
- [ ] `client/src/Loans/Borrowers/` plus a reusable `BorrowerPicker` -- create the Personas directory, debounced first/last-name filtering, editing, empty/loading/error states, confirmation delete, inline person creation and selection without navigation; reuse host toast/ConfirmModal/Form rather than duplicate providers.
- [ ] `client/src/i18n/locales/{en,es}.json`, focused Jest tests, and Cypress coverage -- add localized keys, pure navigation/query helpers, and end-to-end coverage for shell navigation, borrower CRUD, protected delete, and inline picker selection.
- [ ] `docs/loans-copy-style.md` -- record the casual Rioplatense app register and reserve formal/legal Spanish for the deferred receipt scope.

**Acceptance Criteria:**
- Given `/loans`, when the operator changes among Dashboard, Préstamos, Personas, Nuevo Préstamo, and Generar Recibo, then the active view changes without reload or Jira-board requests.
- Given valid borrower data, when it is created or edited, then required names persist, optional contacts remain optional, and success/failure feedback is a Spanish non-blocking toast.
- Given typed first or last name text, when Personas or the picker searches, then results are filtered/suggested as the input changes; inline creation returns the new selected borrower.
- Given a delete action, when it is unconfirmed, then no write occurs; when loan links exist, then deletion is refused without data loss.
- Given the full host gate, when tests/type/lint/format checks run, then the module remains architecture-compliant.

## Implementation Notes

- Implemented the borrower model, linear migration, auto-discovered API module, canonical and unversioned routes, Spanish typed errors, normalized duplicate protection, and a future-loan deletion guard that fails closed on unexpected database errors.
- Added the top-level `/loans` SPA shell, five requested views, Personas directory, reusable inline-creation picker, shared confirmation/toast feedback, copy guidance, localized keys, Jest coverage, and Cypress coverage. Migrated the Cypress runner configuration to the installed Cypress version.
- Review fixes: only an explicitly absent future `loan` table is treated as zero links; unexpected operational failures propagate. Borrower validation/not-found messages are Spanish. Directory and picker lookup failures render explicit retry states and suppress no-match creation UI while the result is unknown.

## Plan Change Log

## Review Triage Log

- `patched` — `repository.py:linked_loan_count` swallowed all database errors as zero links; narrowed the fallback to the explicitly absent future `loan` table and added propagation coverage so protected deletion fails closed.
- `not a defect` — `alembic/env.py` did not list `Borrower` among explicit imports; importing `planny_core.models` executes its package initializer, which registers `Borrower` in `Base.metadata`; migration metadata tests and the full suite confirm registration, so no patch was needed.
- `patched` — borrower validation and not-found responses inherited English shared defaults; added optional custom messages while preserving the typed host envelope and asserted Spanish messages in API tests.
- `patched` — picker and directory request failures fell through to misleading empty/no-match states; added explicit Spanish error/retry states and kept inline creation unavailable while lookup is unknown.

## Design Notes

The shell is deliberately separate from `Project`: its initial board fetch and default-project assumptions would make a personal-loans page fail or show a spinner when Jira/local board data is unavailable. `ConfirmModal` already gates an action until the callback closes it; loan views should wrap it only for Spanish defaults, not duplicate modal mechanics.

## Verification

**Commands:**
- `uv run pytest packages/planny-api/tests/test_borrowers.py -v` -- expected: CRUD, search, errors, delete guard, and route parity pass.
- `uv run pytest packages/planny-core/tests/test_migrations.py -v` -- expected: the borrower revision is linear and schema metadata stays aligned.
- `uv run pytest packages/ -v && uv run ruff check packages/ && uv run mypy packages/` -- expected: whole backend gate is green.
- `cd client && npm run test:jest && npm run test:cypress` -- expected: loans unit/E2E flows pass.
- `cd client && npx eslint <changed files> && npx prettier --check <changed paths>` -- expected: changed client files pass explicit file-based checks.
