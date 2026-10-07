---
title: 'Loans as an installable optional module'
type: 'refactor'
ticket: ''
created: '2026-10-07'
status: 'built'
baseline_revision: 'ddc013fa4c6cc8b5cf5896e77bfb8c5ab94f075a'
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
  - 'docs/architecture/how-to-merge-a-project.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The loan app ships as two in-tree domains under `planny_api/modules/`, so every deployment gets it whether or not it is wanted. It is meant to be an optional module that can be installed or left out of the final version.

**Approach:** Move `borrowers` and `loans` into a new `packages/planny-loans/` distribution that publishes a `planny.modules` entry point — installing the package is the entire integration ([how-to-add-a-module.md:126-151](../../docs/architecture/how-to-add-a-module.md)). Uninstalling it removes the routes with no code change anywhere.

## Boundaries & Constraints

**Always:** keep the models (`planny_core/models/{borrower,loan}.py`) and both Alembic revisions exactly where they are; keep the vertical (`router` → `service` → `repository`) and every behaviour, message and validation rule byte-for-byte; keep the canonical `/api/v1` paths and the automatic unversioned alias; point the plugin's dependency at `planny-api`, never the reverse.

**Never:** add `planny-loans` to `planny-api`'s dependencies or import it from anywhere under `planny_api/`; register the package in `settings.modules_packages` — an unimportable entry there is a **hard startup failure** (`registry.py:79-82`) and `test_architecture.py:140` requires that list stays empty, so the entry point is the only mechanism; touch `alembic/env.py`, add `version_locations`, or make the models optional; change any loan or borrower behaviour; touch the client (deferred — see `deferred-work.md`).

## Decisions

- **Models and migrations stay put** (human-confirmed). This is the `planny-jira` precedent: its tables (`daily_hours`, `tempo_hours_daily`, `worklog_submission*`) live in `planny-core` with the root revision set. What is optional is the logic and its endpoints, not the shared schema. It also sidesteps an unsolved problem: `alembic check` (CI, `.github/workflows/python.yml:30`) would try to drop the tables whenever the package is absent.
- **Entry point over `modules_packages`** because absence has to be silent: a missing entry point is simply not iterated, whereas a configured-but-missing package aborts startup.
- Distribution `planny-loans`, import package `planny_loans`, declaring `MODULES` in `planny_loans.modules`.
- The package is a dependency of the **root** workspace project so the dev and CI environments keep it installed and every current test stays meaningful; a deployment omits it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| INSTALLED | `planny-loans` installed | `/api/v1/loans` and `/api/v1/borrowers` answer 200; their unversioned aliases return identical JSON | none |
| NOT_INSTALLED | package absent from the environment | `create_app()` boots; no `loans`/`borrowers` path in `openapi()`; no `ModuleNotFoundError` | none |
| DISCOVERY | package installed | `discover_modules` reports `loans` and `borrowers`, sourced from the entry point | none |
| NO_COUPLING | any state | nothing under `planny_api/` imports `planny_loans` | none |

</frozen-after-approval>

## Code Map

Root: `packages/`.

- `planny-loans/pyproject.toml` — NEW. `name = "planny-loans"`; deps `planny-core`, `planny-api`, `fastapi>=0.115`; `[project.entry-points."planny.modules"] planny_loans = "planny_loans.modules"`; hatchling `packages = ["src/planny_loans"]`; copy the `[tool.ruff]`, `[tool.mypy]` and `[tool.pytest.ini_options]` blocks from `planny-api/pyproject.toml`.
- `planny-loans/src/planny_loans/modules.py` — NEW. `MODULES = (borrowers.MODULE, loans.MODULE)`, shaped like `planny-api/tests/fixtures/planny_example_module/__init__.py`.
- `planny-loans/src/planny_loans/{borrowers,loans}/` — MOVED verbatim from `planny-api/src/planny_api/modules/`. The only edits are intra-package: `planny_api.modules.borrowers` → `planny_loans.borrowers` (same for `loans`). Imports of `planny_api.kernel.module`, `planny_api.dependencies` and `planny_core.*` stay as they are — that is exactly what the external-module example does.
- `planny-loans/tests/{test_borrowers,test_loans}.py` — MOVED from `planny-api/tests/`. They still import `planny_api.main.create_app` and `planny_api.dependencies.get_db`; only `from planny_api.modules.borrowers import repository` becomes `from planny_loans.borrowers import repository`.
- `planny-api/src/planny_api/modules/{borrowers,loans}/` — DELETED once nothing references them; the two directories are the only in-tree hits.
- `../pyproject.toml` (repo root) — add `"planny-loans"` to `dependencies` and `planny-loans = { workspace = true }` to `[tool.uv.sources]`.
- `planny-api/tests/test_architecture.py` — add the optionality guard (nothing under `planny_api/` imports `planny_loans`) and widen the router-thinness scan (`:255-265`, today `MODULES_DIR`-only) to cover the plugin, so the moved routers stay governed.

## Tasks & Acceptance

**Execution:**
- [ ] `planny-loans/pyproject.toml` + `src/planny_loans/modules.py` — the distribution and its entry point.
- [ ] `planny-loans/src/planny_loans/{borrowers,loans}/` — move both domains, rewriting only the intra-package imports.
- [ ] `planny-loans/tests/` — move both test modules and their imports.
- [ ] `planny-api/src/planny_api/modules/{borrowers,loans}/` — delete.
- [ ] `../pyproject.toml` — register the workspace member.
- [ ] `planny-api/tests/test_architecture.py` — the no-import guard and the widened thinness scan.

**Acceptance Criteria:**
- Given the package installed, when the API boots, then `/api/v1/loans` and `/api/v1/borrowers` answer and their unversioned aliases return the same JSON, with the full existing suite still green.
- Given the package absent from the environment, when the API boots, then no loans or borrowers path appears in the OpenAPI schema, the app starts cleanly, and nothing raises `ModuleNotFoundError`.
- Given the package installed, when modules are discovered, then `loans` and `borrowers` are found through the `planny.modules` entry point rather than an in-tree scan.
- Given the architecture suite, then it fails if anything under `planny_api/` imports `planny_loans`.

## Implementation Notes

- **Touched:** `packages/planny-loans/` (new: `pyproject.toml`, `src/planny_loans/__init__.py`, `modules.py`, the moved `borrowers/` + `loans/`, and the moved `tests/`), root `pyproject.toml` + `uv.lock`, `packages/planny-api/tests/test_architecture.py`. `planny_core/models/`, `alembic/`, and the whole client are untouched.
- **The move is provably import-only.** `git diff -M` reports `similarity index 100%` for every `repository.py`, `schemas.py` and `serializers.py`; routers and services differ only in `planny_api.modules.<domain>` → `planny_loans.<domain>`, plus the import-block regrouping `ruff --fix` requires once `planny_loans` is first-party.
- **Test count reconciled.** The plan predicted 814; the real baseline at `ddc013f` was 814 and the final figure is **816** (815 from the implementation, plus the declaration rule below). The implementer's "baseline 813" reading was wrong.
- **Gap found in the implementation and closed.** `TestModulePackages.test_package_exposes_a_module_or_modules` is parametrized over `_module_packages()`, i.e. `planny_api/modules` only, so moving the two domains silently dropped them from that rule (the suite went 22 → 21). Added `TestOptionalPluginBoundary.test_the_plugins_domains_declare_themselves` over a new `_plugin_domain_packages()` helper, which no-ops when the distribution is absent — the same convention the widened thinness scan uses. Falsified: renaming `MODULE` in the plugin's `borrowers/__init__.py` fails it with `['borrowers'] expose neither MODULE nor MODULES`; restoring passes. The architecture suite is back to 22.
- **An extra test file beyond the Code Map:** `packages/planny-loans/tests/test_optional_install.py`, which makes the `DISCOVERY` and `NOT_INSTALLED` matrix rows provable by the suite instead of by hand. The `NOT_INSTALLED` case simulates absence with a `meta_path` blocker plus suppressed entry points; the real uninstall was also verified manually (below).
- **Residual, by design:** `PLUGIN_ROOT` in the architecture test hardcodes `planny-loans/src/planny_loans`, so renaming the distribution would turn the plugin scans into silent no-ops. Named here so a rename remembers to update it.
- **`alembic check` fails, pre-existing and unrelated.** It reports upgrade operations against `data/jira.sqlite` at `HEAD` too — reproduced in a throwaway worktree. `alembic/env.py` imports only `planny_core.models` and never `planny_api`/`planny_loans`, and the `loan` table stays in the metadata either way, which is exactly why the models were left in place.

## Plan Change Log

## Review Triage Log

Lens: `quick` (pinned), 1 lens, 5 findings. Verdicts: 2 low, 3 false.
Routes: 2 patch, 3 rejected. No intent_gap or bad_plan, so no loopback
(`review_loop_iteration` stays 0).

| # | Finding | Verdict | Route | Evidence and action |
|---|---|---|---|---|
| 1 | `planny-loans/tests/test_optional_install.py` — the `NOT_INSTALLED` case stops entry-point loading, so it only proves the in-tree scan lost the domains and would pass even if entry-point discovery leaked imports | false | rejected | The row's expectation is exactly what it asserts: with no distribution, `create_app()` boots, zero loans/borrowers paths, built-ins still mounted. The mechanism the finding says is unguarded is guarded by a *different* test in the same file — `test_the_domains_are_discovered_from_the_entry_point` calls `discover_modules(scan_packages=[], use_entry_points=True)` and requires `borrowers`/`loans` to arrive from the entry point — so a broken entry-point path cannot hide behind this fixture. The real absence was also proven outside the suite: uninstalling the distribution gives `entry_points == []`, 28 built-in paths and `ModuleNotFoundError` on import. The docstring is looser than the assertion, but the coverage claim is wrong. |
| 2 | `planny-api/tests/test_architecture.py` — `PLUGIN_ROOT` is unguarded, so both plugin scans report success while checking nothing | low | patch | Confirmed: pointing `PLUGIN_ROOT` at a non-existent path left the suite green with the plugin's routers and declarations invisible. The harm is named and already demonstrated once *in this very change*, where moving the domains silently dropped them from the parametrized declaration rule (22 → 21). **Action:** `test_the_plugin_scans_are_not_silently_empty` ties "the distribution is installed" to "its sources are findable", so an absent deployment still no-ops while a rename or restructure fails loudly. Falsified: repointing `PLUGIN_ROOT` fails with "planny_loans is installed but its sources are not at …; the plugin scans in this file are checking nothing". |
| 3 | `test_optional_install.py` — `find_spec` raises `ModuleNotFoundError` rather than returning `None`, and the blocker intercepts `planny_loans` imports globally during that test | false | rejected | No bad outcome. The reviewer concedes the observable result is identical, and that the masking is "redundant rather than harmful" because the AST guard carries the coupling check: it was independently confirmed to fail on a probe module importing `planny_loans.borrowers.repository`, and it runs over the whole of `planny_api` on every run rather than only inside one test. |
| 4 | The `Implementation Notes` test-count reconciliation is off by one | false | rejected | Refuted by the component breakdown, which the reviewer's arithmetic assumed away: the implementation's own new architecture test took the suite 22 → 21 (two parametrized declaration instances lost, one plugin test gained), not back to 22. So 814 baseline + 2 (`test_optional_install`) + 1 − 2 = **815** from the implementation, exactly as the note says, and the declaration rule restored the 22nd architecture test → 816, now 817 with the guard from finding 2. The implementer's own run also reported 815 before the declaration rule existed. |
| 5 | A loans-free deployment is not documented: `Dockerfile.python`'s `uv sync --frozen --no-dev` installs the plugin from the shared lock file, so "a deployment omits it" needs a recipe | low | patch | Real and worth closing, since install-or-not is the point of the change. Verified that the recipe works before writing it down: `uv sync --no-install-package planny-loans` yields `entry_points == []`, zero loans/borrowers paths and 28 built-in paths, with no manifest edited. **Action:** documented under "Leaving a module out of a deployment" in `docs/architecture/how-to-add-a-module.md` §5, including the consequence that one distribution equals one toggle, so unrelated domains should not share a package. |

Pre-existing, not this change's: `npx prettier --check docs/architecture/how-to-add-a-module.md`
already failed at the baseline — its only complaint is the pre-existing table alignment at
lines 68-79, far from the section added here. Left alone rather than reformatting a doc to
bury a five-line addition.

## Verification

**Commands:**
- `uv sync` then `uv run pytest packages/ -q` -- expected: 816 tests, all pass, the moved ones now collected from the new package
- `uv run pytest packages/planny-api/tests/test_architecture.py -q` -- expected: 22 pass, including the no-import guard and the restored declaration rule
- `uv run ruff check packages/` and `uv run mypy packages/` -- expected: clean, covering the new package
- `uv run python -c "from planny_api.app.factory import create_app; print(sorted(p for p in create_app().openapi()['paths'] if 'loans' in p or 'borrowers' in p))"` -- expected: the four canonical paths, proving entry-point discovery
- `uv pip uninstall planny-loans` then the same check as `uv run --no-sync python -c "..."` -- expected: `[]`, 28 built-in paths still mounted, `import planny_loans` raising `ModuleNotFoundError`; then `uv sync` to restore. **`--no-sync` is required**: plain `uv run` re-syncs and silently reinstalls the package, which makes the check pass for the wrong reason.
- `cd client && npm run test:jest && npm run build` -- expected: unchanged, the client is untouched by this plan

**Manual checks:** confirm `git grep -n planny_loans -- packages/planny-api/src` returns nothing.
