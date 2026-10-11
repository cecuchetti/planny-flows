---
title: 'Portfolio dashboard: one aggregated summary per currency'
type: 'feature'
ticket: ''
created: '2026-10-10'
status: 'built'
baseline_revision: '6d7dcbb0999008f957627be8564fd5e75a11ee1c'
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
  - '_bmad-output/plan-loan-lifecycle.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El operador entra a Préstamos y ve sólo una lista; no sabe de un vistazo cuánto prestó, cuánto cobró, cuánto falta ni qué está por cerrarse. Las cifras del portafolio no existen, y si existieran, sumar monedas distintas las haría mentir.

**Approach:** Un solo endpoint agregado calcula, **por moneda y nunca combinadas**, las métricas del portafolio (prestado, cobrado, pendiente, condonado, tasa de recuperación, conteos, promedio pendiente, cobrado del mes, casi-completos y actividad reciente). Una vista "Resumen" es la entrada a Préstamos y muestra esas tarjetas y listas; el listado actual se mueve a su propia ruta y la vista enlaza a él.

## Boundaries & Constraints

**Always:** un solo endpoint agregado que computa todo en el servidor (FR36), sin agregación client-side; toda métrica monetaria va por moneda y nunca se suma a través de monedas (FR35); el balance pendiente sale del mismo punto de recálculo; los montos se serializan como string de dos decimales con su moneda; la vista es de sólo lectura y recarga al entrar.

**Never:** calcular métricas en el cliente; sumar USD y ARS; editar nada desde el dashboard; cambiar el estado de un préstamo desde ahí; tocar la migración (Epic 5); cambiar la API de pagos/préstamos existente.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SUMMARY_EMPTY | sin préstamos | el endpoint devuelve `currencies: []` y listas vacías; la vista muestra "no data yet" | — |
| SUMMARY_PER_CURRENCY | préstamos USD y ARS | cada métrica va bajo su moneda, nunca combinada | — |
| RECOVERY_RATE | principal > 0 | `cobrado / prestado` como ratio; 0 cuando no hay prestado | — |
| NEAR_COMPLETION | activos con recuperado ≥ 80% | lista con prestatario, número y saldo restante | — |
| RECENT_ACTIVITY | pagos | los 5 más recientes, en vigor (un revertido no es cobranza) | — |
| COLLECTED_MONTH | pagos del mes | suma del mes calendario, por moneda | — |
| DASHBOARD_LANDING | entrar a Préstamos | la vista Resumen es el índice; el listado vive en `/loans/loans` | — |
| DASHBOARD_DRILL | clic en una referencia | navega a ese préstamo en el listado/edición | — |
| DASHBOARD_ERROR | falla el endpoint | estado de error con reintento | mensaje en español |

</frozen-after-approval>

## Code Map

Roots: `packages/planny-loans/src/planny_loans/loans/`, `client/src/Loans/`.

- `loans/repository.py` — NEW funciones de agregado por moneda: `summary(db)` (o varias: totales por moneda con `GROUP BY currency`, conteos, `SUM` de pagos activos por moneda, `SUM` de `writtenOffAmount`), `near_completion(db)` (activos con `advancePaid + Σ pagos activos ≥ 0.8 × amount`), `recent_payments(db, limit=5)` (activos, `date DESC`), y `collected_this_month(db)` (pagos activos del mes). Todo SQL; el router no arma queries.
- `loans/service.py` — `summary(db)` orquesta el repositorio y redondea por `_money`; el pendiente por préstamo reusa `pending_balance` (o su fórmula). Sin lógica nueva de negocio más allá del armado.
- `loans/router.py` — NEW `GET /loans/summary` (o `/loans/dashboard`) que delega en `service.summary` y devuelve el shape agregado. No agrega filtros en el router.
- `loans/serializers.py` — shape del summary: `{currencies: [{currency, principal, collected, outstanding, writtenOff, recoveryRate, activeCount, closedCount, averageOutstanding, collectedThisMonth}], nearCompletion: [{loanId, number, borrower, remainingBalance, currency}], recentPayments: [{paymentId, date, borrower, loanNumber, amount, currency}]}`.
- `client/src/Loans/Dashboard/index.jsx` + `Dashboard/Styles.js` — NEW la vista Resumen: tarjetas por moneda, lista de casi-completos, actividad reciente y cobrado del mes; `PageLoader`/error con reintento/empty state; refetch al entrar; los enlaces navegan al préstamo.
- `client/src/Loans/index.jsx` — el índice pasa a ser `Dashboard`; el listado (`LoansList`) se mueve a la ruta `loans` (`/project/loans/loans`), y `borrowers`/`new-loan`/`receipt` quedan como están.
- `client/src/Project/Sidebar/index.jsx` — NEW entrada "Resumen" (índice) y "Préstamos" re-apunta al listado; `common.loans` o una clave nueva para "Resumen".
- `client/src/Loans/copy.js` — copy voseo para Resumen, las etiquetas de métricas, casi-completos y actividad.
- `client/src/Loans/Dashboard/...test.js` + `client/cypress/integration/loans.spec.js` — la forma del summary (con monedas múltiples), y el flujo de landing + drill-through.
- `packages/planny-loans/tests/test_summary.py` — un test por fila de la matriz.

## Tasks & Acceptance

**Execution:**
- [ ] `repository.py` + `service.py` + `router.py` + `serializers.py` — el endpoint agregado por moneda.
- [ ] `test_summary.py` — un test por fila.
- [ ] `Dashboard/index.jsx` + copy + ruta + sidebar — la vista Resumen como índice y el listado movido.
- [ ] Cypress — el landing y el drill-through.

**Acceptance Criteria:**
- Given préstamos y pagos, when llamo al endpoint, then devuelve por moneda prestado, cobrado, pendiente, condonado, tasa, conteos, promedio, cobrado del mes, casi-completos y los 5 pagos recientes, todo del servidor.
- Given la vista Resumen, when entro a Préstamos, then veo las tarjetas por moneda (cada monto con su etiqueta) y las listas, sin editar nada.
- Given un clic en una referencia, when lo hago, then navego a ese préstamo.
- Given monedas distintas, when se muestran, then nunca se combinan.
- Given el build con `REACT_APP_ENABLED_LOANS=false`, when lo construyo, then el dashboard no entra al bundle.

## Implementation Notes

- "Cobrado" es `advancePaid + Σ pagos activos`; un pago revertido no es cobranza. "Pendiente" es el saldo derivado de los préstamos **activos**. "Tasa de recuperación" es `cobrado / prestado`, y 0 cuando no hay prestado.
- El endpoint agrupa por moneda en SQL (`GROUP BY currency`); el servicio sólo redondea y arma las listas. Nada de sumar monedas en el cliente ni en el servicio a mano.
- El cambio de índice (`/project/loans` → Resumen, listado → `/project/loans/loans`) es deliberado por "default landing" (Story 6.2); los links existentes al listado se re-apuntan y los Cypress se ajustan.

## Plan Change Log

## Plan Change Log

- **Iteration 1 — review patches (patch route).** La Quick lens encontró un bug real en el umbral de casi-completos (redondear `0.8 × amount` dejaba pasar un 79.9992% por un centavo), ya corregido con comparación exacta en `Decimal` y un test de frontera, más dos docstrings inexactos y dos huecos de cobertura (`averageOutstanding` y el estado de error/multi-moneda en el cliente). Añadidos dos tests de Cypress (multi-moneda y error+retry) y aserciones de `averageOutstanding`. El "cobrado del mes" en UTC se difiere: es la convención naive-UTC pre-existente.

## Review Triage Log

- **Quick lens finding 1 — `DASHBOARD_ERROR` se declaraba cubierto en Cypress sin test.** `low`, patched. El docstring del test decía que las tres filas UI estaban en Cypress, pero sólo había landing y drill. Corregido el docstring y añadido un test de Cypress que stuba un `summary` fallido y aserta el error y el `Reintentar`.
- **Quick lens finding 2 — sin test client-side de múltiples monedas.** `low`, patched. Añadido un test de Cypress con dos monedas que aserta las dos tarjetas separadas y la ausencia de un total combinado.
- **Quick lens finding 3 — el umbral de casi-completos se redondeaba antes de comparar.** `medium`, patched. `recovered >= _money(0.8 × amount)` dejaba pasar un préstamo al 79.9992% (800.03 de 1000.04). Ahora la comparación es exacta en `Decimal` (`recovered >= 0.8 × amount`), cubierta por un test de frontera.
- **Quick lens finding 4 — el comentario de `NEAR_COMPLETION_RATIO` decía que el repositorio filtra, pero no.** `low`, patched. El comentario ahora dice la verdad: el repositorio devuelve candidatos y el servicio aplica el umbral en `Decimal`.
- **Quick lens finding 5 — el docstring de `summary` decía que reusa `pending_balance`.** `low`, patched. Corregido: calcula la misma fórmula que `pending_balance` reduce para un activo, sin una query extra por préstamo.
- **Quick lens finding 6 — `averageOutstanding` sin cobertura.** `low`, patched. Añadidas aserciones en el test por moneda.
- **Quick lens finding 7 — "cobrado del mes" usa el mes UTC, no el local.** `defer`. El `collected_this_month` se ventanea con `datetime.utcnow()`, consistente con la convención naive-UTC de todo el repo, pero a un operador en UTC-3 un pago en el límite de mes puede caer en el mes UTC adyacente. Es pre-existente (toda la app usa naive-UTC); corregirlo es una migración de zona horaria del repo entero, fuera de este cambio.

## Verification

**Commands:**
- `uv run pytest packages/planny-loans/tests/test_summary.py -v` -- expected: todos pasan
- `uv run pytest packages/ -q` -- expected: la base más los nuevos
- `uv run pytest packages/planny-api/tests/test_architecture.py packages/planny-core/tests/test_migrations.py -q` -- expected: pasan
- `uv run ruff check packages/` y `uv run mypy packages/` -- expected: limpios
- `cd client && npx jest && npx eslint src && npm run build` -- expected: pasan
- Cypress `loans.spec.js` -- expected: los flujos pasan, incluido el landing del Resumen

**Manual checks:** entrar a Préstamos y ver el Resumen; comparar métricas con la lista; cliquear un casi-completo y ver que navega al préstamo.
