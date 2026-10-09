---
title: 'Optional Loans client behind a build flag'
type: 'feature'
ticket: ''
created: '2026-10-07'
status: 'built'
baseline_revision: '4b8fad6b110a18b0164ca8fad9208a168da863f1'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context:
  - 'docs/loans-copy-style.md'
  - 'docs/architecture/architecture-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Loans API became an optional module, but the client did not. `/loans` is registered unconditionally (`client/src/App/Routes.jsx:8,37`) and its chunk is emitted into every build, so a deployment that omits the module still ships the whole loan UI as dead weight — and nothing links to it anyway.

**Approach:** Gate the feature at build time with `REACT_APP_ENABLED_LOANS`, defaulting to **enabled**. With it off, the feature's module never enters the module graph, so its code is not in the bundle, the route is not registered, and no navigation entry points at it.

## Boundaries & Constraints

**Always:** default to enabled so the dev server, Jest and the existing Cypress suite are unaffected; read the flag in exactly one place; reuse the existing-but-unused `common.loans` i18n key; leave the Loans feature code itself untouched; keep app copy in casual Rioplatense voseo.

**Never:** change any Loans runtime behaviour; rely on the minifier to drop the dynamic import — **measured, it does not**; leave a build that silently keeps the feature when disabled; add a runtime flag service or fetch enabled features over HTTP; touch the backend.

## Decisions

- **Gating the lazy import on a compile-time constant is not enough.** Measured: `LOANS_ENABLED ? lazy(() => import('Loans')) : null` with the flag off still emits the full `223-*.chunk.js` containing the feature, because webpack registers the `import()` in the module graph before the constant is folded. Elimination comes from `resolve.alias: { Loans: false }` in the production config, which resolves the specifier to webpack's empty module so the feature never enters the graph.
- **`cache.version` must include the flag.** Measured: the filesystem cache (`webpack.config.production.js:20`) is not invalidated by an environment change, so a warm cache served the enabled graph into a build that asked for it disabled — a silent failure. Adding the flag to `cache.version` makes both directions correct.
- **State the promise precisely.** With the flag off the feature's *code* is absent (no marker in `build/`); a trivial 88-byte empty chunk remains because the `import()` call itself is still in the code. That is the expected result, not a defect.
- Default is `REACT_APP_ENABLED_LOANS !== 'false'` (unset ⇒ enabled), mirroring the `REACT_APP_DEFAULT_PROJECT_ROUTE` precedent (`client/src/Project/index.jsx:60`).
- The navigation entry is a flag-gated item in `client/src/Project/Sidebar/index.jsx`, superseding the earlier "never couple loans routes to Jira project loading" boundary: an optional feature still needs a way in, and with the flag off the entry is not rendered at all.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| FLAG_UNSET | no env var, prod build | enabled: route registered, feature chunk emitted, nav entry shown | none |
| FLAG_TRUE | `REACT_APP_ENABLED_LOANS=true` | identical to unset | none |
| FLAG_FALSE | `=false`, prod build | feature code absent from `client/build`, `/loans` not routed (falls through to `PageError`), no nav entry | none |
| FLAG_FLIP | build `true` then `false` on the same machine, warm cache | disabled result, not the stale enabled graph | none |

</frozen-after-approval>

## Code Map

Roots: `client/`, `client/src/`.

- `client/webpack.flags.js` — NEW, CommonJS so both configs `require` it: `loansEnabled = process.env.REACT_APP_ENABLED_LOANS !== 'false'`. One place decides.
- `client/webpack.config.js` — dev `DefinePlugin` (`:50-60`, individual `'process.env.X'` keys): add `'process.env.REACT_APP_ENABLED_LOANS': JSON.stringify(loansEnabled ? 'true' : 'false')`, mirroring `REACT_APP_DEFAULT_PROJECT_ROUTE`.
- `client/webpack.config.production.js` — three edits: the same key inside its whole-object `'process.env'` block (`:115-127`); `alias: { ...(loansEnabled ? {} : { Loans: false }) }` inside `resolve` (`:56-59`) — this is what actually removes the code; and `version: \`${loansEnabled}\`` in `cache` (`:20-25`).
- `client/src/App/Routes.jsx` — keep the `lazy(() => import('Loans'))` and the `<Route path="/loans/*">` exactly as they are; gate only the *registration* on the flag so `PageError` catches `/loans` when disabled. The chunk removal is the config's job, not this file's.
- `client/src/Project/Sidebar/index.jsx` — add a flag-gated entry to `/loans` using `t('common.loans')` (currently dead in both locales). `isActiveLink` builds `` `${basePath}${item.path}` `` with `basePath = '/project'` (`:62-82`), so the item needs an absolute marker and the render must use the raw path for it.
- `client/src/features.test.js` — NEW Jest test (node environment, which is what Jest already uses) for `webpack.flags.js`: unset ⇒ enabled, `'true'` ⇒ enabled, `'false'` ⇒ disabled. Guards the default, which is the regression that would silently remove the feature for everyone.

## Tasks & Acceptance

**Execution:**
- [ ] `client/webpack.flags.js` — the single flag decision, CommonJS.
- [ ] `client/webpack.config.js` + `client/webpack.config.production.js` — wire the flag into both `DefinePlugin` blocks, plus the alias and `cache.version` in production.
- [ ] `client/src/App/Routes.jsx` — gate the route registration.
- [ ] `client/src/Project/Sidebar/index.jsx` — the flag-gated nav entry and the absolute-path handling in `isActiveLink`.
- [ ] `client/src/features.test.js` — pin the default-enabled semantics.

**Acceptance Criteria:**
- Given a production build with `REACT_APP_ENABLED_LOANS=false`, then no file under `client/build` contains the Loans feature's code, and `/loans` falls through to `PageError` instead of the feature.
- Given a production build with the flag unset or `true`, then the feature chunk is emitted and the whole existing Cypress suite passes unchanged.
- Given two consecutive builds that flip the flag, then the second build reflects the new value rather than the first one's cached graph.
- Given the app is built with the flag off, then no navigation entry points at `/loans`.
- Given the flag is unset, then it counts as enabled, proven by a test rather than by inspection.

## Implementation Notes

- **Touched:** `client/webpack.flags.js` (new), `client/src/shared/utils/loansFlag.js` (new, added by the review patch), `client/src/features.test.js` (new), both webpack configs, `client/src/App/Routes.jsx`, `client/src/Project/Sidebar/index.jsx`.
- **Measured, not assumed.** `new-loan` is the marker (it appears only inside the Loans module). Cold cache: flag unset → marker present; `true` → present; `false` → **absent**, leaving exactly one 88-byte empty chunk, as the plan predicted. Warm cache, no clearing: `true→false` → absent and `false→true` → present, so `cache.version` is doing its job. With the flag off, the literal `/loans` appears **nowhere** in `build/` — no route and no nav link survive; with it on, it is present (control).
- **Corrected a scope addition.** The implementer lifted the route table into an `export const appRoutes` element to drive a throwaway jsdom harness, then deleted the harness, leaving an export with no consumer. Reverted so `Routes.jsx` is exactly the plan's minimal change: the flag constant plus the gated `<Route>`.
- **The implementer broke the Cypress installation and I repaired it.** It ran `cypress install`, which extracted the archive with symlinks flattened; its hand-repair left the bundled Node binary at `Cypress.app/Contents/MacOS/Cypress`, so every launch died with `bad option: --no-sandbox`. Cypress had been working earlier in this session. Fixed by deleting `~/Library/Caches/Cypress/13.17.0` and reinstalling cleanly (`npx cypress install --force`, then `cypress verify` → *Verified Cypress!*). The 8 loans flows then passed unchanged.
- **One unrelated line changed on purpose.** The production config's `REACT_APP_JIRA_BASE_URL` was wrapped across three lines and was the file's only Prettier complaint; collapsing it makes `prettier --check` pass on a file this change already touches. Reverting it would leave a file failing the project's own formatter.
- **Coverage boundary, stated plainly.** The flag's *semantics* are unit-tested (`src/features.test.js`: unset ⇒ enabled, `true` ⇒ enabled, only `false` disables). The build-graph rows are verified by the commands above rather than by the suite, because they are properties of a webpack build — and the repo's Jest runs without jsdom, so the route table cannot be rendered in a unit test. The `/loans`-literal-absent check is the closest suite-reachable proxy for "no route and no link survive", and it is a shell check.
- **`Project/Sidebar` gained an `absolute` marker** so `isActiveLink`/`itemPath` do not prefix `/loans` with `/project`. The Más section also now sets the active class it previously omitted, which is what makes the new entry consistent with the Principal items.

## Plan Change Log

## Review Triage Log

Lens: `quick` (pinned), 1 lens, 7 findings. Verdicts: 1 medium, 2 low, 4 false.
Routes: 2 patch, 1 rejected, 4 rejected as false. No intent_gap or bad_plan, so no
loopback (`review_loop_iteration` stays 0).

| # | Finding | Verdict | Route | Evidence and action |
|---|---|---|---|---|
| 1 | The flag decision is restated in three files, against the plan's "read the flag in exactly one place" | medium | patch | Confirmed: `!== 'false'` appeared in `webpack.flags.js`, `Routes.jsx` and `Project/Sidebar/index.jsx`, so a convention change on one side would not follow the others. **Action:** the client now reads it once, from the new `client/src/shared/utils/loansFlag.js`; both components import that. The test pins the two sides of the `DefinePlugin` boundary together — every case asserts the Node side and the client side agree — so drift between them fails the suite instead of shipping the feature disabled. |
| 2 | The dev config got no alias, so with the flag off the dev server still renders the full Loans UI | false | rejected | The consequence does not follow. `{LOANS_ENABLED && <Route … element={<Loans />} />}` is short-circuited, so when the flag is off neither the `<Route>` nor the `<Loans />` element is ever created, and `lazy()`'s factory is not called: `/loans` matches `*` and renders `PageError` in dev exactly as in production. The reviewer's factual observation — no alias in `webpack.config.js` — is correct, but the plan scopes elimination to the production build (its own Decision says so), and a dev server's in-memory bundle is never shipped. |
| 3 | `alias: { Loans: false }` is inexact, so it also swallows `Loans/…` specifiers | false | rejected | That breadth is the feature's own subtree. `resolve.modules` puts `src` on the path, so `Loans/x` resolves to `src/Loans/x` — every one of which is the feature. The reviewer confirms there is no mis-resolution today; the "future" harm it describes is a feature-internal import, which disabling should remove. |
| 4 | `features.test.js` pins the flag module, not the wiring, so a config that inlined the inverse would pass every test | low | patch | Real and worth closing: the tests called `webpack.flags.js` directly, so the reviewer's exact scenario — inverting the value the config injects — would have gone unnoticed. **Action:** added assertions that both configs inline the resolved answer. Falsified: flipping the production config to `loansEnabled ? 'false' : 'true'` fails the two wiring tests while the semantic ones keep passing, which is precisely the hole; restoring returns 6/6. |
| 5 | Nothing verifies the new nav entry, so the `absolute` handling is untested | low | rejected | Meeting it needs either jsdom plus a DOM testing library — a dependency the two preceding plans explicitly forbade — or a full Project-shell Cypress spec requiring the live Python API, since the sidebar only renders with a project loaded. The plan states this boundary outright, and the flag-off check that matters is stronger than a component test: with the flag off the literal `/loans` appears **nowhere** in `build/`, which covers the route and the nav link together, with a flag-on control. |
| 6 | Renaming the injected key would leave the client reading an undefined key and throw at runtime | false | rejected | The production config defines `process.env` wholesale, so an unlisted key is replaced by the object and evaluates to `undefined` — not a `ReferenceError`. `undefined !== 'false'` is `true`, so the failure mode is "stays enabled", the safe direction, which is what the `!== 'false'` comparison was chosen for; the comment in `shared/utils/loansFlag.js` says so. |
| 7 | `webpack.flags.js` is linted as an ES-module source, so its CommonJS style is enforced by nothing | false | rejected | The finding states it is not a defect in the file, and there is no bad outcome to grade: an edit to `import` syntax would fail loudly when webpack loads the config, which is the opposite of the silent failures this change exists to prevent. |

Context for the record: `npx eslint src` (the plan's command) exits 0. Linting
`src/App/Routes.jsx` and `src/Project/Sidebar/index.jsx` as individual paths reports 7
errors, and the same rules fire on the `HEAD` versions of those files — they are
pre-existing and this change introduces none of them.

## Verification

**Commands:**
- `cd client && npm run test:jest` -- expected: pass, including the new flag test
- `cd client && REACT_APP_ENABLED_LOANS=false npm run build && grep -rl "new-loan" build/` -- expected: no match (feature code absent)
- `cd client && REACT_APP_ENABLED_LOANS=true npm run build && grep -rl "new-loan" build/` -- expected: a match (feature present)
- warm-cache flip: build `true`, then `false` without clearing `node_modules/.cache/webpack` -- expected: no match after the second build
- `cd client && npx eslint src webpack.config.js webpack.config.production.js webpack.flags.js` and `npx prettier --check` on the same paths -- expected: clean
- Cypress `loans.spec.js` with the dev server on 8192 (`env -u ELECTRON_RUN_AS_NODE`) -- expected: 8 passing, unchanged

**Manual checks:** build with the flag off, load the app, and confirm no "Préstamos" entry in the sidebar and that `/loans` renders the error page.
