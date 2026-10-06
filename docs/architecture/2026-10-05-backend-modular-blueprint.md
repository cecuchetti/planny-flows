# Blueprint: modular backend architecture

| Field | Value |
|---|---|
| Date | 2026-10-05 |
| Status | **Proposal — pending review** |
| Author | Architecture session (agent) |
| Scope | Backend (`packages/planny-core`, `packages/planny-api`, `packages/planny-jira`) + `alembic/` + tests |
| Out of scope | React client (except the optional adjustment described in §9.4) |
| Goal | Get the backend ready to grow and to merge other projects without traumatic refactors |

---

## 1. Executive summary

The backend works and is reasonably healthy: **297 tests pass, `ruff` clean, `mypy` clean** (verified in this session). The split into three packages (`planny-core` kernel, `planny-api` HTTP, `planny-jira` adapter) is correct, and there is a good foundation: SQLAlchemy 2.0 async, an `AppError` hierarchy with a global handler, structlog, Alembic, and a real test suite.

The problem is not quality, it is the **shape**: the structure is *by layer* (`routers/`, `services/`, `schemas/`), the wiring is **hardcoded in the app factory**, there are **~430 lines of seed data inside a router**, the configuration is **split between `pydantic-settings` and raw `os.environ`**, and there is **no API versioning**.

With the current structure, merging another project means: adding files in 4 different folders, editing `main.py` by hand, duplicating the authorization pattern, and praying that nothing collides. This document defines the target architecture and the phased migration plan.

**Desired outcome:** a *feature-first* modular monolith, with a module registry that discovers and mounts domains automatically. Adding a new domain (or merging an entire project) becomes *dropping in a package* — without touching the factory.

> **Two findings detected while auditing this document against the code (they were not in the initial analysis):**
>
> - **H12 — ACTIVE bug in production.** `main.py` turns off `/docs` when `env=production` but leaves `/redoc` and `/openapi.json` open, exposing the complete API map. Reproduced with the repo's real configuration. Zero risk to fix it (no test or consumer uses those endpoints).
> - **H13 — LATENT bug with a high blast radius.** `env_file=".env"` is relative to the CWD: when running from another directory, the configuration is lost **silently** and the app starts with the public dev JWT secret. Verified empirically. The 4 current startup paths all `cd` correctly, so **it is not an active incident today** — but it is one `systemd unit` away. Details and severity calibration in §2.3 H13; fix in Phase 1.

### Decisions already made by the user

| # | Decision | Choice |
|---|---|---|
| D1 | API versioning | Canonical `/api/v1/*` + automatic legacy alias. The client is untouched. |
| D2 | Internal structure | Modules by domain (vertical slice) with automatic registration. |
| D3 | Delivery | Blueprint first for review; refactor afterwards. |

---

## 2. Current state: evidence

### 2.1 Baseline metrics (measured today)

| Metric | Value |
|---|---|
| Tests | **297 pass** (`pytest packages/`) |
| Lint | `ruff check packages/` → *All checks passed* |
| Types | `mypy packages/` → *Success: no issues found in 55 source files* |
| Python LOC (without tests) | ~5,650 |
| Python LOC (tests) | ~7,500 |
| Files in `routers/` | 9 (+ `jira_integrations/` subpackage) |
| Routers mounted by hand in `main.py` | 9 |

**The green baseline is the safety net for the whole plan.** No phase is considered finished if those three commands stop being green.

### 2.2 Current structure

```
packages/
├── planny-core/src/planny_core/      # config, database, errors, enums, auth, models/
├── planny-api/src/planny_api/
│   ├── main.py                       # factory + manual wiring of 9 routers
│   ├── dependencies.py               # get_db, get_current_user, clients lru_cache
│   ├── serializers.py                # camelCase of the client contract
│   ├── middleware/                   # request_id, request_logger, error_handler, rate_limiter
│   ├── routers/                      # auth, comments, health, issues, projects,
│   │   └── jira_integrations/        # quick_actions, users + jira/{issues,worklogs}
│   ├── schemas/                      # issue, project, comment, quick_actions
│   └── services/                     # issue_service, jira_sync_service, outlook_clean, tempo_service
└── planny-jira/src/planny_jira/      # client, config, worklog_service, repositories/
```

### 2.3 Concrete findings blocking growth

#### H1 — The app factory hardcodes the application's universe

`planny_api/main.py` (pre-refactor revision; the file is now 20 lines) enumerated the 9 routers and their dependencies:

```python
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(projects.router, dependencies=[Depends(get_current_user)])
app.include_router(jira_worklogs_router.router,
                   dependencies=[Depends(get_current_user), Depends(require_jira_config)])
```

Adding a domain = editing the factory. Merging a project = editing the factory + resolving collisions by hand. There is no notion of a “module” or of discovery.

#### H2 — ~430 lines of seed data inside a router

`routers/auth.py` has 495 lines: **~430 are data** (`_seed_users`, `_seed_issues` with HTML descriptions of up to 40 lines each, `_seed_comments`, `_create_guest_account`). The router should have ~30 lines. This is the most extreme case of hardcoding in the repo.

#### H3 — Split configuration, read in two ways

- `planny_core/config.py` → `pydantic-settings` (`Settings`).
- `planny_jira/config.py` → **15 `os.environ` reads** + a YAML file with `${VAR}` interpolation that also reads `os.environ`.
- `modules/jira/sync/service.py:213` → `os.environ.get("EXTERNAL_JIRA_EMAIL")` inside a domain mapping function (it makes the function impure and untestable).

On top of that, `JIRA_INSTANCES_CONFIG_PATH` points to a YAML file that **does not exist in the repo** (`fd -e yaml` only finds `docker-compose.yml`), so in practice the env-var fallback is always used: there is a complete code path with no real coverage.

#### H4 — The database URL is built three times

The URL used to be composed in three places: the async-engine and sync-engine builders in `planny_core/database.py` and the inline logic in `alembic/env.py` (both recounted below from their pre-refactor revisions, which no longer contain that code). **Status: FIXED** — `database_url()` in `planny_core/db/engine.py:30` is now the only implementation; both engines and `alembic/env.py:43` call it. The duplicated session dependency is still open: `get_db()` exists in `planny_core/database.py:47` **and** in `planny_api/dependencies.py:22`, with the same body.

#### H5 — Business logic and authorization inside the routers

The same authorization query appears 4 times:

| File | Lines |
|---|---|
| `routers/issues.py` | 86-92 |
| `routers/issues.py` | 136-142 |
| `routers/issues.py` | 163-169 |
| `routers/comments.py` | 58-64 |

```python
project_ids_result = await db.execute(
    select(user_projects.c.projectId).where(user_projects.c.userId == current_user.id)
)
```

The routers do SQL, orchestrate authorization, and serialize. There is no repository layer for the local domain.

#### H6 — Scattered serialization

`serializers.py` has `issue_partial` / `project_to_dict` / `user_to_dict`, but `comment_to_dict` lives in `modules/comments/serializers.py:11` and the issue detail shape in `modules/issues/serializers.py:14`. The JSON contract with the client (the most expensive thing to break) is not in a single place.

#### H7 — Magic values and duplicated constants

| Value | Location |
|---|---|
| `"VIS-2"` | `planny_core/config.py:46` **and** `planny_api/dependencies.py:99` (duplicated, silent fallback) |
| Jira fields list (10 fields) | `modules/jira/sync/service.py:26-37` **and** `modules/jira/issues/router.py:35-46` |
| `timedelta(hours=24)` | **FIXED** — `settings.sync_stale_after_hours`, read at `modules/jira/sync/service.py:49` |
| JQL `"assignee=currentUser() AND status!=Closed"` | **FIXED** — `settings.sync_jql` |
| Mapping by **name** to IDs `1/2/3` | `modules/jira/sync/service.py:105-112` |
| `"maxResults": 100` | **FIXED** — `settings.sync_page_size` |
| `60_000` / `10` (rate limit) | `middleware/rate_limiter.py:58-59` **and** `modules/quick_actions/router.py:44-45` |
| `pool_size=20, max_overflow=10, pool_recycle=3600` | `planny_core/db/engine.py:59-62` |
| Default gravatar URL | **FIXED** — `settings.integration_default_avatar_url` |
| `"software"` (category) | **FIXED for sync** — `settings.sync_default_project_category`; the guest seed still carries it as data |
| `docs_url="/docs" if env != "production"` | `planny_api/main.py` (pre-refactor; now `planny_api/app/factory.py:72`) |

#### H8 — No lifespan or lifecycle management

`planny_api/dependencies.py:83-109` caches `JiraHttpClient` with `lru_cache`. Each client wraps an `httpx.AsyncClient` with its own connection pool, and it is **never closed**. There is no `lifespan` in the factory. The services are also instantiated as module-level singletons (`modules/quick_actions/router.py:39-40`).

#### H9 — Inconsistent error contract

The client **documents the problem in a comment** (`client/src/shared/utils/api.js:41-43`):

```js
// The API answers with two different shapes for the same problem:
//   no token at all -> {"detail":"Not authenticated"}
//   bad/expired     -> {"error":{"code":"INVALID_TOKEN"}}
```

Confirmed by the tests: `test_users.py:156` asserts `"detail" in body`. On top of that, the rate limiter used to raise `HTTPException(detail={"error": ...})`, which FastAPI wraps as `{"detail": {"error": ...}}` — that is not the `{"error": ..., "requestId": ...}` envelope either. There were three different shapes for the same error concept. **Status: FIXED.** `RateLimitExceededError` (`planny_core/errors/base.py:139`) and `ConflictError` now go through the standard envelope and `AppError.headers` carries the rate-limit headers.

#### H10 — Tests without a shared `conftest.py`

There is no `packages/planny-api/tests/conftest.py`. The `app`, `db_engine`, and `client` fixtures are **reimplemented in every file** (~9 copies of ~50 lines). Every new test pays that cost.

#### H11 — No versioning and no API evolution policy

Loose legacy routes (`/project`, `/issues`, `/currentUser`) coexisting with `/api/v1/jira/*`. Without a canonical prefix there is no way to introduce a breaking change without breaking the client. The probe routes (`/health`) are consumed by `docker-compose.yml` and 4 scripts in `deploy/scripts/` — which means we cannot version everything blindly either.

#### H12 — Turning off documentation in production is incomplete (ACTIVE BUG)

`planny_api/main.py` (pre-refactor revision) turned off ONLY `docs_url`:

```python
app = FastAPI(
    title="Planny API",
    version="1.0.0",
    docs_url="/docs" if settings.env != "production" else None,   # <- only this one
)
```

`redoc_url` and `openapi_url` are not touched, so they keep their defaults (`/redoc` and `/openapi.json`).

**Verified empirically today**, with the repo's real configuration (`.env` is a symlink to `.env.production`, so `settings.env == 'production'`):

```
settings.env    : 'production'
app.docs_url    : None          <- off, as intended
app.redoc_url   : /redoc        <- OPEN
app.openapi_url : /openapi.json <- OPEN
```

That is: in the current production environment, `/docs` returns 404 but **`/redoc` still serves the full UI and `/openapi.json` still exposes the 25 routes**. The shutdown does not fulfill its purpose.

Impact: exposure of the complete API map (routes, parameters, schemas) in production. No test or consumer depends on these endpoints (verified: `rg "openapi|/docs|/redoc"` in the tests and in the repo returns nothing), so fixing it is zero risk.

Destination: `settings.api.{docs_url,redoc_url,openapi_url}` with all three gated by the same flag, and a test that verifies that with `env=production` all three are `None` and with `development` all three respond 200. **Fixed in Phase 6.**

#### H13 — Configuration depends on the working directory and fails silently

`planny_core/config.py:97-101` declares `env_file=".env"` — a **relative path**. `BaseSettings` resolves it against the process CWD, not against the repo root.

**Verified empirically**, same code and same `.env`, changing only the directory it runs from:

| Field | From the repo root | From another directory |
|---|---|---|
| `env` | `production` | `development` |
| `db_type` | `sqlite` | `postgres` |
| `jwt_secret` | the production one | **the public default `jira-clone-dev-secret`** |
| External Jira | configured | **not configured** |

There is no exception and no warning: **the app starts anyway, with defaults**, and the symptom the user sees is “Jira does not work” or “it asks me to re-authenticate”, not “configuration is missing”.

**Severity — calibrated, not alarmist.** I reviewed the four real startup paths and **today none of them triggers it**:

| Path | Safe? | Why |
|---|---|---|
| `npm run start:python` | ✅ | npm runs with CWD = repo root |
| `deploy/scripts/run.sh:80,83` | ✅ | it does `cd "$PROJECT_ROOT"` before uvicorn |
| `scripts/dev.sh:39-40` | ✅ | it does `cd "$ROOT"` |
| Docker (`Dockerfile.python`) | ✅ | compose passes **real environment variables**, not `.env` |

Therefore **H13 is latent, not an active incident**: it is one `cd` away from a systemd unit, a supervisor, a `uvicorn` invoked with an absolute path, or simply someone running `pytest` from another directory. And the blast radius if it does trigger is high: **public JWT secret ⇒ anyone can forge valid tokens**, and `env` falls back to `development` ⇒ `/docs` is re-enabled.

**Additional footgun confirmed:** `Dockerfile.python` **does not copy `.env`** into the container (it copies only `pyproject.toml`, `uv.lock`, `packages/`, `alembic/`, `alembic.ini`). Anyone who follows `.env.example` and configures everything there for Docker **will have no effect at all** and will start with defaults, also silently.

**Why it matters for this blueprint:** Phase 1 introduces nested configuration, and the “natural” pattern (`env_file` only on `Settings` + groups created with `default_factory`) **reproduces exactly this failure in a guaranteed way** — not only when the CWD changes. I verified it: nested groups do not inherit the `env_file` and return the defaults. §4.5 is already corrected with the pattern that does work.

Destination: `paths.env_file()` that resolves the repo root **absolutely** (via `__file__`, not via CWD), the `SettingsGroup` pattern from §4.5, a test that runs the process from another CWD and asserts that the config does not change, and startup with **fail-fast** if `env == production` and `jwt_secret` is the default. **Fixed in Phase 1** (it is the foundation of everything else).

**Status: FIXED.** `planny_core/paths.py` resolves the project root absolutely (skipping workspace sub-packages that also contain a `pyproject.toml`), `Settings.validate_for_startup()` aborts in production with the development secret, and `create_app()` calls it. Verified: running from another directory now yields identical configuration. Regression tests: `packages/planny-core/tests/test_config_paths.py` and `packages/planny-api/tests/test_app_startup.py`.

#### H14 — Local runtime data was not covered by the committed `.gitignore`

`data/` (SQLite database) was ignored **only** by `.git/info/exclude`, which belongs to a single working copy and is never committed. The committed `.gitignore` still carried the Node-era path `api/data` instead. Verified:

```
$ git check-ignore -v data/jira.sqlite
.git/info/exclude:10:data/jira.sqlite   <- local file, not committed
```

Consequences: on any other clone or a fresh CI checkout, `data/` is **not** ignored, so the database can be staged and committed by accident. Nothing is tracked today (verified: `git ls-files data/` is empty), so no leak has occurred — but the safety net does not travel with the repository.

This matters for this blueprint specifically: §3.3 of the [runtime configuration blueprint](./2026-10-05-runtime-configuration-blueprint.md) proposes writing a bootstrap cache file that may contain database credentials into `data/`.

**Status: FIXED.** `data/` added to the committed `.gitignore` with an explanatory comment.

#### H17 — Issue search and issue detail use different scopes

Found while consolidating authorization into `ProjectScope`, and preserved rather than
silently "fixed".

`GET /issues` (the board search) resolves the caller's **default** project only:

```python
issues = await issue_service.search_by_project(db, project_id=current_user.projectId, ...)
```

whereas `GET /issues/{id}`, `PUT` and `DELETE` accept **any** project the caller belongs to.
A user who belongs to several projects therefore searches one project but can open an issue
from any of them.

This is a real inconsistency, not a bug I am introducing: it predates the refactor and is now
documented in `modules/issues/service.py:search_issues` instead of being invisible. Changing
it would change what the board search returns, which is a product decision, so the refactor
keeps the behaviour and surfaces the question.

#### H15 — Alembic is documented but not declared as a dependency

`README.md:93` documents `uv run alembic upgrade head` and `AGENTS.md` states that Alembic
handles schema migrations, but **`alembic` is not declared in any `pyproject.toml`** (root or
per-package), is not pinned in `uv.lock`, and is not installed in the working virtualenv.
Verified:

```
$ ls .venv/lib/python3.12/site-packages/ | grep -i '^alembic'
(nothing)
$ rg -i alembic pyproject.toml packages/*/pyproject.toml
(nothing)
```

The repository does contain `alembic/` with two migration revisions and an `alembic.ini`, so
the tooling is clearly intended to be used — it just cannot be run in a clean environment.

A misleading detail worth recording: from the repository root, `import alembic` **succeeds**,
because Python treats the local `alembic/` directory as a namespace package. That is not the
Alembic library, and it has no `__version__`. It makes the missing dependency look present.

**Not fixed here, deliberately.** The fix is to add `alembic` to the dev dependency group, but
that requires regenerating `uv.lock`. `Dockerfile.python` runs `uv sync --frozen`, which fails
when `pyproject.toml` and `uv.lock` disagree — so editing the manifest without regenerating the
lock would break the Docker build. `uv` could not run in this environment (its cache lives
outside the workspace and writes are sandboxed). Adding it is therefore a one-command task for
an environment where `uv` works:

```
uv add --dev alembic
```

**Consequence for this blueprint:** `alembic/env.py` was updated to use the single URL builder
from `planny_core.db` (removing the duplicated logic, finding H4), and the change was verified
by asserting that `database_url(settings, async_driver=False)` produces byte-identical output to
the previous inline code across five configurations. The file's import path could not be
exercised at runtime because the Alembic library is absent.

#### H16 — The two configuration paths were disconnected, and the Jira gate validated nothing

This is the most consequential finding so far, and it is the concrete reason the
configuration work is not cosmetic.

**H16a — disconnected sources.** `pydantic-settings` parsed `.env` into
``planny_core.config.settings``. `planny_jira/config.py` read ``os.environ`` directly.
Nothing loaded `.env` into ``os.environ``, so the two disagreed whenever the shell had not
exported the file. Measured, with the repository's real `.env`, Jira variables not exported:

| Probe | Result |
|---|---|
| `settings.external_atlassian_base_url` | `https://vistage.atlassian.net` |
| `settings.internal_atlassian_base_url` | `https://santex.atlassian.net` |
| `get_jira_instance_config("external").base_url` | **`''`** |
| `get_jira_instance_config("external").email` | **`None`** |
| `get_jira_instance_config("external").api_token` | **`None`** |

``scripts/dev.sh:6-12`` already worked around this by exporting ``.env`` into the process
environment, and its comment states the reason: *"Export .env so Jira config (which reads
os.environ directly) picks up the values."* ``deploy/scripts/run.sh`` does **not** do this, so
the deployed process ran with an empty Jira configuration.

**H16b — the gate did not gate.** ``require_jira_config()`` only asserted that the instance
*name* resolved in the dictionary. Because the environment fallback always creates both
``internal`` and ``external`` keys, the gate **passed with empty base URLs**:

```
internal  base_url='' email=None token=None
external  base_url='' email=None token=None
require_jira_config() -> PASSES
```

The real failure then appeared at request time as
``httpx.UnsupportedProtocol: Request URL is missing an 'http://' or 'https://' protocol`` —
an error far from its cause. Meanwhile ``health._check_jira_integrations()`` reads
``settings.*`` (the other path) and reported ``status: ok``, so the health endpoint and the
route gate gave **contradictory answers about the same integration**.

**Status: FIXED.** The loader now takes the environment as an explicit mapping and never
reads ``os.environ``. ``Settings.jira_env()`` is the single bridge: it merges the process
environment with the values parsed from ``.env`` (process environment wins), so both paths
agree. Verified: the same probe now returns the real base URLs, emails and tokens, with
nothing exported to the shell. ``require_jira_config()`` now also rejects instances without a
base URL or without credentials. Regression tests:
``packages/planny-api/tests/test_jira_gate.py`` and the rewritten, now-hermetic
``packages/planny-jira/tests/test_config.py``.

A secondary benefit worth recording: because the loader no longer caches results in a
process-global (the cache was only valid while the environment could not change), its tests
stopped mutating global process state via ``monkeypatch.setenv`` and now pass explicit
dictionaries.

---

## 3. Guiding principles

These are the rules the implementation may violate *only with explicit justification*. They go into `AGENTS.md` at the end.

| # | Principle | How it is verified |
|---|---|---|
| P1 | **One domain = one folder.** Router, schemas, service, repository, and policies of the same domain live together. | Structural review + architecture test |
| P2 | **The kernel does not know FastAPI.** `planny-core` does not import `fastapi` or `starlette`. | Architecture test over imports |
| P3 | **Routers are thin.** They validate input, call the service, serialize. Zero SQL, zero business rules. | Architecture test: `routers/` does not import `sqlalchemy` |
| P4 | **Everything configurable is configuration.** Zero business literals in the code; zero `os.environ` outside the config layer. | `rg "os\.environ" packages --glob '!**/config/**'` empty |
| P5 | **The factory does not enumerate domains.** Modules are discovered. | `main.py` ≤ 40 lines; test that mounts a test module without editing the factory |
| P6 | **A single source of truth for the JSON contract.** The camelCase serializers live in a single place, with contract tests that pin the keys. | Contract test |
| P7 | **Compatibility first.** No phase breaks the client or the existing suite. | 297 green tests + client smoke |
| P8 | **Nothing is mounted twice with different logic.** The legacy alias is the *same* router mounted under another prefix. | Test that walks both prefixes and compares responses |

---

## 4. Target architecture

### 4.1 Package view

```
packages/
├── planny-core/                          # KERNEL — no FastAPI, no business httpx
│   └── src/planny_core/
│       ├── config/
│       │   ├── __init__.py               # settings, get_settings()
│       │   ├── settings.py               # Settings (composes the groups)
│       │   ├── groups.py                 # Server, Api, Database, Jwt, Cors,
│       │   │                             # Jira, Sync, QuickActions, Modules, RateLimit
│       │   ├── legacy_env.py             # puente nombres planos legacy -> anidado
│       │   └── paths.py                  # repo root, data dir, .env discovery
│       ├── db/
│       │   ├── __init__.py
│       │   ├── base.py                   # Base declarativa + naming_convention
│       │   ├── engine.py                 # _create_async_engine(settings) — NO module-level globals
│       │   └── session.py                # class Database (engine + sessionmaker) — ver §4.6
│       ├── errors/
│       │   ├── __init__.py
│       │   ├── codes.py                  # ErrorCode(StrEnum) — single source of error codes
│       │   └── base.py                   # AppError + subclases
│       ├── security/tokens.py            # create_token / verify_token
│       ├── models/                       # modelos SQLAlchemy compartidos (kernel)
│       ├── logging.py                    # configure_structlog() + redacción
│       └── text.py                       # HTML / ADF -> plain text cleanup
│
├── planny-api/                           # HTTP
│   └── src/planny_api/
│       ├── main.py                       # ~20 lines: app = create_app()
│       ├── app/
│       │   ├── factory.py                # create_app()
│       │   ├── lifespan.py               # AppContext: crea y CIERRA clientes
│       │   ├── handlers.py               # exception handlers
│       │   └── openapi.py                # metadata, tags, docs gating
│       ├── kernel/                       # composition plumbing
│       │   ├── module.py                 # ApiModule (contract)
│       │   ├── registry.py               # descubrimiento + validación + toposort
│       │   ├── mounting.py               # montaje /api/v1 + alias legacy
│       │   ├── capabilities.py           # nombre -> dependencia (p.ej. "jira")
│       │   └── validation.py             # colisiones, depends_on, imports prohibidos
│       ├── core/                         # shared by modules
│       │   ├── context.py                # AppContext en app.state
│       │   ├── deps.py                   # get_current_user, get_session, get_context
│       │   ├── security/policies.py      # autorización reutilizable
│       │   ├── serialization/            # * client JSON contract (camelCase)
│       │   │   ├── __init__.py           # re-exports everything
│       │   │   ├── users.py  projects.py  issues.py  comments.py
│       │   └── pagination.py
│       ├── middleware/                   # request_id, request_logger, error_handler, rate_limit
│       └── modules/                      # ★ VERTICAL SLICES
│           ├── health/
│           ├── auth/
│           ├── users/
│           ├── projects/
│           ├── issues/
│           ├── comments/
│           ├── quick_actions/
│           └── jira/
│               ├── __init__.py           # MODULES = [issues_module, worklogs_module]
│               ├── issues/  worklogs/
│               ├── sync/                 # jira_sync_service + mappings
│               └── deps.py
│
└── planny-jira/                          # Jira ADAPTER (HTTP client + worklog)
    └── src/planny_jira/
        ├── client.py
        ├── constants.py                  # * fields, REST paths, limits — no duplication
        ├── config.py                     # stops reading os.environ
        ├── mappings/
        │   └── jira_mappings.yaml        # status / priority / type + overrides
        ├── worklog_service.py
        └── repositories/
```

### 4.2 Anatomy of a module

Every domain module has the same shape. This is what makes “adding a feature” mechanical.

```
modules/issues/
├── __init__.py        # MODULE = ApiModule(...)   <- single entry point
├── router.py          # HTTP: validate, delegate, serialize. NO SQL, NO rules
├── schemas.py         # pydantic: request / response
├── service.py         # business rules, orchestration
├── repository.py      # SQLAlchemy queries (only place with SQL for this domain)
├── policies.py        # domain-specific authorization rules
└── constants.py       # domain-owned enums/maps
```

#### Example: `modules/issues/__init__.py`

```python
"""Issues module — CRUD for local and synced issues."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.modules.issues.router import router

MODULE = ApiModule(
    name="issues",
    router=router,              # APIRouter(prefix="/issues")
    tags=("issues",),
    auth=True,
    capabilities=(),
    legacy_alias=True,          # -> /api/v1/issues  +  /issues
    depends_on=("users", "projects"),
)
```

#### Example: `modules/issues/router.py`

```python
router = APIRouter(prefix="/issues")


@router.get("")
async def list_issues(
    scope: ProjectScope = Depends(get_project_scope),      # <- policies, no SQL here
    service: IssueService = Depends(get_issue_service),
    search_term: str | None = Query(default=None, alias="searchTerm"),
) -> IssueListResponse:
    issues = await service.search(scope, search_term=search_term)
    return IssueListResponse(issues=[issue_partial(i) for i in issues])


@router.post("")
async def create_issue(
    body: CreateIssueRequest,
    scope: ProjectScope = Depends(get_project_scope),
    service: IssueService = Depends(get_issue_service),
) -> IssueResponse:
    issue = await service.create(scope, data=body)
    return IssueResponse(issue=issue_partial(issue))
```

### 4.3 The module contract and automatic registration

The heart of “ready to grow”. A module **declares what it exposes and what it needs**; the kernel decides where and how to mount it.

```python
# planny_api/kernel/module.py
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from fastapi import APIRouter

from planny_core.config import Settings


@dataclass(frozen=True, slots=True)
class ApiModule:
    """API composition unit.

    The module does not know under which prefix it is mounted, nor whether it is versioned.
    The kernel decides that from this declaration.
    """

    name: str
    """Globally unique identifier (startup fails if it is repeated)."""

    router: APIRouter
    """Router with RELATIVE paths (its own internal prefix yes, /api/v1 no)."""

    version: str = "1"
    tags: tuple[str, ...] = ()
    auth: bool = True
    """Injects get_current_user as a router dependency."""

    capabilities: tuple[str, ...] = ()
    """Capacidades requeridas, resueltas contra kernel/capabilities.py (p.ej. "jira")."""

    versioned: bool = True
    """False => mounted unversioned only (infrastructure probes)."""

    legacy_alias: bool = True
    """Also mounts the legacy prefix, outside the OpenAPI schema."""

    depends_on: tuple[str, ...] = ()
    """Other modules that must be mounted first."""

    enabled: Callable[[Settings], bool] | None = None
    """Allows disabling the module through configuration."""
```

#### Discovery

```python
# planny_api/kernel/registry.py
MODULE_ENTRYPOINT_GROUP = "planny.modules"


def discover_modules(settings: Settings) -> list[ApiModule]:
    """Descubre módulos: built-in + paquetes en config + entry points instalados."""
    declared: dict[str, ApiModule] = {}

    for package in settings.modules.packages:          # built-in + extras declarados
        _collect(importlib.import_module(package), declared, source=package)

    for entry_point in importlib.metadata.entry_points(group=MODULE_ENTRYPOINT_GROUP):
        _collect(entry_point.load(), declared, source=f"entrypoint:{entry_point.name}")

    validate(declared)      # unique names, existing depends_on, no path collisions
    return toposort(declared)
```

**This is what enables merging other projects.** A merged project publishes a package that exposes `MODULES: list[ApiModule]`, and declares in its `pyproject.toml`:

```toml
[project.entry-points."planny.modules"]
notes = "planny_notes.modules"
```

Once installed, its domains **show up by themselves** in the API, versioned, authenticated, and documented. Zero edits in `planny-api`.

As an alternative to entry points (useful in dev before installing the package), `settings.modules.packages` accepts an explicit list:

```
MODULES__PACKAGES=["planny_api.modules", "planny_notes.modules"]
```

#### Startup validation (fail fast)

`kernel/validation.py` runs before mounting and **aborts startup** with an actionable message if:

- two modules declare the same `name`;
- a `depends_on` does not exist;
- two final routes collide (`(prefix, path, method)`);
- a module declares a capability that is not in `CAPABILITIES`;
- a package declares modules but does not expose `MODULE`/`MODULES`.

We prefer a broken startup with a clear message over a silently incomplete API.

#### Capabilities

Replaces the hardcoded `dependencies=[Depends(require_jira_config)]` that used to live at `planny_api/main.py` (pre-refactor revision). Modules now declare `capabilities=("jira",)` in their own `__init__.py`:

```python
# planny_api/kernel/capabilities.py
CAPABILITIES: Mapping[str, Callable[[Request], Awaitable[None]]] = {
    "jira": require_jira_config,
}
```

The `jira` module declares `capabilities=("jira",)` and the kernel resolves the dependency. Adding a new capability does not touch the existing modules.

### 4.4 Mounting: canonical `/api/v1` + automatic legacy alias

```python
# planny_api/kernel/mounting.py
def mount_modules(app: FastAPI, modules: Sequence[ApiModule], settings: Settings) -> None:
    for module in modules:
        if module.enabled is not None and not module.enabled(settings):
            continue

        dependencies = resolve_dependencies(module)     # auth + capabilities
        tags = list(module.tags) or [module.name]

        # 1. Canónico y documentado
        if module.versioned:
            app.include_router(
                module.router,
                prefix=f"{settings.api.prefix}/v{module.version}",   # /api/v1
                tags=tags,
                dependencies=dependencies,
            )

        # 2. Legacy alias: THE SAME router, unversioned, outside OpenAPI
        if module.legacy_alias:
            app.include_router(
                module.router,
                prefix="",
                dependencies=dependencies,
                include_in_schema=False,
            )
```

**Verified empirically in this environment** (FastAPI `0.139.0`), this is not theory. The same `APIRouter` was mounted twice and it was confirmed:

```
legacy : GET /issues        -> 200 {'issues': [], 'auth': 'authed'}
v1     : GET /api/v1/issues -> 200 {'issues': [], 'auth': 'authed'}
openapi paths: ['/api/v1/issues']
duplicate op ids? False
```

That is: the same handler under both prefixes, dependencies applied to both, and `/docs` showing **only** the versioned route with no duplicate operation ID warnings.

Consequences:

| Aspect | Result |
|---|---|
| OpenAPI (`/docs`) | Shows only `/api/v1/*`. Clean. |
| Current client | Keeps hitting `/project`, `/issues`, `/currentUser`. **Zero changes.** |
| Future migration | The client migrates route by route to `/api/v1/*`; when it finishes, it is turned off with `API__LEGACY_ALIASES=false`. |
| Infra probes | `health` declares `versioned=False, legacy_alias=True` → it stays **only** at `/health`, which is what `docker-compose.yml` and `deploy/scripts/{run,status,restart}.sh` consume. |
| Jira modules | They already live at `/api/v1/jira/*` → they declare `legacy_alias=False` (the alias would be identical to the canonical one). |

#### Application routes (not domain routes)

`GET /` (redirect to the client) stays in `app/factory.py` as an explicit root route: it is not a domain.

#### ⚠️ Verified pitfalls when mounting the existing routers

I tested the mounting with the **repo's real routers** (not a toy router) and two problems appeared that must be solved **in Phase 3**, domain by domain. Neither is theoretical: I reproduced them.

**Pitfall 1 — The Jira routers have `/api/v1` baked into their own `prefix`.**

```python
# routers/jira_integrations/issues.py:18
router = APIRouter(prefix="/api/v1/jira/issues", tags=["jira-issues"])
```

Mounting them with `prefix="/api/v1"` produces a **double prefix**:

```
/api/v1/api/v1/jira/issues              <- the 8 Jira routes broken
/api/v1/api/v1/jira/worklogs
...
```

That is: if Phase 2 is done by wrapping the routers *without touching them*, **the entire "My Jira Issues" feature breaks**.

> **And it cannot be fixed by re-parenting the routes.** I tried it: moving the `APIRoute` objects into a new `APIRouter` with the correct prefix **changes nothing**, because the prefix is materialized in `route.path` at decoration time. You have to **edit `prefix=` in the source code** (`prefix="/jira/issues"`) and let the kernel add `/api/v1`.

Verified recipe (21 v1 routes, **zero double prefixes**):

```python
jira_issues_router = APIRouter(prefix="/jira/issues", tags=["jira-issues"])
jira_issues_router.add_api_route("", search_issues, methods=["GET"])
jira_issues_router.add_api_route("/{issue_key}", get_issue_by_key, methods=["GET"])
...
# the kernel mounts with prefix="/api/v1" -> /api/v1/jira/issues  ok
```

**Pitfall 2 — `GET /` lives inside the `auth` router.**

`routers/auth.py` (pre-refactor revision) defined `root_redirect` with `@router.get("/")`; it now lives at `planny_api/app/handlers.py:61`. If `auth` is wrapped as a versioned module, the root redirect ends up at **`/api/v1/`** instead of `/`:

```
/api/v1/      <- the redirect got versioned (wrong)
```

It must be **extracted** into `app/factory.py` as an application route before migrating `auth`.

**Confirmed as correct:**

| Behavior | Measured result |
|---|---|
| `/health`, `/health/live`, `/health/ready` with `versioned=False` | 200 at `/health`, **404 at `/api/v1/health`** — only unversioned, as designed |
| Routes with auth mounted under both prefixes | `/issues` → 401 and `/api/v1/issues` → 401 (routing OK, never 404) |
| Legacy alias outside OpenAPI | `/health` does **not** appear in the schema; the schema only has `/api/v1/*` |
| Root route | `GET /` → 302; `GET /api/v1/` → 404 |

**Conclusion for the plan:** Phase 2 must wrap the routers **without moving them** and with the correct `legacy_alias`, but the `jira` and `auth` modules **cannot be migrated naively in Phase 3**. The legacy ↔ v1 parity test (§8.4) is what detects both pitfalls automatically — an additional reason for it to be the central gate.

### 4.5 Centralized configuration

**Rule P4: `os.environ` exists only inside `planny_core/config/`.**

> **Extended by a separate document.** The user requested a second configuration path: runtime
> settings stored in the database and editable from the UI in their own tab, with `.env` used
> only as a fallback and explicitly not promoted. That architecture — including the bootstrap
> paradox it creates, secret encryption, and its authorization prerequisite — is specified in
> the [runtime configuration blueprint](./2026-10-05-runtime-configuration-blueprint.md).
> This section describes the **environment layer** that the runtime layer sits on top of; it is
> not replaced by it.

> ⚠️ **This block was corrected after validating it against `pydantic-settings` 2.14.2.** The first
> version of the blueprint used `env_file` only on `Settings` and groups created with
> `default_factory`. **That does not work and fails silently:** nested groups do not inherit the
> `env_file`, so the whole `.env` is ignored and the app starts with the defaults. See H13.
> The pattern below is the **empirically verified** one.

#### The correct pattern: each group reads the `.env` itself

```python
# planny_core/config/groups.py
_ENV_FILE = paths.env_file()          # ruta ABSOLUTA (ver H13)


class SettingsGroup(BaseSettings):
    """Base for ALL configuration groups.

    Key point: each group declares ``env_file`` in its own ``model_config``.
    If only ``Settings`` declared it, nested groups would NOT read it and
    the whole ``.env`` would be silently lost.
    """

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


class DatabaseSettings(SettingsGroup):
    # The FIRST alias wins: the new convention overrides the legacy one when both are set.
    type: str = Field("postgres", validation_alias=AliasChoices("PLANNY_DB__TYPE", "DB_TYPE"))
    host: str = Field("localhost", validation_alias=AliasChoices("PLANNY_DB__HOST", "DB_HOST"))
    port: int = Field(5432, validation_alias=AliasChoices("PLANNY_DB__PORT", "DB_PORT"))
    ...
```

```python
# planny_core/config/settings.py
class Settings(BaseSettings):
    """Single source of truth for configuration.

    New convention: PLANNY_<SECTION>__<FIELD>  (precedence)
    Nombres planos legacy (DB_HOST, PORT, NODE_ENV, ...): siguen funcionando
    as a fallback, covered by contract tests.
    """

    server: ServerSettings = Field(default_factory=ServerSettings)
    api: ApiSettings = Field(default_factory=ApiSettings)
    db: DatabaseSettings = Field(default_factory=DatabaseSettings)
    jwt: JwtSettings = Field(default_factory=JwtSettings)
    cors: CorsSettings = Field(default_factory=CorsSettings)
    jira: JiraSettings = Field(default_factory=JiraSettings)
    sync: SyncSettings = Field(default_factory=SyncSettings)
    quick_actions: QuickActionsSettings = Field(default_factory=QuickActionsSettings)
    rate_limit: RateLimitSettings = Field(default_factory=RateLimitSettings)
    modules: ModulesSettings = Field(default_factory=ModulesSettings)

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,           # also at the top level, for consistency
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )
```

#### What was verified (this is not theory)

| Check | Result |
|---|---|
| `DB_HOST` → `settings.db.host` | ✅ |
| `PORT`, `NODE_ENV`, `CLIENT_URL`, `DB_TYPE`, `DB_PATH` → nested groups | ✅ |
| `RATE_LIMIT_MAX_REQUESTS` → `settings.rate_limit.max_requests` | ✅ |
| `PLANNY_DB__HOST` (new convention) | ✅ |
| Both defined → **`PLANNY_*` wins** (`AliasChoices` order) | ✅ |
| Group with `default_factory` and `env_file` only on `Settings` | ❌ **fails silently** → `localhost` |
| `SettingsGroup` with its own `env_file` | ✅ `desde-dotenv` |
| Absolute `env_file` running from another CWD | ✅ not lost |

#### Mapping coverage: the 31 variables in `.env.example`

I tested the complete scheme against **all** the documented variables, not a sample:

| Group | Variables | Result |
|---|---|---|
| `server` | `PORT`, `CLIENT_URL`, `NODE_ENV`, `PYTHON_BACKEND_URL` | ✅ |
| `jwt` | `JWT_SECRET`, `JWT_EXPIRES_IN` | ✅ |
| `db` | `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_PATH` | ✅ |
| `jira` (HTTP) | `HTTP_CONNECT_TIMEOUT_MS`, `HTTP_READ_TIMEOUT_MS` | ✅ |
| `quick_actions` | `OUTLOOK_CLEANER_URL`, `OUTLOOK_CLEANER_API_KEY`, `APP_DEFAULT_TIMEZONE`, `QUICK_ACTIONS_*` (3) | ✅ |
| **Total verified** | **20 variables mapped 1:1, 0 failures** | ✅ |

#### The only non-trivial point: Jira instances with a prefix

The remaining 10 variables are **not** mapped with `AliasChoices`, because their name depends on the instance:

```
INTERNAL_ATLASSIAN_BASE_URL   EXTERNAL_ATLASSIAN_BASE_URL
INTERNAL_JIRA_EMAIL           EXTERNAL_JIRA_EMAIL
INTERNAL_JIRA_API_TOKEN       EXTERNAL_JIRA_API_TOKEN
INTERNAL_JIRA_FIXED_ISSUE_KEY EXTERNAL_MY_ACCOUNT_ID
INTERNAL_JIRA_AUTH_TYPE       EXTERNAL_JIRA_AUTH_TYPE
```

They are resolved with an **instance selector**, which is also what makes it possible to add a third instance without touching code:

```python
# planny_core/config/groups.py
class JiraSettings(SettingsGroup):
    instance_prefixes: list[str] = Field(default_factory=lambda: ["INTERNAL", "EXTERNAL"])
    """Per-instance env prefixes. Adding "THIRD" yields a new instance."""

    worklog_internal_instance: str = Field(
        "internal", validation_alias=AliasChoices("PLANNY_JIRA__WORKLOG_INTERNAL_INSTANCE", "WORKLOG_INTERNAL_INSTANCE"))
    worklog_external_instance: str = Field(
        "external", validation_alias=AliasChoices("PLANNY_JIRA__WORKLOG_EXTERNAL_INSTANCE", "WORKLOG_EXTERNAL_INSTANCE"))
    config_path: str = Field(
        "", validation_alias=AliasChoices("PLANNY_JIRA__CONFIG_PATH", "JIRA_INSTANCES_CONFIG_PATH"))

    def instances(self) -> dict[str, JiraInstanceConfig]:
        """Build the instances from the declared prefixes.

        This is the ONLY function in the project allowed to read environment
        variables by prefix, and it lives inside the configuration layer (P4).
        """
        ...
```

This replaces the 15 `os.environ` reads in `planny_jira/config.py` and makes both the YAML path (currently dead, see H3) and the env-var path testable.

#### The database URL, in a single place

```python
class DatabaseSettings(BaseModel):
    type: Literal["postgres", "sqlite"] = "postgres"
    host: str = "localhost"
    port: int = 5432
    username: str = "postgres"
    password: str = ""
    database: str = "jira_clone"
    path: str = "data/jira.sqlite"
    pool_size: int = 20
    max_overflow: int = 10
    pool_recycle_seconds: int = 3600

    @property
    def url(self) -> str:
        """SQLAlchemy URL. The only implementation in the repo."""
        if self.type == "postgres":
            return f"postgresql+asyncpg://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}"
        return f"sqlite+aiosqlite:///{self.path.removeprefix('./')}"

    @property
    def sync_url(self) -> str:
        return self.url.replace("+asyncpg", "").replace("+aiosqlite", "")
```

Consumers: `db/engine.py` and `alembic/env.py` (which becomes a 10-line import).

#### Removing `os.environ` from `planny-jira`

`planny_jira/config.py` receives the configuration instead of reading it:

```python
def load_jira_instances(settings: JiraSettings) -> JiraInstances:
    """Resolve instances from YAML (if `settings.config_path` exists) or from settings."""
```

The YAML `${VAR}` interpolation is resolved against `settings.jira.raw_env` (an explicit and typed subset), not against `os.environ`. **Valuable side effect:** the YAML path, currently dead and uncovered, becomes testable (verified: `jira-instances.yaml` does not exist in the repo, so only the env fallback is used — there must be a test that pins both branches).

#### Removing `os.environ` from the domain mapping

`modules/jira/sync/service.py:213` now receives the email as a parameter:

```python
# before:  syncing_jira_email = os.environ.get("EXTERNAL_JIRA_EMAIL", "").lower().strip()
# after: the mapper receives a `SyncContext` with the data it needs
def map_jira_issue_to_local(jira_issue, *, context: SyncContext) -> dict[str, Any]:
```

This also turns `map_jira_issue_to_local` into a **truly pure function**, which is what its tests already assume.

### 4.6 Data layer and authorization

#### The engine stops being a module global

**Correction with respect to the initial version of the blueprint, found while prototyping.**

Before this refactor, the module-level globals in `planny_core/database.py` were created like this:

**Status: partially fixed.** The globals still exist but are now derived from a `Database`
instance (`planny_core/database.py:40-42`) and are documented as transitional. They cannot be
deleted until the `AppContext` from Phase 2 exists. The code below is the pre-refactor shape
that motivated the change:

```python
async_engine: AsyncEngine = create_async_engine()      # <- runs at IMPORT time
async_session_factory = async_sessionmaker(bind=async_engine, ...)
```

**Verified empirically:** once the module is imported, mutating `settings` does **not** rebind the engine:

```
async_engine.url (before) : sqlite+aiosqlite:///.../data/jira.sqlite
settings.db_type = "postgres"; settings.db_host = "otro-host"
async_engine.url (after) : sqlite+aiosqlite:///.../data/jira.sqlite   <- unchanged
```

Consequence: `create_app(settings)` **cannot** control the database, and a per-test
`settings` fixture gives a **false sense of isolation**. The initial version of this
blueprint promised exactly that in §8.1 — it was wrong.

**Corrected design:** the engine and the sessionmaker become an object built from
`DatabaseSettings` and held in the `AppContext` (§4.8):

```python
# planny_core/db/session.py
class Database:
    """Engine + session factory built from configuration.

    It is NOT instantiated at module level: it is built once in the lifespan
    and injected. That way `create_app(settings)` really controls the database.
    """

    def __init__(self, settings: DatabaseSettings) -> None:
        self._engine = _create_async_engine(settings)      # usa settings.url
        self.session_factory = async_sessionmaker(self._engine, expire_on_commit=False)

    async def dispose(self) -> None:
        await self._engine.dispose()


# planny_api/core/deps.py
async def get_session(ctx: AppContext = Depends(get_context)) -> AsyncGenerator[AsyncSession, None]:
    async with ctx.db.session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

This **does not break the current tests**: today they already override `get_db` with their own
in-memory sessionmaker. In the new design they override `get_session`, the same pattern.

`alembic/env.py` builds its sync engine from `settings.db.sync_url` on its own — it is an
offline tool and does not share the app's lifecycle.

#### Repositories

Each module has its `repository.py`. Routers **never** import SQLAlchemy (principle P3, verified by an architecture test).

The current dependency direction is preserved:

```
planny-api  ──>  planny-core     (modelos, config, errores, db)
planny-api  ──>  planny-jira     (adaptador HTTP Jira)
planny-jira ──>  planny-core     (modelos + db)
planny-core ──>  (nothing from the project)
```

`planny-jira` keeps its repositories (it is an adapter with its own persistence of submissions), but **stops reading `os.environ`**.

#### Reusable authorization policies

Replaces the 4 copies from H5:

```python
# planny_api/core/security/policies.py
@dataclass(frozen=True, slots=True)
class ProjectScope:
    """Scope of projects authorized for the current user."""
    user_id: int
    default_project_id: int | None
    project_ids: frozenset[int]

    def allows(self, project_id: int) -> bool:
        return project_id in self.project_ids

    def require(self, project_id: int) -> None:
        if not self.allows(project_id):
            raise EntityNotFoundError("Project")


async def get_project_scope(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ProjectScope:
    """Resolve the user scope. FastAPI caches the result per request."""
```

`get_project_scope` is now the single policy. **Status: FIXED.** There used to be two mechanisms for the same concept: the join against `user_projects` (four copies, in the issues and comments routers) and membership in the loaded relationship (`current_user not in project.users`, in the projects router). Unifying into `ProjectScope` removed the divergence and the class of bug that had already appeared once in `GET /project?ids=` (documented in `docs/custom/review/2026-07-11-python-code-review.md`). The policy lives at `planny_api/core/security/policies.py:52`.

### 4.7 Errors and response contract

#### Centralized codes

```python
# planny_core/errors/codes.py
class ErrorCode(StrEnum):
    ROUTE_NOT_FOUND = "ROUTE_NOT_FOUND"
    ENTITY_NOT_FOUND = "ENTITY_NOT_FOUND"
    BAD_USER_INPUT = "BAD_USER_INPUT"
    INVALID_TOKEN = "INVALID_TOKEN"
    FORBIDDEN = "FORBIDDEN"
    ISSUE_READONLY = "ISSUE_READONLY"
    INTEGRATION_UNAVAILABLE = "INTEGRATION_UNAVAILABLE"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    ALREADY_RUNNING = "ALREADY_RUNNING"
    CONFLICT = "CONFLICT"
    INTERNAL_ERROR = "INTERNAL_ERROR"
```

The subclasses reference `ErrorCode.X`; a test guarantees that no loose strings remain and that the codes used by the client still exist.

#### A single envelope

`{"error": {"message", "code", "status", "data"}, "requestId"}` **always**, including:

- 401 with no token (today `{"detail": "Not authenticated"}` — see H9),
- 429 from the rate limiter (today `{"detail": {"error": ...}}`),
- 409 from Outlook clean (today `HTTPException`).

**Test status (verified):** the 429 and the 409 only assert status code and headers, **not** the body → unifying the envelope does not break those tests. The 401 with no token is asserted in `test_users.py:156` and requires updating that test + simplifying the handling of two shapes in `client/src/shared/utils/api.js:40-57`. Doing it in **Phase 6b (optional)** is proposed, with explicit approval, because it touches the client.

### 4.8 DI, lifespan, and client lifecycle

```python
# planny_api/app/lifespan.py
@dataclass
class AppContext:
    """Long-lived application resources."""
    settings: Settings
    db: Database                                  # ★ engine + sessionmaker (ver §4.6)
    jira: JiraInstances | None = None
    jira_issue_client: JiraHttpClient | None = None
    worklog_service: WorklogService | None = None
    outlook: OutlookCleanService | None = None
    tempo: TempoService | None = None

    async def aclose(self) -> None:
        """Close HTTP pools and the DB engine. ALWAYS called on shutdown."""
        for client in (self.jira_issue_client, *self._inner_clients()):
            if client is not None:
                await client.close()
        await self.db.dispose()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    context = await build_context(app.state.settings)   # only builds what is configured
    app.state.ctx = context
    try:
        yield
    finally:
        await context.aclose()
```

> **Corrected with respect to the initial version of the blueprint.** The `AppContext` now includes the
> data layer. Before, `planny_core/database.py` created `async_engine` and
> `async_session_factory` as **module globals at import time**, which made it
> impossible for `create_app(settings)` to control the database. See §4.6.

```python
# planny_api/app/factory.py
def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    app = FastAPI(
        title=resolved.api.title,
        version=resolved.api.version,
        docs_url=resolved.api.docs_url,
        lifespan=lifespan,
    )
    register_middleware(app, resolved)
    register_error_handlers(app)
    register_root_route(app, resolved)
    mount_modules(app, discover_modules(resolved), resolved)
    return app
```

`lru_cache` disappears from `dependencies.py`. Clients are created **once and closed**. Module-level singletons (`modules/quick_actions/router.py:39-40`) move into the `AppContext`, which also makes them injectable and testable without a module `patch`.

Tests that today patch `planny_api.dependencies.get_jira_issue_client` are updated to inject a fake `AppContext` — cleaner and without monkeypatching import paths.

### 4.9 External integrations and mappings

The Jira type/status/priority maps (`modules/jira/sync/service.py:41-120`) are externalized:

```yaml
# planny_jira/mappings/jira_mappings.yaml
issues:
  type:
    bug: bug
    task: task
    story: story
    epic: story
  status:
    backlog: [backlog, todo, open, "to do"]
    selected: [selected, ready, approved]
    inprogress: [progress, doing, active, development, implementation, review, qa, testing, deploy]
    done: [done, complete, closed, resolved, finished, verified]
  priority:
    "5": [highest, blocker]
    "4": [high, critical]
    "3": [medium, normal]
    "2": [low, minor]
    "1": [lowest, trivial]
```

Advantages: a user can add statuses from their own Jira without touching code (`JIRA_MAPPINGS_PATH`), and the rules become testable as data. Resolution by **name** to IDs `1/2/3` (H7) is replaced by resolution by email/`accountId`, which is what the rest of the sync already does correctly with `get_or_create_user`.

### 4.10 Observability

- `planny_core/logging.py:18` centralizes `configure_structlog()` (it used to live in `planny_api/main.py`).
- `RequestLoggerMiddleware` redacts sensitive query params (`token`, `api_key`, `password`, `authorization`) and truncates long strings — today it logs the raw query string.
- `user_id` and `module` are added to the structlog context via a dependency, so logs can be filtered by domain.
- `health` stops having the hardcoded Jira check (moved to `modules/health/checks.py:36`) and instead exposes one check per **registered capability**.

---

## 5. Hardcoding inventory → destination

Complete conversion table. It is the checklist for Phase 1 and Phase 5.

| # | Location | Value / problem | Destination |
|---|---|---|---|
| 1 | `planny_api/main.py` (pre-refactor) | `"Planny API"`, `"1.0.0"`, docs gating | **FIXED** — `planny_api/app/factory.py:70-74`, from settings |
| 2 | `planny_api/main.py` (pre-refactor) | 9 routers + dependencies by hand | **FIXED** — each domain declares its own `MODULE`; `planny_api/catalog.py` was deleted once every domain moved under `planny_api/modules/` |
| 3 | `planny_api/main.py` (pre-refactor) | inline handlers | **FIXED** — `planny_api/app/handlers.py:42` |
| 4 | `planny_api/main.py` (pre-refactor) | structlog config | **FIXED** — `planny_core/logging.py:18` |
| 5 | `planny_api/dependencies.py:99` | silent `"VIS-2"` fallback | `settings.jira.tempo_issue_key` (required if the module is active → clear error if missing) |
| 6 | `planny_api/dependencies.py:83-109` | client `lru_cache` | `app/lifespan.py` + `AppContext` |
| 7 | `routers/auth.py` (pre-refactor revision) | **~430 lines of seed** | **FIXED** — `modules/auth/seeds/guest_project.json` + `modules/auth/seeder.py`, generated from the old code |
| 8 | `modules/jira/sync/service.py:105-112` | `"yoda"/"gaben"/"rick"` → IDs 1/2/3 | resolution by email/accountId; `sync.reporter_fallback` configuration |
| 9 | `modules/jira/sync/service.py:213` | `os.environ["EXTERNAL_JIRA_EMAIL"]` | `SyncContext` parameter |
| 10 | `modules/jira/sync/service.py:246` | 24 h TTL | `settings.sync.stale_after_hours` |
| 11 | `modules/jira/sync/service.py:263` | default gravatar | `settings.integrations.default_avatar_url` |
| 12 | ~~fixed JQL~~ | fixed JQL | **FIXED** — `settings.sync_jql` (`planny_core/config.py:83`) |
| 13 | ~~`maxResults: 100`~~ | `maxResults: 100` | **FIXED** — `settings.sync_page_size` |
| 14 | `modules/jira/sync/service.py:26-37` **and** `modules/jira/issues/router.py:35-46` | list of 10 fields **duplicated** | `planny_jira/constants.py::DEFAULT_ISSUE_FIELDS` |
| 15 | ~~REST paths spelled out at each call site~~ | 4 duplicated paths | **FIXED** — `planny_jira/constants.py:26` (`JIRA_SEARCH_PATH`), plus the issue, transitions and worklog helpers |
| 16 | ~~`category="software"`~~ | hardcoded category | **FIXED for sync** — `settings.sync_default_project_category`; the guest seed keeps it as data |
| 17 | `modules/jira/sync/service.py:41-120` | type/status/priority maps | `planny_jira/mappings/jira_mappings.yaml` |
| 18 | `middleware/rate_limiter.py:58-59` **and** `modules/quick_actions/router.py:44-45` | `60_000` / `10` duplicated | `settings.rate_limit.{window_ms,max_requests}` per module |
| 19 | Async + sync engine builders in `planny_core/database.py` and `alembic/env.py` (pre-refactor revisions) | URL built **3×** | **FIXED** — `planny_core/db/engine.py:30` (`database_url`) is the only builder |
| 20 | `planny_core/db/engine.py:59-62` | pool 20/10/3600 | `settings.db.pool_*` |
| 21 | `planny_core/database.py:47` **and** `planny_api/dependencies.py:22` | duplicated `get_db` | `planny_core/db/session.py::get_session` (single) |
| 32 | `planny_core/database.py:40-42` | `async_engine`/`async_session_factory` as import globals → `create_app(settings)` does not control the DB | `class Database` in the `AppContext` (see §4.6) — `Database` exists, globals pending Phase 2 |
| 22 | `planny_core/config.py:46` | `"VIS-2"` default | see #5 |
| 23 | `planny_core/config.py:74-94` | literal CORS origins/regex | `settings.cors` from env (`CORS__ORIGINS`) |
| 24 | `planny_jira/config.py` (15 sites) | direct `os.environ` | injected `settings.jira` |
| 25 | `modules/health/checks.py:36` | ad-hoc Jira check | checks per registered capability |
| 26 | `modules/quick_actions/router.py:39-40` | module-level singletons | `AppContext` |
| 27 | `modules/jira/issues/router.py:53` | `max_results=50, le=100` | `settings.jira.search_max_results` |
| 28 | `planny_core/errors.py` (pre-refactor; now the `planny_core/errors/` package) | codes as loose strings | **FIXED** — `planny_core/errors/codes.py` |
| 29 | `planny_api/main.py` (pre-refactor) | `docs_url` gated, `redoc_url`/`openapi_url` open in production | **FIXED** — `planny_api/app/factory.py:72-74` gates all three (see H12) |
| 30 | `planny_core/config.py:97-101` | `env_file=".env"` relative to the CWD → config is lost silently | absolute `paths.env_file()` + `SettingsGroup` pattern (see H13 and §4.5) |
| 31 | `Dockerfile.python` | does not copy `.env`; `.env`-based config never reaches the container | document that in Docker the config goes through env vars, or `env_file` in compose |

---

## 6. Route map: legacy → `/api/v1`

All legacy routes stay active as aliases. The “Alias” column indicates whether the module exposes it.

| Legacy (client today) | Canonical | Module | Legacy alias |
|---|---|---|---|
| `POST /authentication/guest` | `POST /api/v1/authentication/guest` | `auth` | ✅ |
| `GET /currentUser` | `GET /api/v1/currentUser` | `users` | ✅ |
| `GET /projects` | `GET /api/v1/projects` | `projects` | ✅ |
| `GET /project` | `GET /api/v1/project` | `projects` | ✅ |
| `PUT /project` | `PUT /api/v1/project` | `projects` | ✅ |
| `POST /projects/sync` | `POST /api/v1/projects/sync` | `projects` | ✅ |
| `POST /projects/{id}/sync` | `POST /api/v1/projects/{id}/sync` | `projects` | ✅ |
| `GET /issues` | `GET /api/v1/issues` | `issues` | ✅ |
| `GET /issues/{id}` | `GET /api/v1/issues/{id}` | `issues` | ✅ |
| `POST /issues` | `POST /api/v1/issues` | `issues` | ✅ |
| `PUT /issues/{id}` | `PUT /api/v1/issues/{id}` | `issues` | ✅ |
| `DELETE /issues/{id}` | `DELETE /api/v1/issues/{id}` | `issues` | ✅ |
| `POST /comments` | `POST /api/v1/comments` | `comments` | ✅ |
| `PUT /comments/{id}` | `PUT /api/v1/comments/{id}` | `comments` | ✅ |
| `DELETE /comments/{id}` | `DELETE /api/v1/comments/{id}` | `comments` | ✅ |
| `GET /quick-actions/actions/outlook-clean/status` | `…/api/v1/quick-actions/actions/outlook-clean/status` | `quick_actions` | ✅ |
| `POST /quick-actions/actions/outlook-clean` | `…/api/v1/…` | `quick_actions` | ✅ |
| `GET /quick-actions/actions/tempo-export/hours` | `…/api/v1/…` | `quick_actions` | ✅ |
| `GET /quick-actions/actions/tempo-export/week` | `…/api/v1/…` | `quick_actions` | ✅ |
| `PUT /quick-actions/actions/tempo-export/hours` | `…/api/v1/…` | `quick_actions` | ✅ |
| `POST /quick-actions/actions/tempo-export` | `…/api/v1/…` | `quick_actions` | ✅ |
| `GET /health`, `/health/ready`, `/health/live` | *intentionally unversioned* | `health` | — (infra probes) |
| `GET /` → redirect | *unversioned* | app | — |
| `GET /api/v1/jira/issues` | *(already canonical)* | `jira.issues` | ❌ |
| `GET /api/v1/jira/issues/{key}` | *(already canonical)* | `jira.issues` | ❌ |
| `GET|POST /api/v1/jira/issues/{key}/transitions` | *(already canonical)* | `jira.issues` | ❌ |
| `POST|GET /api/v1/jira/worklogs` | *(already canonical)* | `jira.worklogs` | ❌ |
| `GET /api/v1/jira/worklogs/hours-by-date` | *(already canonical)* | `jira.worklogs` | ❌ |
| `PATCH /api/v1/jira/worklogs/hours-by-date/{date}` | *(already canonical)* | `jira.worklogs` | ❌ |

**Note on `/health`:** it is intentionally outside versioning. It is consumed by `docker-compose.yml`, `deploy/scripts/run.sh:127`, `status.sh:94`, `restart.sh:70`, and `QUICKREF.md`. Versioning it would break infrastructure for no benefit.

---

## 7. Contract with the client: guarantees

The React client is **not modified** in this refactor. Explicit guarantees:

| Guarantee | How it is verified |
|---|---|
| The 21 legacy routes with aliases keep responding | Parameterized test that walks the map from §6 against both prefixes and compares status + body |
| The camelCase format does not change | Contract tests per resource (exact keys of `issue_partial`, `project_to_dict`, `user_to_dict`, `comment_to_dict`, `_issue_full_dict`) |
| The error envelope does not change in the cases the client already handles | Existing tests for `ENTITY_NOT_FOUND` (404), `BAD_USER_INPUT` (400), `INVALID_TOKEN` (401), `ISSUE_READONLY` (403) |
| The status codes do not change | 66 asserts of `200`, plus 404/400/401/403/409/429/502/503 stay intact |
| The `/` redirect remains | `test_auth` / smoke |

**Contract debt identified, NOT included by default** (see §9.4 for the optional proposal):

- `POST` returns `200` instead of `201` (66 asserts of `200`).
- `DELETE` returns `{"message": ...}` with `200` instead of `204`.
- The 401 with no token returns `{"detail": ...}` instead of the envelope.
- The 429 returns `{"detail": {"error": ...}}`.

---

## 8. Test strategy

### 8.1 Shared `conftest.py` (removes H10)

```python
# packages/planny-api/tests/conftest.py
@pytest.fixture
def settings() -> Settings: ...            # Test settings (JWT, CORS, features)
                                           # WARNING: does NOT isolate the DB — see note below

@pytest.fixture
def app(settings) -> FastAPI: ...          # create_app(settings)

@pytest.fixture
async def db_engine() -> AsyncEngine: ...  # SQLite in-memory + create_all

@pytest.fixture
async def client(app, db_engine) -> AsyncClient:
    """Override get_session with the in-memory engine."""
    ...                                    # app.dependency_overrides[get_session] = override
@pytest.fixture
def auth_headers() -> dict[str, str]: ...
```

> **Isolation: what it does and what it does not do (corrected after verifying it).** The real
> database isolation comes from the **override of `get_session`** with an in-memory engine, which is
> what the tests already do today. The `settings` fixture is for application configuration
> (JWT, CORS, feature flags), **not** for redirecting the DB — and it only works because §4.6
> removes the module globals. Before that correction, changing `settings` after the
> import had no effect at all on the engine (verified: the engine is not rebound).

The existing tests keep their local fixtures (local precedence wins → **zero breakage**); as each domain is migrated, its tests start using the shared ones.

**Also:** the `settings` fixture must clear the `get_settings()` cache (`get_settings.cache_clear()`) so that each test starts from a clean state; otherwise the accessor's `@lru_cache` leaks configuration between tests.

### 8.2 Architecture tests (new, and they are the plan's guardrail)

`tests/architecture/test_boundaries.py` — automatically verifies the principles, over the **AST** of the files (without importing):

| Test | Principle |
|---|---|
| `planny_core` does not import `fastapi` or `starlette` | P2 |
| `modules/*/router.py` does not import `sqlalchemy` or `planny_core.models` | P3 |
| No file outside `planny_core/config/` imports `os` to read `environ` | P4 |
| `main.py` ≤ 40 lines | P5 |
| Every `modules/<x>/` has an `__init__.py` with `MODULE` or `MODULES` | P1 |
| Every `ErrorCode` code has at least one use | §4.7 |

These tests turn the blueprint into something **CI enforces**, not a document that rusts.

### 8.3 Registry test

`tests/kernel/test_registry.py`:

- a test module (fixture) is mounted **without editing the factory**;
- duplicate name → startup error with a clear message;
- non-existent `depends_on` → error;
- route collision → error;
- `capabilities=("jira",)` without Jira configured → 503.

### 8.4 Legacy ↔ v1 parity test

Parameterized test over the map from §6: for each route, it makes the request against the legacy prefix and against `/api/v1` and compares status code + JSON. It is the mechanical guarantee that the alias never diverges.

---

## 9. Phased execution plan

Each phase ends with the **gate**:

```bash
.venv/bin/python -m pytest packages/ -q
.venv/bin/python -m ruff check packages/
.venv/bin/python -m mypy packages/
```

> Operational note: in this environment `uv run` fails due to cache permissions outside the workspace (`~/.cache/uv`). `.venv/bin/python -m …` is used directly. The commands in `AGENTS.md` still document the `uv run` form for normal use.

### Phase 0 — Frozen baseline and blueprint

- [x] Measure baseline: 297 tests, ruff ✅, mypy ✅.
- [x] This document.
- **Gate:** user review and approval.

### Phase 1 — Kernel: configuration, db, and errors

Without touching routes yet. It is the foundation of everything else.

**Progress (2026-10-05).**

| Item | Status |
|---|---|
| `planny_core/paths.py` — absolute project root, CWD-independent | **done** |
| `planny_core/errors/` package: `codes.py` + `base.py` + `__init__.py` | **done** |
| `planny_core/logging.py` extracted from `main.py` | **done** |
| `planny_core/db/` package: `base.py`, `engine.py`, `session.py::Database` | **done** |
| Single SQLAlchemy URL builder (`database_url`), used by both engines and Alembic | **done** |
| Models import `Base` from `planny_core.db.base` — importing a model no longer builds an engine | **done** |
| All error codes come from `ErrorCode` (no literal codes outside the registry) | **done** |
| Fail-fast on `env=production` + default JWT secret | **done** |
| Remove the module-level engine globals (`planny_core/database.py:40-42`) | **pending** — needs the `AppContext` from Phase 2 |
| `planny_core/config/` with `SettingsGroup` groups and the layered resolver | **pending** — superseded by the runtime configuration design (§13 of the runtime blueprint) |
| `planny_jira/config.py` stops reading `os.environ` (now takes an explicit env mapping) | **done** |
| `services/jira_sync_service.py` receives the syncing email as a parameter | **done** |

Remaining bullet points from the original plan:

- `planny_core/config/` with groups (`SettingsGroup`) — the shape now has to accommodate the
  runtime configuration design, so it is sequenced with C1 rather than done blind.
- `alembic/env.py` reduced to importing the shared URL builder — **done**, but see H15: the
  Alembic library is not a declared dependency, so the file could not be exercised at runtime.
- New tests: `test_config_contract.py` (legacy names still resolve), `test_planny_jira_config_dual_path.py` (YAML and env).
- **Fix H13:** done — absolute `paths.env_file()` + **fail-fast** if `env == "production"` with `jwt_secret` at the default.

**Extra gate:** `rg "os\.environ" packages --glob '!**/config/**'` returns nothing; the CWD test passes; starting in `production` with the default JWT aborts with a clear message.

Status: the CWD test, the abort and the `os.environ` gate **all pass**. Verified:

```
$ rg "os.environ" packages --glob '!**/tests/**' | grep -v 'planny_core/config.py|planny_core/paths.py'
(nothing)
```

Two remaining imprecisions to resolve when the `planny_core/config/` package is created:
`planny_core/paths.py` legitimately reads `os.environ` (config-layer work) but is not under a
`config/` directory, so a naive `--glob '!**/config/**'` gate still flags it; moving
`paths.py` into the package makes the glob exact.

**Risk:** low for routes and responses; **medium** for the engine lifecycle — mitigated by keeping the shim during the transition and with the test suite as the net.

### Phase 2 — Module contract and composition kernel

**Status: DONE (2026-10-05).**

| Deliverable | Status |
|---|---|
| `kernel/module.py` — `ApiModule` contract | done |
| `kernel/registry.py` — discovery, validation, topological ordering | done |
| `kernel/mounting.py` — canonical + legacy mount, doubled-prefix check | done |
| `kernel/capabilities.py` — named capability resolution | done |
| `app/factory.py`, `app/handlers.py` — factory and error handlers | done |
| `main.py` reduced to an entrypoint — **132 → 20 lines** | done |
| `/api/v1` mounting with the automatic legacy alias | done |
| Pitfall 1 — Jira routers given a relative `prefix` | done |
| Pitfall 2 — `GET /` extracted from the `auth` router | done |

Original plan, kept for reference:

- `kernel/{module,registry,mounting,capabilities,validation}.py`.
- `app/{factory,lifespan,handlers,openapi}.py`; `main.py` becomes ~20 lines.
- `/api/v1` mounting + legacy alias.
- The 9 current routers are wrapped in `ApiModule` **without moving files yet** (temporary adapter), via `planny_api/catalog.py`.
- **Mandatory exception (§4.4, Pitfall 1):** the Jira modules could not be wrapped naively because their `prefix` already included `/api/v1`; they were given a relative prefix.
- **Mandatory exception (§4.4, Pitfall 2):** `GET /` was extracted from the `auth` router into `app/handlers.py` before wrapping it.

**Extra gate: met.** Measured on the real application:

| Check | Result |
|---|---|
| Versioned routes with a working alias | 28 parametrized parity cases, all green |
| Doubled `/api/v1` prefix | **none** |
| `/docs` shows only `/api/v1` | yes; `/health` documented unversioned; aliases hidden |
| `GET /` stays unversioned | 302, not `/api/v1/` |
| `/health` stays unversioned | 200 at `/health`, 404 at `/api/v1/health` |
| Route surface | 24 schema paths / 32 operations (was 25/33; the root route is no longer in the schema) |

`app/lifespan.py` and `app/openapi.py` were **not** created: the lifespan lands in §4.8 together with the
`AppContext`, which depends on the runtime configuration decisions, and the schema metadata already
comes from settings. Splitting them out now would have produced empty modules.

**Risk (realized):** medium — the parity test caught two of my own mistakes while writing it, both
described in the appendix.

### Phase 3 — Migrating domains to vertical slices

**Status: COMPLETE (2026-10-05) — all 9 domains migrated.**

| Domain | Status | Notes |
|---|---|---|
| `health` | **done** | Probes moved to `modules/health/checks.py` so the router holds no SQL |
| `users` | **done** | |
| `comments` | **done** | Repository added; the router no longer builds queries |
| `auth` | **done** | ~430 lines of seed extracted to `modules/auth/seeds/guest_project.json`; query moved to `modules/auth/repository.py` |
| `projects` | **done** | Split into `repository.py` + `service.py` + `serializers.py`; authorization moved to `ProjectScope` |
| `issues` | **done** | Split into `repository.py` + `service.py` + `serializers.py`; the 3 duplicated scope queries collapsed into `ProjectScope` |
| `quick_actions` | **done** | Router, schemas, Outlook cleaner and Tempo service moved together |
| `jira` (issues + worklogs) | **done** | Routers split into `modules/jira/{issues,worklogs}/`; the sync engine moved to `modules/jira/sync/` |

`planny_api/catalog.py` has been **deleted**. Discovery is now entirely automatic: every domain
is found by scanning `planny_api.modules`, and `settings.modules_packages` is empty. The three
legacy layer directories (`routers/`, `schemas/`, `services/`) are gone, and an architecture
test fails if any of them reappears.

Measured: 9 modules discovered from an empty explicit list, 24 schema paths, no doubled prefix.

**Artifacts produced while migrating:**

- `planny_api/modules/auth/seeds/guest_project.json` — the guest seed as data. It was
  generated **programmatically from the previous code**, not retyped, so the eight issue
  descriptions and the reporter/assignee indexes are identical. `test_auth.py` passes
  unchanged, which is the fidelity check.
- `packages/planny-api/pyproject.toml` gained an `artifacts` entry for the JSON: Hatchling
  would otherwise omit it from the wheel and the seeder would fail in an installed
  distribution.
- `planny-api/tests/test_architecture.py` — the guiding principles are now executable.

**Architecture tests (new).** These convert principles into CI-enforced checks:

| Principle | Check |
|---|---|
| P1 | Every sub-package of `planny_api/modules` exposes `MODULE`/`MODULES` |
| P2 | `planny-core` never imports `fastapi` or `starlette` |
| P3 | Routers do not build queries — a **ratchet**: the known debt set is pinned and the test fails if it grows *or* if it goes stale |
| P4 | Only the configuration layer reads the process environment, detected via AST so a docstring mentioning `os.environ` is not flagged |
| P5 | `main.py` stays under 40 lines and the factory imports no domain router |

The P3 ratchet is now **empty**: no router builds queries. It stays in place as a guard, so a
new router that reaches for SQL fails the suite instead of quietly re-introducing the problem.

Original plan, kept for reference:

1. `health` (the simplest; it validates the pattern end-to-end)
2. `users`
3. `auth` (+ extraction of the ~430 lines of seed into `seeds/guest_project.json`)
4. `projects`
5. `issues`
6. `comments`
7. `quick_actions`
8. `jira` (issues + worklogs) — **watch out for Pitfall 1 from §4.4:** the `prefix` must change from `/api/v1/jira/issues` to `/jira/issues` **in the source code**; re-parenting routes does not work.

For each domain: create the module folder, move `router/schemas/service`, create `repository.py`, update the test imports.

**Extra gate per domain:** legacy ↔ v1 parity still green; domain tests green; zero routes with a duplicated `/api/v1`.

**Risk:** medium-low (mechanical and incrementally verifiable).

### Phase 4 — Authorization and data access

**Status: IN PROGRESS (2026-10-05).**

| Item | Status |
|---|---|
| `core/security/policies.py` with `ProjectScope` + `get_project_scope` | **done** |
| Remove the duplicated scope queries from H5 | **done** — the four copies in `issues.py` (×3) and `comments.py` are gone |
| One shared authorization mechanism instead of two | **done** — `sync_project` no longer uses relationship membership |
| `repository.py` per migrated domain | **done** for auth, comments, issues, projects |
| Routers stop building queries | **done** — P3 ratchet is empty |
| `core/serialization/` consolidates the JSON contract (H6) | pending |
| Services receive their repository by injection | pending — repositories are imported as modules, which keeps the existing patch seams working |

**Extra gate: met.** The architecture test that forbids SQL in routers is green with an empty
debt set.

### Phase 5 — Jira module and sync

**Status: DONE (2026-10-05).** The 526-line file is now three:

| Module | Lines | Contents |
|---|---|---|
| `modules/jira/sync/mapping.py` | 219 | Pure transformations. Imports only `datetime`, `typing` and the enums — no database, no settings, no network |
| `modules/jira/sync/repository.py` | 162 | Every statement issued against the database |
| `modules/jira/sync/service.py` | 265 | The algorithm, plus `should_auto_sync` |

Being pure is what made the mapping testable on its own: 49 new tests cover status
families, duration conversion, ADF flattening, identity extraction and the full field map.

**A real bug was removed in the process.** `resolve_reporter_id` guessed the reporter from
the display name and returned hardcoded local ids:

```python
if "rick" in display_name: return 3
```

Those ids belong to whatever rows exist, so any Jira user named "Rick" was silently
attributed to an unrelated local account. The reporter now comes from the Jira account
itself. Nothing tested the old behaviour, and there is now a regression suite asserting the
reporter passed in is the reporter stored.

The hardcoded sync values are now configuration: `sync_jql`, `sync_page_size`,
`sync_stale_after_hours`, `sync_default_project_category` and
`integration_default_avatar_url`.

Original plan, kept for reference:

- ~~Move `jira_sync_service.py` to `modules/jira/sync/`~~, split by responsibility:
  - `mapping.py` (pure, no DB) — status/priority/type/ADF
  - `repository.py` (upserts, associations, closing orphans)
  - `service.py` (pagination + orchestration)
- `planny_jira/constants.py` unifies the duplicated fields list (H7 #14) and the REST paths.
- `planny_jira/mappings/jira_mappings.yaml` + loader with an override via `JIRA_MAPPINGS_PATH`.
- Remove the mapping by name to IDs 1/2/3 (H7 #8).
- Resolve the v2/v3 endpoint mix with a documented decision per operation.

**Extra gate:** the `test_jira_sync.py` tests (723 lines) stay green; new tests for the mappings loader.

### Phase 6 — Hardening

**Status: MOSTLY DONE (2026-10-05).**

| Item | Status |
|---|---|
| `AppContext` + `lifespan` owning and closing long-lived resources | **done** |
| `lru_cache` removed from dependency wiring | **done** — the only remaining use is the seed file loader, which is a pure read |
| Rate limiter unified on the `AppError` envelope | **done** — `RateLimitExceededError` carries the `X-RateLimit-*` headers |
| Outlook-clean 409 unified on the envelope | **done** — `ConflictError` replaces the `HTTPException` |
| `RequestLogger` redacts sensitive query params and truncates | **done** |
| `health` with checks per registered capability | **done** — `CAPABILITY_HEALTH` in `kernel/capabilities.py`; adding a capability with a probe makes it appear with no change to the health module |
| Standard pagination | **done** — `planny_core/pagination.py`, plus a real fix: the submission count loaded every row to take `len()` |
| **H12:** gate `docs_url`, `redoc_url` and `openapi_url` together | **done** |

Notes worth keeping:

- **`lifespan` closes what it owns.** `AppContext.aclose()` closes the Jira issue client and calls
  `WorklogService.aclose()` (added for this purpose — reaching into its private attributes would
  have been fragile). Previously every `httpx.AsyncClient` pool leaked on reload, on shutdown and
  in tests.
- **A lazy fallback in `get_context` is deliberate.** `httpx.ASGITransport`, which the whole test
  suite uses, does **not** run lifespan events. Without the fallback every test would 500. The
  lifespan remains the owner in production: it builds the context up front and closes it on exit.
- **Quick-action services moved off module globals.** They were module-level singletons, so the
  Outlook job state was shared across tests. They now live in the context, and tests override
  `get_context`.
- **Two import cycles had to be broken.** `planny_api/app/__init__.py` re-exported `create_app`,
  so importing any submodule dragged in the factory and the whole module registry. It now
  re-exports nothing, and the service classes are imported under `TYPE_CHECKING`.

**Extra gate:** with `env=production` all three documentation endpoints return 404; with
`development` they respond 200. **Met.**

### Phase 6b — Contract hardening (APPROVED and DONE, 2026-10-05)

| Change | Status |
|---|---|
| `POST` → `201` | **done** for the endpoints that actually create a resource: `POST /issues`, `POST /comments` |
| `DELETE` → `204` | **done**: `DELETE /issues/{id}`, `DELETE /comments/{id}` now return no body |
| 401 with no token → `AppError` envelope | **done** — `HTTPBearer(auto_error=False)` plus an explicit `InvalidTokenError` |
| 429 → `AppError` envelope | **done** — `RateLimitExceededError`, with the `X-RateLimit-*` headers |
| 409 → `AppError` envelope | **done** — `ConflictError` replaces the `HTTPException` |

Deliberate limits, rather than blanket changes:

- **Not every `POST` became `201`.** `POST /authentication/guest` is a login that may reuse an
  existing account, and the sync and trigger endpoints start work rather than creating an
  addressable resource. They keep `200` because that is the accurate semantic. Applying `201`
  everywhere would have been mechanical, not correct.
- **`DELETE` returns no body.** The three tests that asserted `{"message": "..."}` now assert the
  response is empty, which is what `204` means.
- **The two status codes cannot differ between `/api/v1` and the legacy alias** — both mounts
  share one router. Axios accepts any 2xx, and the client never read a delete body, so the
  client is unaffected; verified by reading `client/src/shared/utils/api.js` and both callers.

One regression the change surfaced: the parity test compared whole error bodies, and
`requestId` is minted per request. It passed before only because the old `401` had no
`requestId` at all — the test was leaning on the very inconsistency being removed. It now
compares the envelope minus `requestId`.

The client's dual-shape handling is gone: `client/src/shared/utils/api.js` keeps only the
re-authentication branch, since a missing token and an expired one are now indistinguishable.

### Phase 7 — Ready to merge projects

**Status: DONE (2026-10-05).**

| Deliverable | Status |
|---|---|
| Entry-point discovery (`planny.modules`) | **done**, and covered by a test that installs a fake `dist-info` |
| `settings.modules_packages` for explicit registration | **done** |
| Automatic scan of `planny_api.modules` | **done** — `modules_packages` is empty; every domain is found by scan |
| Example external package in the repo | `packages/planny-api/tests/fixtures/planny_example_module/`, exercised by `tests/test_external_module.py` |
| Add-a-module guide | [how-to-add-a-module.md](./how-to-add-a-module.md) |
| Merge-a-project guide | [how-to-merge-a-project.md](./how-to-merge-a-project.md) |

The example package proves the claim end to end: it lives outside `planny_api`, names
nothing in the application, and its routes still appear at `/api/v1/example-notes` with the
unversioned alias, authentication and OpenAPI documentation. A separate test registers it
through a synthetic entry point with `modules_packages=[]`, so discovery does not depend on
configuration either.

Original plan, kept for reference:

- Entry points `planny.modules` + `settings.modules.packages`.
- Example package `tests/fixtures/planny_example_module/` that mounts without touching the factory (permanent test).
- Guide `docs/architecture/how-to-add-a-module.md`:
  - how to create a module,
  - how to merge an existing project,
  - conventions for config, errors, serialization, and tests.
- `docs/architecture/how-to-merge-a-project.md`: merge checklist (route namespacing, module name collisions, Alembic migrations from a foreign repo, shared vs own tables).

### Phase 8 — Documentation and closure

- Update `docs/architecture/README.md` with this blueprint as “Accepted”.
- Update `README.md` (layout table, API versioning).
- Update `AGENTS.md`: new commands, principles P1-P8, where everything goes.
- Current route table in `docs/architecture/api-routes.md`.
- ADRs from §10 marked as accepted.

---

## 10. ADRs (decision record)

| ADR | Decision | Discarded alternatives | Reason |
|---|---|---|---|
| **ADR-001** | Modular monolith with vertical slices | Microservices; strict layers | A single deployable, a small domain, a small team. Slices give cohesion at no operational cost. |
| **ADR-002** | Automatic module discovery (entry points + config) | Manual list in the factory | It is *the* requirement for merging projects without editing `main.py`. |
| **ADR-003** | Canonical `/api/v1` + legacy alias generated by the kernel | v1 only (breaks the client); unversioned (does not scale) | Lets the API evolve without touching the client, and migrate gradually. |
| **ADR-004** | Single config with nested `pydantic-settings`; `os.environ` only in config | Keep `os.environ` scattered | Today there are 15 raw reads and two config systems that can diverge. |
| **ADR-005** | Thin router + service + repository + policies | Keep SQL and authorization in routers | 4 copies of the same authorization query; unifying closes a class of bug. |
| **ADR-006** | The SQLAlchemy models stay in `planny-core` | Move models into each module | `planny-jira` depends on them; moving them would create cycles or break the adapter. `planny-core` is the shared kernel. |
| **ADR-007** | Strict JSON contract compatibility during the migration | Take the opportunity to “clean up” responses | The client is the consumer; breaking it multiplies scope and risk. Cleanup goes to Phase 6b, explicitly. |
| **ADR-008** | The legacy alias is turned off by configuration (`API__LEGACY_ALIASES`) | Hardcode the alias | Allows retiring it once the client has migrated, without another refactor. |
| **ADR-009** | `/health` is not versioned | Version everything | It is consumed by docker-compose and 4 deploy scripts. |
| **ADR-010** | Jira mappings in YAML with an override | Leave them as Python dicts | Jira is configurable per instance; the user must be able to add statuses without touching code. |

---

## 11. Risks and mitigations

| # | Risk | Prob. | Impact | Mitigation |
|---|---|---|---|---|
| R1 | The legacy alias diverges from the canonical one | Medium | High | Parameterized parity test (§8.4) as the gate for each phase |
| R2 | Route or operation ID collision when mounting twice | Medium | Medium | `include_in_schema=False` (verified in FastAPI 0.139) + collision validation at startup |
| R3 | Tests break due to moved imports (`planny_api.dependencies`, `planny_api.services.*`) | **High** | Medium | Tests already use 2 paths: direct imports and `patch()` by route string. They are updated in the same phase; during the transition a `planny_api/compat.py` shim is kept and removed in Phase 8 |
| R4 | Seed data in JSON does not make it into the wheel | Medium | Low | `[tool.hatch.build.targets.wheel] force-include` + a test that imports the package and loads the seed |
| R5 | `alembic/env.py` with an import cycle through settings | Low | Medium | `env.py` imports only `planny_core.config` and `planny_core.db.base`; it already does a `sys.path` insert, which is kept |
| R6 | The refactor touches 4 threads at once and the suite takes a while to stabilize | Medium | High | Phases with green gates; Phase 3 in per-domain commits |
| R7 | Silent regression in the camelCase contract | Medium | High | Contract tests per resource (§7) before moving serializers |
| R8 | The Jira YAML path, currently dead, reveals bugs when activated | Medium | Low | Tests for both branches in Phase 1; the default behavior is still env |
| R9 | **Double prefix in the Jira modules** when mounting `/api/v1` (breaks the 8 routes) | **High** | High | Reproduced in a prototype; verified recipe in §4.4; gate that fails if `/api/v1/api/v1` exists |
| R10 | `GET /` ends up versioned at `/api/v1/` and the root redirect is lost | High | Low | Extract into `app/factory.py` before wrapping `auth` (§4.4, Pitfall 2) |
| R11 | Nested config silently ignores the `.env` (guaranteed failure with the naive pattern) | **High** | **High** | Reproduced; `SettingsGroup` pattern verified in §4.5 + config contract test |
| R12 | The module-level global engine means `create_app(settings)` does not control the DB (illusory test fixtures) | High | Medium | Reproduced; `class Database` in the `AppContext` (§4.6) |

---

## 12. Out of scope

Explicitly not included (documented for another iteration):

- Refactor of the React client.
- Durable jobs / queue for the sync (today `BackgroundTasks` + `asyncio.create_task`). This blueprint leaves the `AppContext` ready to inject a job runner, but does not implement it.
- Distributed rate limiting (Redis). It is parameterized, the storage backend is not changed.
- Real authentication (email/password, SSO). Today it is guest + JWT.
- Retries with `tenacity` for Jira.
- Metrics/tracing (OpenTelemetry).
- Rewriting the models to snake_case (the TypeORM `camelCase` stays; it is the database contract).

---

## 13. Approval

## 13. Approval status

All six questions were answered by the user on 2026-10-05:

| # | Question | Answer |
|---|---|---|
| 1 | Fix H12 now? | **Yes** — done, verified |
| 2 | Fail-fast for H13? | **Yes** — done, verified |
| 3 | Target architecture (§4)? | **Approved** |
| 4 | Hardcoding inventory and route map complete? | **Approved** |
| 5 | Start with Phase 1? | **Yes** — started |
| 6 | Phase 6b in this work? | **Yes**, included |

Two additional requirements were given at the same time, and they are recorded in the
[runtime configuration blueprint](./2026-10-05-runtime-configuration-blueprint.md):

- a second configuration path, database-backed and edited from a UI tab, with `.env` only as
  a fallback and explicitly not promoted;
- all documentation, source code and code comments in English.

**Open decisions** that block the settings module (not Phase 1) are listed in §13 of the
runtime configuration blueprint. The most significant is its §8 authorization prerequisite:
the settings API reads and writes database passwords and Jira tokens, and the current
authentication model has no roles, so shipping it first would let any anonymous visitor
rewrite infrastructure credentials.

---

## Appendix A — Document verification

This blueprint was audited against the code before being delivered, not written from memory:

| Verification | Result |
|---|---|
| `file:line` citations resolved uniquely and within range | **57/57** (re-verified after the English rewrite) |
| Ambiguous or broken citations | 0 |
| Count of the app's real routes (via `app.openapi()`) vs §6 | 25 paths / 33 operations — **matches** |
| `os.environ` in `planny_jira/config.py` | 15 (corrected from an initial 16) |
| LOC without tests / with tests | 5,646 / 7,515 |
| Double mounting `legacy` + `/api/v1` with FastAPI 0.139 | tested, works, `/docs` clean |
| H12 (`/redoc` and `/openapi.json` open in production) | reproduced, **fixed**, 7 regression tests |
| H13 (relative `env_file` → config lost silently) | reproduced, **fixed**, 13 regression tests |
| H14 (`data/` not covered by the committed `.gitignore`) | reproduced, **fixed** |
| **Discovery via entry points** (`planny.modules`) | **validated**: external package mounted at `/api/v1/notes` without touching the factory |
| **Module-level global engine** (`planny_core/database.py:40-42`) | **reproduced**: mutating `settings` does not rebind the engine → §4.6 and §8.1 corrected; `Database` class introduced, globals pending Phase 2 |
| Legacy env names (`DB_HOST`, `PORT`, `NODE_ENV`…) → nested groups | tested with `pydantic-settings` 2.14.2 |
| Precedence `PLANNY_*` vs legacy when both are defined | the new one wins |
| Nested groups with `env_file` only on `Settings` | **fails silently** — pattern discarded |
| Absolute `env_file` running from another CWD | config intact |
| Test suite | 297 at audit time → **540** after the H12–H17 fixes and Phases 1–8 |
| **Phase 2 parity** (legacy ↔ `/api/v1`) | **28 cases green**; aliases excluded from the schema |
| **Doubled-prefix guard** | startup check + test; catches a router carrying `/api/v1` itself |
| **Entry-point discovery** | covered by a test that installs a fake `dist-info` and discovers a module |
| **`main.py` size** | 132 → **20 lines** (principle P5 satisfied) |
| **Architecture principles enforced in CI** | P1–P5, via `planny-api/tests/test_architecture.py` |
| **Guest seed extracted to data** | ~430 lines of literals → `modules/auth/seeds/guest_project.json`, generated from the old code |

### Prototypes executed (outside the repo, without touching code)

1. **Double mounting** of an `APIRouter` at `/issues` and `/api/v1/issues` with `include_in_schema=False`.
2. **Double mounting with the repo's REAL routers** (health, auth, users, projects, issues, comments, quick_actions, jira×2) — this is where Pitfalls 1 and 2 from §4.4 appeared.
3. **Discovery via entry points**: a `planny_notes` package was created with its `entry_points.txt` (`[planny.modules]`) in a temporary `dist-info` and it was verified that the module is discovered and mounted **without touching the factory**.
4. **Nested config** with `SettingsGroup` groups, legacy aliases + new convention, and precedence verification.
5. **`.env` isolation** between `Settings` and nested groups (where the silent failure appeared).
6. **Execution from another CWD** against the repo's real `planny_core.config` (where H13 appeared).
7. **Engine binding** against the real `planny_core.database`: it was confirmed that mutating `settings` post-import does not change the database (contradiction of §8.1).

None of them left files in the project: they were run in temporary directories (`mktemp -d`) and deleted.

| Pitfall found in the real prototype | Status |
|---|---|
| Double prefix `/api/v1/api/v1/jira/...` (8 broken routes) | documented + verified recipe |
| Re-parenting `APIRoute` does **not** fix the prefix | verified, discarded |
| `GET /` versioned to `/api/v1/` | documented + fix in Phase 2 |
| `versioned=False` on `health` works | verified (200 / 404) |
| Legacy alias excluded from OpenAPI | verified |
| Global engine not rebindable by settings | documented + `Database` in `AppContext` (§4.6) |
| Entry points discover external modules | verified |

**Note on FastAPI 0.139:** `app.routes` **no longer** exposes `APIRoute` directly; it returns `_IncludedRouter` wrappers and the routes are expanded lazily. To inspect routes you must use `app.openapi()["paths"]`. The legacy ↔ v1 parity test (§8.4) must be built on `TestClient`, not on introspection of `app.routes`.
