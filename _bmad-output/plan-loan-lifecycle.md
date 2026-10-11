---
title: 'Loan lifecycle: close, reopen and write-off'
type: 'feature'
ticket: ''
created: '2026-10-10'
status: 'built'
baseline_revision: 'a94ab4e2e35b918c44e1e9fee316ddcdef57cb89'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context:
  - '.custom/loan-app-migration/_bmad-output/planning-artifacts/epics.md'
  - 'docs/architecture/architecture-contract.md'
  - '_bmad-output/plan-loan-payments.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un préstamo se paga o se registra mal y no hay forma de reflejarlo: no existe estado, no se puede cerrar ni reabrir, y un préstamo impagable queda en la lista de activos para siempre. El saldo sabe cuánto falta cobrar, pero el sistema no sabe cuándo un préstamo está "cerrado" ni cuánto se condonó.

**Approach:** Cada préstamo gana un estado (`active`/`closed`) con su `closedAt` y un `writtenOffAmount`. Una única función de evaluación de estado, llamada desde cada evento que mueve el saldo, cierra automáticamente cuando el saldo llega a 0 y reabre cuando vuelve a subir; el cierre manual condona el pendiente y lo registra; reabrir limpia la condonación. La lista se parte en Activos y Cerrados.

## Boundaries & Constraints

**Always:** un único punto de recálculo del saldo, que ahora descuenta `writtenOffAmount` (dinero que ya no se cobra) y nunca se almacena; una única función de evaluación de estado que decide `active`/`closed` y `closedAt`; los préstamos cerrados no aceptan pagos nuevos; sólo los campos descriptivos son editables en un préstamo cerrado (monto, adelanto y moneda requieren reabrir); `closedAt` y `writtenOffAmount` se fechan y se redondean con las reglas existentes; errores en español con el envelope y el catálogo actuales.

**Never:** almacenar un saldo; guardar historial de estados (sólo el estado actual); aceptar un pago en un préstamo cerrado; dejar que el cierre manual condone sin registrar el monto; permitir editar monto/adelanto/moneda en un préstamo cerrado; tocar recibos (Epic 4) ni la migración (Epic 5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| AUTO_CLOSE | un pago lleva el saldo a 0 | préstamo `closed`, `closedAt` puesto | ninguno |
| AUTO_REOPEN | revertir un pago sube el saldo por encima de 0 en un préstamo cerrado | vuelve a `active`, `closedAt` limpio | ninguno |
| MANUAL_CLOSE_WRITEOFF | préstamo activo con saldo pendiente | confirma y condona: `writtenOffAmount` = pendiente, saldo 0, `closed` | ninguno |
| MANUAL_CLOSE_PAID | préstamo con saldo 0 | confirma sin redacción de condonación, queda `closed` | ninguno |
| REOPEN | préstamo cerrado | vuelve a `active`, `closedAt` y `writtenOffAmount` limpios | ninguno |
| CLOSED_REJECTS_PAYMENT | registrar un pago en un préstamo cerrado | rechazado | 400 `BAD_USER_INPUT` (es) |
| CLOSED_EDIT_GUARD | editar monto/adelanto/moneda en cerrado | rechazado; descriptivos sí se editan | 400 `BAD_USER_INPUT` (es) |
| SPLIT_LIST | lista con activos y cerrados | "Activos" expandidos (nuevos primero), "Cerrados" colapsados (cerrados más recientes primero), con conteo y estado vacío | ninguno |
| CLOSED_CARD | tarjeta cerrada | fecha de cierre, saldo 0.00 y condonación si hay; acciones editar/borrar/reabrir | ninguno |

</frozen-after-approval>

## Code Map

Roots: `packages/planny-core/src/planny_core/models/`, `packages/planny-loans/src/planny_loans/loans/`, `alembic/versions/`, `client/src/Loans/`.

- `models/loan.py` (cols 33–51) — NEW `status` (`String`, default `"active"`), `closedAt` (`DateTime`, nullable), `writtenOffAmount` (`Numeric(14,2)`, nullable). Constantes `ACTIVE`/`CLOSED` en el servicio, como `CURRENCIES`.
- `alembic/versions/<rev>_add_loan_lifecycle.py` — NEW, `down_revision = "3b7e1a5d9c24"` (cabeza actual): `status` NOT NULL con `server_default="active"` (los préstamos existentes quedan activos), `closedAt` y `writtenOffAmount` nullable.
- `loans/service.py` — `pending_balance` (136–147) descuenta `writtenOffAmount` en `_balance_of` (131–133); NEW `_apply_status(loan, balance)` es la **única** función de evaluación (balance ≤ 0 → `closed` + `closedAt=utcnow`; balance > 0 → `active` + `closedAt=None`), llamada desde cada mutación que mueve el saldo: `create` (293), `update` (314), `create_payment` (348), `reverse_payment` (412), `unreverse_payment` (442) y NEW `close_loan`/`reopen_loan`. `create_payment` rechaza si `status == "closed"` (FR18). `_common_rules` (115+) rechaza monto/adelanto/moneda en un préstamo cerrado, dejando pasar los descriptivos.
- `loans/repository.py` — `list_loans` (10) y/o un helper nuevo separan activos de cerrados (cerrados por `closedAt DESC`), sin que el router construya la query.
- `loans/schemas.py` + `serializers.py` — `loan_to_dict` (18–39) expone `status`, `closedAt` (ISO) y `writtenOffAmount` (string 2 decimales).
- `loans/router.py` — NEW `POST /{loan_id}/close` y `POST /{loan_id}/reopen` (200 con `{loan}`), delegando al servicio; `_loan_dict` (44–45) sigue siendo el único serializador.
- `client/src/Loans/LoansList/index.jsx` — parte la lista en `Activos`/`Cerrados` (expanded/collapsed), con conteos y estados vacíos; la tarjeta cerrada muestra `closedAt`, saldo `0.00` y `writtenOffAmount`, y sus acciones son editar/borrar/reabrir (sin Cerrar ni captura); la activa gana "Cerrar" con `ConfirmModal` de write-off.
- `client/src/Loans/LoanForm/index.jsx` — en un préstamo cerrado deshabilita monto/adelanto/moneda con la explicación en español; muestra el estado y la condonación.
- `client/src/Loans/copy.js` — copy voseo para Activos/Cerrados, Cerrar, Reabrir, el diálogo de condonación, y el aviso de "requiere reabrir".
- `packages/planny-loans/tests/test_loans.py` + NEW `test_lifecycle.py` — un test por fila de la matriz, reutilizando los helpers existentes (`make_loan`, `register`, `balance`, `reverse`).
- `packages/planny-core/tests/test_migrations.py` — la cadena sigue lineal y el nuevo bloque de columnas del modelo coincide con la migración.

## Tasks & Acceptance

**Execution:**
- [ ] `models/loan.py` + migración — las tres columnas y la revisión lineal desde `3b7e1a5d9c24`.
- [ ] `service.py` — `_apply_status`, el término `writtenOffAmount` en el balance, y el cierre/reabrir con sus guardas.
- [ ] `schemas.py` + `serializers.py` + `router.py` — los endpoints `close`/`reopen` y los campos nuevos.
- [ ] `LoansList/index.jsx` + `LoanForm/index.jsx` + `copy.js` — la lista partida, el cierre/reabrir y el write-off.
- [ ] `test_loans.py` + `test_lifecycle.py` + `test_migrations.py` — un test por fila.

**Acceptance Criteria:**
- Given un pago que lleva el saldo a 0, when se registra, then el préstamo queda `closed` con `closedAt`.
- Given revertir un pago en un préstamo cerrado, when el saldo vuelve a subir, then reabre automáticamente.
- Given un préstamo activo con pendiente, when lo cierro manualmente, then se registra la condonación, el saldo queda 0 y el préstamo `closed`.
- Given un préstamo cerrado, when lo reabro, then vuelve a `active` y se limpian `closedAt` y `writtenOffAmount`.
- Given un préstamo cerrado, when intento un pago o editar monto/adelanto/moneda, then se rechaza en español; los campos descriptivos sí se editan.
- Given la lista, when la abro, then Activos y Cerrados se muestran separados, ordenados y con conteo, y la tarjeta cerrada muestra cierre y condonación.

## Implementation Notes

- El write-off es un término del balance, no un estado paralelo: `pending_balance = amount − advancePaid − Σ pagos activos − writtenOffAmount`. Cerrar manualmente es condonar el pendiente, lo que deja el saldo en 0 y dispara el cierre por la misma función. Reabrir limpia la condonación y el saldo vuelve.
- `pending_balance` sigue siendo sólo lectura (lo llama la serialización). `_apply_status` es la que muta estado y se invoca explícitamente al final de cada mutación; el docstring de `pending_balance` se actualiza para nombrarla como el punto de enganche de Epic 3.
- Redondeo: el saldo se compara contra 0 ya redondeado a 2 decimales (`_money`), nunca contra el valor crudo.

## Plan Change Log

## Plan Change Log

- **Iteration 1 — review patches (patch route).** The Quick lens found one high and one medium bug with a shared cause: `_apply_status` was state-based (it re-closed any active loan at a zero balance, and it reopened without clearing the write-off). Fixed by making it transition-based — it only acts when the balance crosses zero, and the `closed → active` transition clears `writtenOffAmount` — plus guarding `update` so a descriptive-only edit never re-runs the evaluation. This closes both the dangling write-off on a reversal and the silent re-close of a manually-reopened fully-paid loan; each has a regression test. Also patched the low findings: the model's `status` gained `server_default` to match the migration, `LoanCard` gained `propTypes`, the Cypress close stub writes the write-off only when there is something to condone, and `collectedFromLoan`'s doc now states it returns payments plus the write-off. `list_loans`'s two string literals were left as-is (rejected as low — a shared constants module is more surface than the duplication).

## Review Triage Log

- **Quick lens finding 1 — `collectedFromLoan` counts the write-off as collected.** `low`, patched. True: the helper solves `amount − advancePaid − pendingBalance`, which is now `payments + writtenOff`, not just payments. Functionally correct today (a closed loan disables the balance fields and its preview reads 0.00), but the doc claimed the balance was only `amount − advancePaid − payments`. Fixed by documenting the real contract — the helper returns everything the balance nets out, write-off included — so a future reader does not mistake it for a payments-only term.
- **Quick lens finding 2 — auto-reopen via reversal leaves a dangling `writtenOffAmount`.** `high`, patched. Confirmed: reversing a payment on a manually-closed loan raises the balance above zero, `_apply_status` reopened it but never cleared the write-off, and `reopen_loan` refuses an already-active loan, so the condoned amount survived with no path to clear it. Fixed in `_apply_status`: the `closed → active` transition now clears `writtenOffAmount` — a write-off only means anything while the loan is closed. Covered by `test_reversal_on_a_written_off_loan_clears_the_writeoff`.
- **Quick lens finding 3 — reopening a fully-paid loan is undone by the next edit.** `medium`, patched. Confirmed: `reopen_loan` forces `active`, but `update` called `_apply_status` on *every* update, so the first descriptive save re-closed the loan. Fixed by making the evaluation transition-based (`_apply_status` only acts when the balance crosses zero) *and* by only re-evaluating on an edit that could move the balance (amount/advancePaid). Covered by `test_reopened_fully_paid_loan_survives_a_descriptive_edit`.
- **Quick lens finding 4 — `status` has no `server_default` in the model.** `low`, patched. The migration declares `server_default="active"` (the legacy backfill) but the model only had the Python-side default, so `create_all` (test fixtures) and Alembic (production) disagreed. Added `server_default="active"` so the two schemas match.
- **Quick lens finding 5 — `LoanCard` declares no `propTypes`.** `low`, patched. Added the six required props, matching the module's other components and AGENTS.md.
- **Quick lens finding 6 — `list_loans` scatters string literals instead of the constants.** `low`, rejected. Two literals compared in one function, and the constants live in `service` (which imports `repository`, so moving them would add a module or a cycle). A dedicated constants file is more surface than the duplication it removes.
- **Quick lens finding 7 — the Cypress close stub always records a write-off.** `low`, patched. The stub now records `writtenOffAmount` only when the pending balance is positive, mirroring the API's fully-paid close.

## Verification

**Commands:**
- `uv run pytest packages/planny-loans/tests/test_lifecycle.py packages/planny-loans/tests/test_loans.py -v` -- expected: todos pasan
- `uv run pytest packages/ -q` -- expected: la base más los nuevos
- `uv run pytest packages/planny-core/tests/test_migrations.py packages/planny-api/tests/test_architecture.py -q` -- expected: pasan
- `uv run ruff check packages/` y `uv run mypy packages/` -- expected: limpios
- `uv run --with alembic alembic heads` y aplicar sobre una base en `3b7e1a5d9c24` -- expected: una cabeza y las tres columnas
- `cd client && npx jest && npx eslint src && npm run build` -- expected: pasan
- Cypress `loans.spec.js` -- expected: los flujos pasan, incluido el cierre/reabrir

**Manual checks:** registrar el pago que salda un préstamo y verlo cerrarse; revertirlo y verlo reabrirse; cerrar con condonación y ver la tarjeta cerrada; reabrir.
