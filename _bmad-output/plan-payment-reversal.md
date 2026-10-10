---
title: 'Revert a payment instead of deleting it'
type: 'feature'
ticket: ''
created: '2026-10-10'
status: 'built'
baseline_revision: '3a7e22db7d912dca858c8e4b6dd03963a5a327b6'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context:
  - 'docs/architecture/architecture-contract.md'
  - '_bmad-output/plan-loan-payments.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un pago mal cargado sólo se puede borrar, y borrarlo lo saca del sistema. Pero un recibo emitido después lo menciona en su historial congelado, así que hoy quedan recibos que nombran un pago que ya no existe y que no pueden decir que esa cobranza se revirtió. Revertir tiene que ser un hecho registrado, no una desaparición.

**Approach:** Un pago revertido deja de borrarse: se marca con su fecha de reversión y sale de la suma que deriva el saldo, que se recalcula solo porque nunca se almacena. El historial de pagos y los snapshots que lo mencionan muestran la reversión. El texto del recibo en sí llega con Epic 4; acá se deja el dato que ese recibo va a leer.

## Boundaries & Constraints

**Always:** el saldo sigue derivándose en el único punto de recálculo, nunca se almacena; un pago revertido no cuenta para el saldo ni para "lo ya cobrado" que bloquea una edición; la reversión se fecha en el servidor; la fila revertida sobrevive y sigue siendo legible; los códigos y mensajes de error siguen el envelope y el catálogo existentes; la operación es reversible por el operador (una reversión equivocada se puede deshacer).

**Never:** borrar la fila del pago al revertir; reescribir los montos congelados de un snapshot; agregar estados de préstamo o cierre (Epic 3) ni el recibo impreso (Epic 4); cambiar contratos de API existentes más allá de sumar la marca; tocar los préstamos o las personas; agregar dependencias.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| REVERSE_HAPPY | pago activo | 204; la fila queda marcada con fecha; el saldo sube por ese monto | ninguno |
| REVERSE_RECALC | préstamo con dos pagos, se revierte uno | `pendingBalance` refleja sólo el pago activo | ninguno |
| REVERSE_SNAPSHOT | snapshot de un pago posterior que mencionaba al revertido | el historial del snapshot muestra la reversión de ese pago | ninguno |
| REVERSE_TWICE | pago ya revertido | rechazado, sin cambios | 400 `BAD_USER_INPUT` (es) |
| REVERSE_UNKNOWN | id inexistente o de otro préstamo | rechazado | 404 `ENTITY_NOT_FOUND` (es) |
| REVERSE_UNREVERSE | pago revertido, se deshace la reversión | vuelve a contar para el saldo y el historial deja de mostrarlo revertido | ninguno |
| GUARD_AUDITS_EVER_COLLECTED | reversión + edición de monto | la guarda de "lo ya cobrado" cuenta **todos** los pagos, revertidos incluidos, así el monto nunca queda por debajo de lo que se cobró | 400 `BAD_USER_INPUT` (es) |
| LIST_SHOWS_REVERSED | historial del préstamo | el pago revertido aparece marcado, no desaparece | ninguno |
| LOAN_DELETE_STILL_CASCADES | préstamo con pagos activos y revertidos | se van todos con el préstamo | ninguno |

</frozen-after-approval>

## Code Map

Roots: `packages/planny-core/src/planny_core/models/`, `packages/planny-loans/src/planny_loans/loans/`, `alembic/versions/`, `client/src/Loans/`.

- `models/payment.py` — NEW column `reversedAt` (`DateTime`, nullable). Nulo = activo. Es la marca y la fecha en una sola columna; nada de un booleano aparte.
- `alembic/versions/<rev>_add_payment_reversal.py` — NEW, `down_revision = "7d1f4b2c9a30"` (la cabeza actual): `add_column`, y el `downgrade()` la quita. Sin backfill: nulo ya significa "no revertido".
- `loans/repository.py` — `sum_payments` (repository.py:45) suma sólo `reversedAt IS NULL`; `list_payments` (repository.py:35) sigue devolviendo todas, porque el historial tiene que poder mostrar la revertida; agregar el filtro donde se necesite sólo activos.
- `loans/service.py` — `delete_payment` (service.py:302 y siguientes) pasa a `reverse_payment`: no borra, marca `reversedAt = datetime.utcnow()`, y anota la reversión en los snapshots que mencionan esa fila. `create_payment` (service.py:302) arma el historial sólo con activos. `pending_balance` (service.py:93) no cambia: hereda el filtro del agregado. La guarda de "lo ya cobrado" (service.py:167) deja de contar revertidos. `delete` del préstamo sigue borrando todas las filas, revertidas incluidas.
- `loans/router.py` — `DELETE /loans/{loan_id}/payments/{payment_id}` (router.py:99) mantiene el verbo y el 204 para no romper al cliente, pero ahora revierte; sumar `POST …/{payment_id}/reversal` + `DELETE …/{payment_id}/reversal` si el "deshacer" necesita su propio verbo.
- `loans/serializers.py` — el pago expone `reversedAt` (ISO o `null`), y el historial del snapshot muestra la entrada del revertido con su marca.
- `client/src/Loans/LoanForm/index.jsx` — el historial marca la fila revertida (texto propio, no tachado silencioso), la acción dice "Revertir" en vez de "Eliminar", y `removePayment` pasa a llamar al endpoint de reversión. El preview del saldo no cambia: usa el `pendingBalance` del servidor.
- `client/src/Loans/copy.js` — copy en voseo para "Revertir", la confirmación y el estado "revertido".
- `packages/planny-loans/tests/test_payments.py` — un test por fila de la matriz; los que hoy asumen borrado (`test_pay_delete_recomputes_the_balance`, `test_pay_delete_unknown_is_not_found`) se reescriben a reversión.
- `client/cypress/integration/loans.spec.js` — el flujo de borrado pasa a reversión y el estado revertido queda asertado.

## Tasks & Acceptance

**Execution:**
- [x] `models/payment.py` + migración — la columna y la revisión lineal desde `7d1f4b2c9a30`.
- [x] `repository.py` + `service.py` — sumar sólo activos, revertir en lugar de borrar, anotar los snapshots, y la guarda que ignora revertidos.
- [x] `router.py` + `serializers.py` — el verbo conservado, la marca expuesta y el "deshacer" si hace falta.
- [x] `LoanForm/index.jsx` + `copy.js` — la fila revertida y la acción renombrada.
- [x] `test_payments.py` + `test_migrations.py` — un test por fila, y la columna cubierta.
- [x] `loans.spec.js` — el flujo de reversión.

**Acceptance Criteria:**
- Given un préstamo con un pago, when lo revierto, then la fila sigue existiendo marcada con su fecha, el saldo sube por ese monto y el historial lo muestra como revertido.
- Given un préstamo con dos pagos, when revierto el primero, then el saldo cuenta sólo el segundo y el recibo del segundo ya no muestra una cobranza vigente que no existe.
- Given un préstamo con un pago revertido, when edito el monto por debajo de lo que se cobró alguna vez, then se rechaza, y deshacer la reversión nunca deja el saldo negativo.
- Given un pago ya revertido, when intento revertirlo de nuevo, then se rechaza con `BAD_USER_INPUT` y nada cambia.
- Given un pago revertido, when deshago la reversión, then vuelve a contar para el saldo.
- Given un préstamo con pagos activos y revertidos, when borro el préstamo, then se van todos.

## Implementation Notes

- El saldo no necesita reparación: `pending_balance` suma en cada lectura, así que excluir del agregado es todo el trabajo. No agregar ninguna escritura de saldo.
- El historial congelado sí se toca al revertir, y es deliberado: se agrega la marca de reversión a las entradas que nombran esa fila, sin tocar los montos. Es lo que permite que un recibo ya emitido diga "esta cobranza fue revertida" sin reescribir lo que cobró.
- `flag_modified` sigue haciendo falta para escribir dentro de la columna `JSON` (ver `create_payment`): una mutación in situ no la ve SQLAlchemy.

## Plan Change Log

## Plan Change Log

- **Iteration 1 — review patches (patch route).** The Quick lens found a real high-severity hole: because the collection guard counted only active payments, a reversal lowered the bar for cutting the loan's amount, and undoing that reversal then pushed the derived balance negative with no way back. Fixed by pointing the guard at the audit total (all payments, reversed included) while the balance keeps counting only what is in force, so a reversal takes money out of the balance but not out of the record; the matrix row and the acceptance criterion that asserted the opposite were corrected. Also patched: the reversed payment's own snapshot now carries the reversal mark (it was the one receipt that kept claiming the collection was in force), the dead return value of the annotation helper, and the unused `POST …/reversal` alias.

## Review Triage Log

- **Quick lens finding 1 — undoing a reversal can drive the derived balance negative, and it sticks.** `high`. Confirmed by replaying the reviewer's sequence: 1000 with two 300 payments, reverse one, cut the amount to 100 (accepted, because the guard saw only the active 300), undo the reversal, and the loan reads `-200.00` with every later payment refused. Fixed at the root: the guard's term is now the audit total (`repository.sum_all_payments`, the money that ever changed hands, reversals included), so the amount can never be cut below what a reversal could bring back. Replayed after the patch: the cut to 100 is refused, the cut to the audit total is allowed, and the undo lands exactly on `0.00`.
- **Quick lens finding 2 — the collected guard validates only the payments active at that instant.** `high`, the same root cause as finding 1 and fixed by the same change. The old behaviour let an amount be persisted below what was actually collected, which is also what made finding 1 reachable.
- **Quick lens finding 3 — the reversal never reaches the reversed payment's own frozen snapshot.** `medium`. Confirmed: `payments_history` builds only from active rows, so the row's own history entry carried no mark, and the one receipt a payee would hold for that collection still claimed it was in force. Fixed by keeping the row's own snapshot in the annotation pass; verified the own snapshot now reads `[{"id": 1, "amount": "300.00", "reversedAt": "…"}]`.
- **Quick lens finding 4 — `_annotate_history` returns a count no caller uses.** `low`. True. Removed for the same reason the `POST` twin below was: dead surface. (Same root cause as finding 3's change to the function's contract.)
- **Quick lens finding 5 — `POST …/reversal` returns 204 and is untested, unused surface.** `low`. Confirmed: the client only calls the payment `DELETE` and the `DELETE …/reversal`, and no test exercised the `POST`. Removed rather than given a test — an endpoint nobody calls is surface nobody maintains, and the architecture contract's own rule is that 204 belongs to a delete with no body.

## Verification

**Commands:**
- `uv run pytest packages/planny-loans/tests/test_payments.py -v` -- expected: todos pasan, incluidos los de reversión
- `uv run pytest packages/ -q` -- expected: la base más los nuevos
- `uv run pytest packages/planny-core/tests/test_migrations.py packages/planny-api/tests/test_architecture.py -q` -- expected: pasan
- `uv run ruff check packages/` y `uv run mypy packages/` -- expected: limpios
- `uv run --with alembic alembic heads` y aplicar la revisión sobre una base en `7d1f4b2c9a30` -- expected: una sola cabeza y la columna aplicada
- `cd client && npx jest && npx eslint src && npm run build` -- expected: pasan
- Cypress `loans.spec.js` -- expected: los flujos pasan con la reversión

**Environment note (this session):** the live app is supervised by `launchd` → `~/.planny-flows/start.sh`. It runs the API **from this repo checkout** (`PROJECT_SOURCE=/Users/ecuchetti/Projects/github/planny-flows`) against the database at `~/.planny-flows/data/jira.sqlite`, but serves the client from `~/.planny-flows/client/build`, which is a **copy** — so a client change only reaches `http://localhost:8193` after `npm run build` and a copy of `client/build` into that directory. Killing either process makes the supervisor restart the pair.

**Manual checks:** revertir un pago y ver el saldo subir y la fila marcada; deshacer la reversión; intentar revertir dos veces.
