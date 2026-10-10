---
title: 'Loans on the app''s design system: one visual language'
type: 'refactor'
ticket: ''
created: '2026-10-10'
status: 'built'
baseline_revision: '0a6d9c1250cab98f200155e67f7a2909c2cc6e39'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context:
  - 'docs/architecture/architecture-contract.md'
  - 'client/src/shared/utils/styles.js'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Préstamos se ve como otra aplicación dentro del host. Sus vistas traen su propia paleta, sus propios `Panel`/`Card`/`Field` y controles HTML crudos (`client/src/Loans/Styles.js`), y se montan fuera del shell del proyecto. El operador entra desde la barra lateral de Kanban Board a una pantalla que no comparte tipografía, colores, campos, botones ni diálogos con el resto del producto, y además reaparece una navegación interna propia que compite con la del host.

**Approach:** Una sola aplicación: las vistas de Préstamos se renderizan dentro del shell del proyecto (misma barra lateral, mismo encabezado, mismo ancho de contenido) y se reconstruyen sobre el sistema de diseño existente —tokens de `shared/utils/styles.js` y los componentes de `shared/components` (`Form`/`Form.Field`, `Input`, `Select`, `DatePicker`, `Button`, `ConfirmModal`, `toast`, `PageLoader`)— eliminando la paleta y los controles paralelos, sin cambiar el comportamiento que ya funciona.

## Boundaries & Constraints

**Always:** reutilizar los componentes y tokens compartidos, no re-estilizarlos; que Préstamos se vea y navegue como una vista del proyecto (shell, encabezado, sidebar del host); mantener la lógica existente —`money.js`, `copy.js`, los endpoints y el flujo de pagos— intacta; conservar cada comportamiento cubierto hoy (preview del saldo sin doble conteo, historial de pagos, borrado con confirmación, candado de moneda, errores por sección); mantener accesible la entrada "Préstamos" del sidebar del proyecto.

**Never:** agregar una librería de UI o dependencias nuevas; duplicar en `Loans/` componentes que ya existen en `shared/`; cambiar contratos de API, modelos, migraciones o el backend; romper el build con `REACT_APP_ENABLED_LOANS=false` (la feature debe seguir siendo eliminable por alias); tocar la aplicación de proyectos más allá de lo mínimo para hospedar la vista.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SHELL_HOSTED | entrar a la vista de Préstamos desde el sidebar del proyecto | se ve la sidebar del host, encabezado de página y contenido en el ancho del proyecto; sin nav interna propia | ninguno |
| FIELDS_SHARED | cualquier formulario de Préstamos | labels, inputs, select y errores son los compartidos (`Form.Field`), con tipografía y colores del sistema | errores de validación bajo el campo |
| INPUT_CONTRACT | usuario escribe en un campo | el valor entra al estado del formulario | un `onChange` que recibe el evento y no el valor no debe romper |
| CURRENCY_LOCKED | préstamo con pagos o adelanto | el select de moneda se muestra deshabilitado con la explicación en español | no editable |
| LIST_AND_CARDS | listado de préstamos con datos | filas/tarjetas con el mismo lenguaje visual que las tarjetas de issues | — |
| LOAD_AND_ERROR | carga lenta o fallida | `PageLoader` mientras carga; el error de carga se muestra como estado de página y el de pagos dentro de su sección | mensaje en español, con reintento donde ya existe |
| PAYMENTS_FLOW | registrar y eliminar un pago | mismo comportamiento y toasts que hoy, ya sobre componentes compartidos | rechazo del API en toast, en español |
| FLAG_OFF | build con `REACT_APP_ENABLED_LOANS=false` | la feature no entra al bundle y `/loans` cae en `PageError` | — |

</frozen-after-approval>

## Code Map

Roots: `client/src/Loans/`, `client/src/Project/`, `client/src/shared/components/`, `client/cypress/integration/`.

- `client/src/App/Routes.jsx:48` — hoy `/loans/*` monta `Loans` como app aparte. La vista pasa a registrarse dentro del espacio del proyecto (`/project/loans/*`) conservando el flag `LOANS_ENABLED`, y `Project/index.jsx:398-421` es el precedente de rutas anidadas.
- `client/src/Loans/index.jsx` — pierde `Shell`, `<h1>`/`<h2>` crudos, `Panel` y la `Sidebar` interna; toma el encabezado de página (`PageTitle`/`Breadcrumbs` al estilo `ProjectSettings/index.jsx:39-43`), `PageLoader` y `PageError`, y las sub-rutas (hoy `dashboard`/`receipt` son placeholders: conservarlos o retirarlos, pero sin nav propia).
- `client/src/Loans/Sidebar.jsx` — se elimina junto con `loanNavigation` en `copy.js:10-16`; la navegación es la del host. `Loans/copy.test.js` se ajusta. Nada fuera de `Loans/**` depende de esta nav (grep-verificado).
- `client/src/Loans/Styles.js` — se elimina como paleta paralela. Lo que sobreviva son wrappers locales con tokens (`color`, `font`, `radius`, `mixin.boxShadowCard`), no hex propios.
- `client/src/Loans/LoanForm/index.jsx` — la pieza grande: `Form` + `Form.Field.Input/Select/DatePicker` para monto, moneda, fecha, concepto, prestamista, ciudad, adelanto y cuota; `Button`/`Divider` con el patrón de `IssueCreate/Styles.js:29-42`; conserva `collectedFromLoan`, `pendingBalancePreview`, el refetch que no pisa ediciones sin guardar, y la sección de pagos con `ConfirmModal`. La fecha nativa pasa a `DatePicker withTime={false}`.
- `client/src/Loans/LoansList/index.jsx` — `Button`/`ConfirmModal`/`toast` ya son compartidos; faltan `PageLoader`, estado vacío y filas/tarjetas con el lenguaje de `IssueCard` (`shared/components/IssueCard/index.jsx:18`) o un wrapper con tokens.
- `client/src/Loans/Borrowers/index.jsx` y `Loans/BorrowerPicker.jsx` — `<form>`/`Input`/`<button>` crudos pasan a `Form`+`Form.Field` y `Button`; el picker usa `Select` con `options`+`renderOption`+`onCreate`, o un wrapper con tokens si el `Select` no alcanza. `InputDebounced` ya es compartido.
- `client/src/shared/components/Select/index.jsx` — contrato a respetar: `options: [{value,label}]`, `onChange(value)`, controlado solo si `value !== undefined`, sin prop `disabled`. Si el candado de moneda necesita deshabilitarlo, se agrega `disabled` al componente compartido (cambio mínimo y compatible) en vez de un select paralelo. Bug conocido y fuera de alcance salvo que estorbe: `Select/Styles.js:12,20` lee `props.variant` en lugar de `$variant`.
- **Contratos que rompen si se cambia el control sin tocar el handler:** `Input`/`Textarea` llaman `onChange(value, event)` (`shared/components/Input/index.jsx:29`), `Select` llama `onChange(value)`, `DatePicker` devuelve `YYYY-MM-DD` (`DatePicker/index.jsx:179-190`) y `Button` no fija `type` (dentro de un form, se envía). Todo handler migrado se escribe para el valor, no para el evento.
- `client/src/Project/Sidebar/index.jsx:62-73` — la entrada "Préstamos" (`common.loans`, `absolute: true`) ya existe; si la vista vive bajo `/project/loans`, deja de ser `absolute` y comparte el resaltado activo del host.
- `client/cypress/integration/loans.spec.js` — 13 flujos que asumen la estructura actual (nav interna, textos, `article`); se actualizan al shell y a los componentes compartidos, conservando el guard de Jira-500.

## Tasks & Acceptance

**Execution:**
- [ ] `App/Routes.jsx` + `Project/index.jsx` + `Project/Sidebar/index.jsx` — hospedar las vistas de Préstamos en el shell del proyecto, con el flag intacto.
- [ ] `Loans/index.jsx` + eliminar `Loans/Sidebar.jsx` y `copy.js`'s `loanNavigation` — encabezado de página, loader/error y navegación del host.
- [ ] `Loans/Styles.js` — reducir a wrappers con tokens o eliminarlo si los componentes compartidos alcanzan.
- [ ] `Loans/LoanForm/index.jsx` — el formulario y la sección de pagos sobre `Form`/`Form.Field`/`Button`/`DatePicker`/`ConfirmModal`.
- [ ] `Loans/LoansList/index.jsx`, `Loans/Borrowers/index.jsx`, `Loans/BorrowerPicker.jsx` — listado, alta de personas y picker sobre los componentes compartidos.
- [ ] `shared/components/Select/index.jsx` — agregar `disabled` solo si el candado de moneda lo requiere.
- [ ] `cypress/integration/loans.spec.js` + `Loans/copy.test.js` — actualizar selectores y flujos.

**Acceptance Criteria:**
- Given la app corriendo, when entro a Préstamos desde la sidebar del proyecto, then veo el mismo shell, tipografía, colores y componentes que en Kanban Board, sin navegación propia duplicada.
- Given el formulario de préstamo, when lo uso, then cada campo es el componente compartido, con el mismo foco, borde, label y error que en el resto de la app.
- Given un préstamo con pagos, when abro su edición, then el select de moneda está deshabilitado y explica por qué en español.
- Given el listado y el alta de personas, when los uso, then se ven como las vistas equivalentes del proyecto y sus acciones siguen funcionando.
- Given un build con `REACT_APP_ENABLED_LOANS=false`, when lo construyo, then Préstamos no está en el bundle y `/loans` cae en `PageError`.
- Given los 13 flujos de Cypress, when los corro, then pasan sobre la nueva estructura.

## Implementation Notes

- Los contratos que más rompen son los `onChange` (`Input` recibe el valor, no el evento), las `options` del `Select` y su falta de `disabled`, y el `DatePicker` que devuelve `YYYY-MM-DD`. Antes de tocar un campo, mirar el handler que ya existe.
- `ProjectPage`/`ContentCard`/`MainContent` no se exportan hoy desde `Project/Styles.js`: hospedar la vista puede requerir exportarlos o exponer un layout compartido, no copiarlos.
- Mantener el preview del saldo con un solo término de pagos y el refetch que no descarta ediciones sin guardar: son los dos defectos que ya aparecieron en este módulo.

## Plan Change Log

## Plan Change Log

- **Iteration 1 — review patches (patch route).** The Quick lens found three real defects, all fixed with the smallest change and covered by the gates: the flag-off `/loans` path landing on an empty shell instead of `PageError` (`Routes.jsx` conditional redirect + a `path="*"` in the project's nested router), the person picker's retry setting state to its own value so it never refetched, and the `ViewNav` the view had re-created under its header contradicting the "sin nav interna propia" row. The nav's removal made the person directory URL-only, so the host sidebar gained the `sidebar.borrowers` entry — the navigation the intent names — with `exact` route matching for the loan list. Also patched: the person form posting the API's own `loanCount` back on the wire, and a dead `CardSubtitle` export. Kept: the shell hosting, the `Form`/`Form.Field` rebuild with the payments preview applied once, the server-derived `collected`, and the currency lock on the shared `Select`.
## Review Triage Log

- **Quick lens finding 1 — `/loans` no longer reaches `PageError` with the flag off.** `medium`. Confirmed: `Routes.jsx` replaced the flag-gated route with an unconditional redirect, and with the feature compiled out `/project/loans` matches nothing inside the project's nested router, so the operator lands on the shell with an empty main area. Fixed in place: the legacy redirect is now conditional on `LOANS_ENABLED`, and the project's nested router gains a `path="*"` that renders `PageError`. Verified in a browser against a flag-off build: both `/loans` and `/project/loans` render the error page.
- **Quick lens finding 2 — the picker's retry is dead.** `medium`. Confirmed: `onClick={() => setQuery((current) => current)}` sets state to its own value, React bails out, and the effect keyed on `query` never re-runs, so the "Reintentar" button did nothing. Fixed with a `reloadToken` the effect also depends on.
- **Quick lens finding 3 — the "elegí una persona" error cannot appear on a submit with other field errors.** `low`. True as filed: the borrower lives outside the Formik values, so its failure surfaces through the toast inside `onSubmit`, which Formik only reaches when the fields validate. Rejected: the outcome the operator meets is still correct and actionable (the four empty fields are marked, and submitting the person alone is not a flow the form offers), and lifting the borrower into Formik values would restructure the form's state to serve a message that already appears.
- **Quick lens finding 4 — the page chrome is duplicated instead of reused.** `low`. Real, pre-existing shape: `ProjectSettings/Styles.js` owns its own `Page`/`PageHeader`/`PageTitle`, and this view now mirrors it with tokens rather than importing it. Rejected: the two views already differ by design (22px vs 24px), wiring Loans to the settings view's private styles introduces cross-feature coupling that hurts more than the drift it prevents, and the shared extraction is a wider change than this review's smallest fix.
- **Quick lens finding 5 — the view keeps a parallel navigation.** `medium`. Confirmed against the intent's own matrix row ("sin nav interna propia"): `Loans/index.jsx` re-created the deleted sidebar as `ViewNav`. Removed. That left Personas reachable only by URL, so the host sidebar — the navigation the intent names — gained the `sidebar.borrowers` entry beside "Préstamos", with `exact` matching so the list does not claim its sibling. Verified by the shell flow in Cypress.
- **Quick lens finding 6 — `CardSubtitle` is exported and unused.** `low`. Confirmed by grep (only `QuickActions` has a component of that name, unrelated). Deleted.
- **Quick lens finding 7 — the person directory posts fields the endpoint does not declare.** `low`. Confirmed: `initialValues` in edit mode spreads the API's own borrower, carrying `loanCount` into the request body; Pydantic ignores it, so it is silent today but sends a response field back on the wire. Fixed by building the payload from the profile fields plus `notes`.
- **Quick lens finding 8 — `validateBorrower` hand-rolls what `Form.is.required()` provides.** `false`. The module's own validator returns the Spanish copy it needs (`borrowerCopy.required`), which the shared helper's generated message does not, and the fields render their errors through `Form.Field` either way. Convention preference, not a defective outcome.

## Verification

**Commands:**
- `cd client && npx jest` -- expected: pass, con los tests de `copy`/`money` actualizados
- `cd client && npx eslint src cypress` -- expected: sin errores nuevos
- `cd client && npm run build` -- expected: compila
- `cd client && REACT_APP_ENABLED_LOANS=false npm run build && grep -rl "new-loan" build/` -- expected: sin match
- Cypress `loans.spec.js` con el dev server y `env -u ELECTRON_RUN_AS_NODE` -- expected: los 13 flujos pasan, incluido el guard de Jira-500

**Manual checks:** entrar desde Kanban Board a Préstamos y comparar tipografía, colores, campos y botones contra otra vista del proyecto; registrar un pago y ver el saldo y el historial; comprobar el candado de moneda.
