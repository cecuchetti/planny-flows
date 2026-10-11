---
title: 'Payment receipts: generate, render, historical, print and PNG'
type: 'feature'
ticket: ''
created: '2026-10-10'
status: 'built'
baseline_revision: 'a99d31f4df7ac69d8a2a552f88f6a20b6e3dea42'
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

**Problem:** El operador cobra y no tiene cómo dar comprobante: no hay recibo. El pago se registra en un formulario y el prestatario se queda con la palabra del operador; los pagos pasados no se pueden reimprimir, y no existe la conversión del monto a letras que un recibo formal exige.

**Approach:** Una vista "Generar Recibo" que en una sola acción selecciona un préstamo activo, prellena el monto, registra el pago (reutilizando el API de Epic 2) y muestra un recibo formal en español —con el monto en letras—. Cada pago del historial se puede reimprimir desde su snapshot inmutable, y el recibo se imprime aislado y se exporta como PNG.

## Boundaries & Constraints

**Always:** reutilizar el API de pagos de Epic 2 (nada de lógica de pago duplicada); el recibo histórico se renderiza desde el snapshot del pago (saldos, historial y línea de adelanto) y desde los campos descriptivos actuales del préstamo (ciudad, número, prestamista, concepto, nombre del prestatario); el monto en letras es una función pura con su moneda ("dólares"/"pesos" y plural) y centavos; el flujo muestra un toast explícito cuando el pago cierra el préstamo; los estilos de impresión ocultan todo menos el recibo; el PNG no lleva botones ni UI.

**Never:** duplicar el registro de pagos; guardar un recibo renderizado (se re-renderiza del snapshot); permitir seleccionar un préstamo cerrado en "Generar Recibo"; cambiar el estado de un préstamo desde el recibo; tocar la migración (Epic 5) ni el dashboard (Epic 6); agregar más de una dependencia client-side (sólo la de exportar imagen, cargada lazy dentro del chunk de Préstamos para que el flag-off siga eliminándolo).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| RECEIPT_FLOW | seleccionar préstamo activo con cuota | el monto prellena `min(cuota, saldo)` y queda editable; confirmar registra el pago y muestra el recibo | inline si no hay préstamo o el monto es inválido |
| RECEIPT_NO_INSTALLMENT | préstamo sin cuota | el monto prellena el saldo pendiente completo | — |
| RECEIPT_CLOSES_LOAN | pago que deja el saldo en 0 | se registra y el toast dice que cerró el préstamo | — |
| RECEIPT_SELECT_CHANGE | cambiar de préstamo con un recibo visible | el recibo se oculta | — |
| AMOUNT_IN_WORDS | cualquier monto | entero en palabras + sustantivo de moneda + "con cc/100" | — |
| HISTORICAL | "Ver Recibo" de un pago pasado | se renderiza desde el snapshot, con la línea de adelanto si hubo | — |
| HISTORICAL_REVERSED | pago revertido | el recibo muestra la cobranza revertida | — |
| PRINT | imprimir | sólo el recibo llega al papel | — |
| PNG | exportar | se descarga un PNG del recibo sin botones | — |
| CLOSED_EXCLUDED | "Generar Recibo" | los préstamos cerrados no aparecen en el selector | — |

</frozen-after-approval>

## Code Map

Roots: `client/src/Loans/`, `packages/planny-loans/src/planny_loans/loans/`.

- `client/src/Loans/amountInWords.js` — NEW, función pura: convierte el entero a palabras en español y une el sustantivo de moneda con concordancia ("un dólar"/"dos dólares"/"quinientos pesos") más `con cc/100`. Sin dependencias.
- `client/src/Loans/Receipt/index.jsx` — NEW, el recibo renderizado: ciudad, día/mes/año, número, monto recibido con moneda, "Pagado a", concepto, monto en letras, "Pagado por", "Aprobado", imagen de firma, saldo resultante, e historial con la línea "Pago cuotas anteriores" cuando `advancePaid` > 0. Recibe el snapshot del pago + los campos descriptivos del préstamo. `@media print` aísla sólo esta pieza.
- `client/src/Loans/ReceiptFlow/index.jsx` — NEW, la vista "Generar Recibo": `Select` de préstamos activos (`GET /api/v1/loans` → `active`), prefill `min(cuota, saldo)` o el saldo, campo de monto, y al confirmar `POST /loans/{id}/payments` y render del recibo; el toast distingue el cierre del préstamo (lee `status` de la respuesta).
- `client/src/Loans/LoansList/index.jsx` + `client/src/Loans/LoanForm/index.jsx` — una acción "Generar Recibo" y un "Ver Recibo" por cada pago del historial que abre el recibo histórico desde `payment.snapshot` (`serializers.py` `payment_to_dict` 42–78 ya lo expone).
- `client/src/Loans/index.jsx` — NEW ruta `receipt` bajo `/project/loans` para la vista; la acción "Generar Recibo" enlaza ahí.
- `client/src/Loans/copy.js` — copy voseo del recibo (etiquetas FR23, el texto del toast de cierre, "Pago cuotas anteriores").
- `packages/planny-loans/src/planny_loans/loans/serializers.py` — sin cambios si el snapshot ya cubre todo; agregar lo que falte (ej. `number`/`currency` ya vienen del préstamo, no del pago).
- `client/package.json` — NEW una dependencia de exportación de imagen (`html-to-image` o `html2canvas`), importada dinámicamente sólo en `ReceiptFlow`/`Receipt` para que `REACT_APP_ENABLED_LOANS=false` la siga eliminando (resolver por alias, como el chunk de Préstamos).
- `client/src/Loans/amountInWords.test.js` + `client/src/Loans/Receipt/...test.js` + Cypress `loans.spec.js` — la función de letras con casos (0, 1, 21, 100, 1000, 1500.50, millón), y los flujos de recibo.

## Tasks & Acceptance

**Execution:**
- [ ] `amountInWords.js` + su test — la conversión a letras con moneda y centavos.
- [ ] `Receipt/index.jsx` + copy + impresión aislada — el recibo formal desde snapshot + descriptivos.
- [ ] `ReceiptFlow/index.jsx` + ruta — generar y render en una acción, prefill y toast de cierre.
- [ ] "Ver Recibo" en el historial de pagos + "Generar Recibo" en el listado.
- [ ] PNG export con la dependencia cargada lazy, y flag-off intacto.
- [ ] Cypress + tests de snapshot histórico.

**Acceptance Criteria:**
- Given la vista Generar Recibo, when selecciono un préstamo activo, then el monto prellena según la cuota o el saldo y queda editable, y confirmar registra el pago y muestra el recibo.
- Given un pago que cierra el préstamo, when lo confirmo, then el toast dice explícitamente que cerró el préstamo.
- Given cualquier monto, when se renderiza el recibo, then el entero aparece en palabras con su moneda y centavos.
- Given el historial de un préstamo, when elijo "Ver Recibo", then se renderiza desde el snapshot, sin importar ediciones posteriores, con la línea de adelanto si hubo.
- Given un recibo renderizado, when imprimo, then sólo el recibo llega al papel; when exporto, then se descarga un PNG sin UI.
- Given un build con `REACT_APP_ENABLED_LOANS=false`, when lo construyo, then el recibo y la dependencia de imagen no entran al bundle.

## Implementation Notes

- El snapshot del pago (`payment_to_dict`) ya trae `pendingBalance`, `totalPaid`, `advancePaid` y `paymentsHistory`; el recibo histórico combina eso con los descriptivos actuales del préstamo (número, ciudad, prestamista, concepto, nombre). La "línea de adelanto" es la entrada "Pago cuotas anteriores" cuando `advancePaid` > 0.
- La conversión a letras es la pieza más delicada y aislada: escribirla como función pura con su test exhaustivo antes de tocar la vista.
- El flag-off se verifica igual que siempre: el chunk de Préstamos (incluido el recibo y su dependencia) no debe aparecer en `build/` con el flag apagado.

## Plan Change Log

## Plan Change Log

- **Iteration 1 — review patches (patch route).** La Quick lens encontró dos defectos reales y cuatro inconsistencias, todos corregidos sin cambiar el plan: el apócope "uno/veintiuno → un/veintiún" faltaba en la rama de millones de la conversión a letras; el aislamiento de impresión usaba `position: absolute` y el recibo histórico (dentro del `Modal`) salía centrado/recortado en vez de arriba del papel; el refetch posterior al pago mostraba un "falló el pago" engañoso; y el recibo de una cobranza revertida seguía encabezando con "Recibí la suma de…" (ahora un banner dice que fue revertida). También se verificó el flag-off contra `html-to-image` y se cubrió un snapshot migrado con números pelados.

## Review Triage Log

- **Quick lens finding 1 — `uno`/`veintiuno` no se apocopan antes de "millones".** `low`, patched. Confirmado: `intToWords(21_000_000)` producía "veintiuno millones" porque la rama de millones no aplicaba `agree` al contador, y el `agree` de arriba sólo reescribe el último token ("millones"). Corregido con `agree(intToWords(millions))` y cubierto por `test` con 21M/31M/101M.
- **Quick lens finding 2 — el aislamiento de impresión se rompe en el recibo histórico (dentro del `Modal`).** `medium`, patched. Confirmado: el print CSS usaba `position: absolute`, que resuelve contra el `position: relative` del modal y deja el recibo centrado/recortado. Cambiado a `position: fixed` para que resuelva contra el viewport y escape del overlay fijo con overflow.
- **Quick lens finding 3 — `confirm` muestra un toast de error engañoso si falla el refetch posterior al pago.** `low`, patched. Confirmado: el `load()` de refresco propagaba su rechazo al `.catch` del POST, mostrando "falló el pago" tras un pago exitoso. El refetch ahora traga su propio fallo —el recibo ya está en pantalla—.
- **Quick lens finding 4 — el recibo de una cobranza revertida seguía encabezando con "Recibí la suma de…".** `medium`, patched. Confirmado: la fila de la matriz `HISTORICAL_REVERSED` no se cumplía del todo —la reversión sólo aparecía como chip en el historial—. `receiptData` ahora expone `payment.reversedAt` y el recibo muestra un `ReversedBanner` prominente que dice que la cobranza fue revertida y no constituye comprobante; cubierto por test.
- **Quick lens finding 5 — el flag-off no verificaba la ausencia de la dependencia de imagen.** `low`, patched. El comando de verificación ahora también busca `html-to-image`; ejecutado, la build con `REACT_APP_ENABLED_LOANS=false` no contiene `html-to-image` ni el recibo.
- **Quick lens finding 6 — el render histórico no se verificaba contra un snapshot recomputado/migrado.** `low`, patched. Añadido un test que alimenta un snapshot migrado (montos de historial como número JSON pelado, sin `advancePaid`), ejerciendo la fidelidad que el serializador normaliza.

## Verification

**Commands:**
- `cd client && npx jest` -- expected: pasan, incluidos los de `amountInWords`
- `cd client && npx eslint src && npm run build` -- expected: pasan
- `cd client && REACT_APP_ENABLED_LOANS=false npm run build && grep -rl "new-loan\|Generar Recibo\|html-to-image\|Recibo de pago" build/` -- expected: sin match
- Cypress `loans.spec.js` -- expected: los flujos de recibo pasan
- `uv run pytest packages/ -q` -- expected: la base (sin cambios de backend salvo lo que el snapshot necesite)

**Manual checks:** generar un recibo y leerlo; reimprimir uno histórico; imprimir (sólo el recibo) y exportar PNG; verificar el toast de cierre.
