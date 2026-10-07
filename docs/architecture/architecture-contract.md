# Architecture contract

**Read this before adding a feature or changing the structure of the backend.**

It is the normative reference: what the architecture is, why the rules exist, what
counts as a violation, and what to do instead. It is deliberately short on
history — for the reasoning behind each change, the findings it came from and the
phase plan, read
[the backend modular blueprint](./2026-10-05-backend-modular-blueprint.md).

| Document | Use it for |
|---|---|
| **This contract** | The rules. Read first |
| [Backend modular blueprint](./2026-10-05-backend-modular-blueprint.md) | Findings H1–H17, why each rule exists, the phase plan |
| [Runtime configuration blueprint](./2026-10-05-runtime-configuration-blueprint.md) | The settings store, its tiers, and what is deferred |
| [How to add a module](./how-to-add-a-module.md) | The procedure |
| [How to merge a project](./how-to-merge-a-project.md) | Absorbing another project |
| [API routes](./api-routes.md) | The current surface and status codes |

---

## 1. Why this architecture exists

The backend was a classic layered layout: `routers/`, `schemas/`, `services/`,
`models/`. Every new feature had to touch all four, and every new project merged
in had to be untangled across them. The layout optimised for *what kind of file is
this*; it answered nothing about *what does this thing do*.

It is now organised by domain. A feature lives in one folder, declares itself, and
is discovered. The layout answers the question that matters when the codebase
grows: **what can I change without surprising something else?**

Three properties are worth protecting, and every rule below serves one of them:

1. **A change stays local.** Adding a domain must not require editing a registry,
   a factory or a configuration list. If it does, every merge becomes a conflict.
2. **A boundary is enforced, not remembered.** Conventions decay. The rules that
   matter are checked by tests that fail the build, not by review.
3. **A fallback is never silent.** When the application cannot do what the
   configuration says, it says so loudly rather than degrading invisibly.

**Why this must be respected.** Not for tidiness. Each rule here encodes a failure
that actually happened in this repository — a production endpoint left open, a
secret that could be read back, a sync that reported success while doing nothing, a
board that showed the wrong data for reasons nobody could see. The
[violations](#8-what-counts-as-a-violation) section lists them. Breaking a rule
does not make the code untidy; it re-opens a specific hole that was closed on
purpose.

---

## 2. The shape

```
packages/
├── planny-core/              KERNEL — no web framework
│   ├── config/               the only layer allowed to read the environment
│   │   ├── settings.py       typed Settings; resolves env and .env
│   │   ├── keys.py           declarative registry of configurable keys
│   │   ├── resolver.py       applies store overrides, revalidates
│   │   ├── store.py          the runtime store (app_setting)
│   │   ├── crypto.py         AES-256-GCM for stored secrets
│   │   ├── bootstrap.py      tier-0 values + the data/bootstrap.json cache
│   │   └── paths.py          repository paths, CWD-independent
│   ├── db/                   Base, engine factories, Database
│   ├── errors/               ErrorCode + AppError hierarchy
│   ├── models/               SQLAlchemy models
│   ├── logging.py  pagination.py  enums.py  auth.py
│
├── planny-api/               THE APPLICATION
│   ├── main.py               entrypoint only, 20 lines
│   ├── app/                  factory, context, lifespan, handlers
│   ├── kernel/               module contract, registry, mounting, capabilities
│   ├── core/                 cross-cutting: security policies, pagination
│   ├── middleware/           request id, logging, error handling, rate limiting
│   ├── modules/              one package per domain, discovered
│   └── dependencies.py       the DI surface
│
└── planny-jira/              THE ADAPTER — HTTP client, constants, worklog rules
```

**Dependency direction is one-way:** `planny-api` → `planny-jira` → `planny-core`.
Never the reverse. `planny-core` importing the web framework is a test failure, not
a style opinion.

### The ten domains

| Module | Versioned | Alias | Auth | Capabilities |
|---|---|---|---|---|
| `auth` | ✓ | ✓ | — | — |
| `comments` | ✓ | ✓ | ✓ | — |
| `health` | — | ✓ | — | — |
| `issues` | ✓ | ✓ | ✓ | — |
| `jira_issues` | ✓ | — | ✓ | `jira` |
| `jira_worklogs` | ✓ | — | ✓ | `jira` |
| `projects` | ✓ | ✓ | ✓ | — |
| `quick_actions` | ✓ | ✓ | ✓ | — |
| `settings` | ✓ | ✓ | ✓ | — |
| `users` | ✓ | ✓ | ✓ | — |

`health` opts out of versioning because `docker-compose.yml` and four scripts under
`deploy/scripts/` probe a fixed `/health`. The `jira_*` modules opt out of the alias
because their canonical path is already unversioned (`/api/v1/jira/...`).

---

## 3. The module contract

A domain declares itself:

```python
# modules/notes/__init__.py
MODULE = ApiModule(name="notes", router=router)
```

The kernel scans `planny_api.modules`, finds `MODULE` or `MODULES`, and mounts it.
Nothing else in the codebase changes.

| Field | Default | Meaning |
|---|---|---|
| `name` | required | Globally unique. A duplicate aborts startup. |
| `router` | required | **Relative** paths. Never include `/api/v1`. |
| `version` | `"1"` | Mounted at `<api_prefix>/v<version>`. |
| `auth` | `True` | Injects the current-user dependency on every route. |
| `capabilities` | `()` | Named preconditions, resolved by the kernel. |
| `versioned` | `True` | `False` mounts unversioned only. |
| `legacy_alias` | `True` | Also mounts at the root, outside the schema. |
| `enabled` | `None` | Predicate on `Settings`. The fail-closed switch. |
| `depends_on` | `()` | Modules that must mount first. |
| `tags` | `()` | OpenAPI tags. |

### The four layers inside a domain

| File | Responsibility | Never |
|---|---|---|
| `router.py` | Validate, delegate, serialize | SQL, business rules |
| `service.py` | Business rules, orchestration | HTTP types, raw queries |
| `repository.py` | Every query for the domain | Business rules |
| `schemas.py` | Request/response models | Persistence |

Plus whichever of `serializers.py`, `policies.py`, `constants.py` the domain needs.
**An empty `service.py` is worse than no `service.py`** — create the layer when
there is something to put in it.

---

## 4. Configuration

Two tiers, because of a bootstrap paradox: reading the runtime store needs a
database connection, and that connection is itself a setting.

| Tier | Where it comes from | Stored? |
|---|---|---|
| **Bootstrap** | process env → `data/bootstrap.json` → `.env` → default | **Never** |
| **Runtime** | database → process env → `.env` → default | Yes, in `app_setting` |

Bootstrap keys are `ADMIN_EMAIL` and `MASTER_KEY`. Everything else is runtime.

**Adding a setting is one entry in `config/keys.py`.** That entry drives
resolution, validation, the admin API and the UI form. If you find yourself adding
a setting in more than one place, you have found a bug.

Rules:

- **`os.environ` is read only inside `planny_core/config/`.** A test enforces it
  over the whole tree.
- **A secret is never returned.** The API reports that one is configured
  (`isConfigured`) and where it came from (`source`), never its value.
- **The store fails closed.** A stored secret with no master key aborts startup
  rather than being skipped; starting with credentials the operator believes are
  set but which are not is worse than not starting.
- **`data/bootstrap.json` is written `0600` from creation**, and never contains the
  master key. Caching it beside the data it protects would defeat the encryption.
- **A database change is proven before it is stored.** It is the one change that
  can lock the application out of its own settings store.

---

## 5. Errors and the wire contract

Every error, from every layer, leaves as one envelope:

```json
{"error": {"message": "...", "code": "ENTITY_NOT_FOUND", "status": 404, "data": {}},
 "requestId": "req_..."}
```

Including 401 — a missing token and an invalid one are indistinguishable to the
client, which is the point.

- Codes come from `ErrorCode` in `planny_core/errors/codes.py`. **Never a string
  literal.**
- `AppError` subclasses carry their own status; middleware serialises them.
- `InsecureConfigurationError` is deliberately **not** an `AppError`: it aborts
  startup and never maps to a response.
- Status codes: `201` only for a created resource, `204` for a delete with no body,
  `404` rather than `403` so the API does not confirm existence.

---

## 6. The executable rules

Conventions decay; tests do not. `packages/planny-api/tests/test_architecture.py`
enforces the boundaries below, and **a change that needs one of them relaxed is a
change to the architecture**, not to the test.

| Test | What it refuses |
|---|---|
| `test_package_exposes_a_module_or_modules` | A domain package that does not declare itself |
| `test_every_domain_is_discovered_without_an_explicit_list` | A domain reachable only by being listed somewhere |
| `test_the_compatibility_layer_directories_are_gone` | `routers/`, `schemas/`, `services/` reappearing |
| `test_core_does_not_import_the_web_framework` | `planny-core` importing `fastapi` or `starlette` |
| `test_no_environment_reads_outside_configuration` | `os.environ` outside `planny_core/config/` |
| `test_main_is_an_entrypoint_only` | Logic accumulating in `main.py` |
| `test_factory_does_not_import_domain_routers` | The factory knowing a domain exists |
| `test_only_known_routers_build_queries` | SQL in a router |

On top of those, the kernel **refuses to boot** rather than serving a broken
surface:

- `kernel/registry.py` rejects a duplicate module name, an unregistered capability
  name, an unknown `depends_on` and a dependency cycle.
- `kernel/mounting.py` rejects a router that carries its own version prefix, which
  would produce a doubled path and silently break those routes.

---

## 7. Recommendations

### When adding a feature

1. Does it belong to an existing domain? Extend that domain's layers. Do not add a
   new folder to "keep things separate".
2. Is it a new domain? Follow [how-to-add-a-module.md](./how-to-add-a-module.md).
   It is one folder and one declaration.
3. Does it need configuration? Add a key to `config/keys.py`. Do not read the
   environment.
4. Does it need a new resource or a new integration? Register a capability in
   `kernel/capabilities.py` — including a health probe, so `/health` reports it
   without anyone editing the health module.

### When changing the architecture

- **Bring the test with the change.** A boundary without a test is a comment.
- **Prefer an additive route to a breaking one.** `/api/v1` is canonical; the
  unversioned alias exists so the client keeps working. Removing an alias is a
  client-breaking change and needs a migration plan.
- **Keep `main.py` an entrypoint.** If you are adding to it, you are adding to the
  factory or to a middleware, and it belongs there.
- **Never introduce a module-level engine or client.** It cannot be closed, it
  cannot be reconfigured, and it makes every test share state. Own long-lived
  resources in `AppContext` and build them in `lifespan`.

### Things that look harmless and are not

| Tempting | Why not |
|---|---|
| A global `settings` read deep in a service | It works until the value has to change at runtime |
| `model_copy` to apply configuration overrides | Skips validation; a bad stored value reaches the engine |
| A second source of truth for a JSON shape | The client breaks on one endpoint only |
| Catching `Exception` and continuing | This is how the Jira sync reported success while doing nothing |
| Writing a file with `>` without checking it exists | It silently destroys the file. Verify the path first |
| Persisting a view selection | It becomes invisible state that outlives the screen that set it |

---

## 8. What counts as a violation

Grouped by the failure each one re-opens. Every example is drawn from a real
finding in this repository — see the blueprint for the full list.

### Structural

| Violation | Why it matters |
|---|---|
| A domain that is only reachable because something lists it | Every merge becomes a conflict in a central file |
| A router importing `sqlalchemy` | Authorization gets re-implemented per endpoint, and one of them will be wrong |
| `planny-core` importing `fastapi` | The kernel becomes untestable without a web server |
| A new `routers/`, `schemas/` or `services/` directory | Reintroduces the layout this architecture replaced |
| Business literals in code | The value cannot be changed without a deploy |
| `os.environ` outside the config package | Two configuration paths that disagree silently (H16) |

### Security

| Violation | Why it matters |
|---|---|
| Returning a secret's value from any endpoint | It ends up in a log, a proxy or a screenshot |
| Storing a secret before the connection is proven | The application can be locked out of its own store |
| Caching the master key beside the data it encrypts | A copy of the data directory decrypts everything |
| Serving `/docs`, `/redoc` or `/openapi.json` in production | The whole surface, enumerated, unauthenticated (H12) |
| A settings surface reachable without the admin role | Anonymous visitors can rewrite credentials; the module must fail closed instead |
| A relative `env_file` | The configuration is lost whenever the process starts elsewhere, and the JWT secret falls back to a public default (H13) |

### Data and contracts

| Violation | Why it matters |
|---|---|
| Two routers mounting the same path with different logic | The alias must be the *same* router mounted twice (P8) |
| A count query that loads every row to take `len()` | Correct, and O(n) in the size of the table |
| A component or endpoint claiming a state it is not in | This is the most expensive class here; it cost several rounds |
| A `.gitignore` entry that lives only in `.git/info/exclude` | It does not travel with the clone (H14) |
| A dependency documented but not declared | `uv sync --frozen` fails on a fresh clone (H15) |
| An undeclared variable in a component | It compiles. Building is not testing |

---

## 9. The gate

Every change must leave these green:

```bash
uv run pytest packages/          # the whole suite
uv run ruff check packages/      # lint
uv run mypy packages/            # types
uv run pytest packages/planny-api/tests/test_architecture.py   # the boundaries above
```

For the client:

```bash
cd client
npx jest                         # unit tests
npx eslint <changed files>       # per file, see the note
npx prettier --check <paths>
```

Two traps worth knowing, both of which have cost time here:

- **`npx eslint <directory>` lints nothing in this project** and exits 0. Pass
  **files**. A directory-based check looks like a passing gate and is not one.
- **A successful webpack build does not mean the code works.** A page that
  references an undefined variable compiles. Verify the built output contains what
  you expect when a change is not covered by a test.

And one about verification itself: **a regression test that passes against the
broken code is worthless.** Reintroduce the bug, watch the test fail, then fix it.
