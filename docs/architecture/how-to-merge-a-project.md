# How to merge a project

This is the workflow the architecture was built for. A second project becomes a set of
domains inside this one, without either side reaching into the other's internals and without
editing the application factory.

Read [how-to-add-a-module.md](./how-to-add-a-module.md) first: every merged domain follows
that same contract.

---

## 1. What "merged" means here

There are two shapes, and picking the right one early avoids most of the pain.

| Shape | When | How it lands |
|---|---|---|
| **Installed package** | The project has its own repository and release cycle | Keep it as a separate distribution; it publishes a `planny.modules` entry point. Nothing is copied. |
| **In-tree domains** | The project is retired and its code is absorbed | Its domains move under `planny_api/modules/`, one folder each. |

The installed-package route is strongly preferred while the other project is still alive: you
get a single deployment, but the source, tests and releases stay independent.

---

## 2. The integration step

### Installed package

In the other project's `pyproject.toml`:

```toml
[project.entry-points."planny.modules"]
acme = "acme_planny.modules"
```

And a module file that declares its domains:

```python
# acme_planny/modules.py
from planny_api.kernel.module import ApiModule
from acme_planny.tickets.router import router as tickets_router

MODULES = (
    ApiModule(name="acme_tickets", router=tickets_router, tags=("acme",)),
)
```

Add `planny-api` as a dependency, install it, done. Verified by
`packages/planny-api/tests/test_external_module.py`, which simulates exactly this.

### In-tree domains

Move each domain into `planny_api/modules/<name>/` and follow the module guide. No
registration step exists: the kernel scans `planny_api.modules`.

---

## 3. What you get for free

| Concern | Handled by |
|---|---|
| `/api/v1/<domain>` mounting | the kernel |
| Unversioned alias for old clients | `legacy_alias=True` (the default) |
| Authentication | `auth=True` (the default) |
| OpenAPI documentation | automatic; the alias stays out of the schema |
| Duplicate-name detection | startup fails with a clear message |
| Doubled-prefix detection | startup fails before serving traffic |
| Dependency ordering | `depends_on`, topologically sorted |
| Long-lived resources | `AppContext` + `lifespan` |

---

## 4. Checklist

Work through this before writing code; most of it is decisions, not implementation.

### Naming

- [ ] **Every `ApiModule.name` is globally unique.** A collision with an existing domain
      aborts startup. Prefix with the project, e.g. `acme_tickets` rather than `tickets`.
- [ ] Router prefixes do not collide either. `/tickets` from two projects is a real conflict;
      `/acme/tickets` is not.

### Routing

- [ ] Router paths are **relative**. If the other project's routers already carry `/api/v1`,
      strip it — see the module guide.
- [ ] Decide the version. Everything mounts at `/api/v1` by default; a project with its own
      versioning can declare `version="2"`.

### Data

- [ ] **Models.** A merged project's tables should be declared in `planny_core.models` if other
      domains need to join them, or kept inside its own package with the `Base` imported from
      `planny_core.db.base` so metadata stays in one place.
- [ ] **Migrations.** One Alembic history. Import the merged models in `alembic/env.py` so
      `--autogenerate` sees them, then generate the migration from this repository.
- [ ] **Table name collisions.** Check for tables that already exist here. Renaming the
      incoming table is usually cheaper than reconciling two different meanings.
- [ ] **A foreign `alembic/` directory is not copied.** The project's existing migration
      history cannot be replayed here; its schema becomes one new revision.

### Authentication and authorization

- [ ] Does a merged domain need the caller's projects? Use `ProjectScope`; do not write another
      scope query.
- [ ] Does it need a different identity model? Today the app has guests and JWTs with no roles.
      The settings module needs roles; if the merged project has authorization of its own,
      reconcile it here rather than running two schemes.

### Configuration

- [ ] Move tunables into `Settings` with defaults; no `os.environ` outside the configuration
      layer.
- [ ] Env var names are global. Prefix them (`ACME_*`) to avoid collisions with existing ones.

### Integration boundaries

- [ ] Does the merged project make outbound calls? Give it a client, and let `AppContext` own
      its lifecycle so `lifespan` closes it.
- [ ] Does it need a capability gate? Register one in `kernel/capabilities.py` rather than
      wiring a dependency into the factory.

### Tests

- [ ] Bring its tests across. They run under the same `pytest` invocation.
- [ ] Add a parity check if the incoming project had a public API: the alias must behave like
      the versioned route (`tests/test_module_mounting.py` shows the pattern).
- [ ] Confirm the gates: `pytest packages/ -q`, `ruff check packages/`, `mypy packages/`.

---

## 5. Order of operations

Merging works best bottom-up, because each step is independently verifiable:

1. **Models and migration first.** Get the schema into one Alembic history and confirm the app
   still starts and all tests pass with the tables present but unused.
2. **Repository and service layer.** Port the queries and rules with their tests, still
   unreachable over HTTP.
3. **Router and module declaration.** Only now does the domain appear in the API. Run the
   mounting tests; the doubled-prefix guard will catch a router that carries its own prefix.
4. **Wire integrations.** Outbound clients into `AppContext`, capability gates if needed.
5. **Delete the old project's duplicated code** once the ported tests pass here.

Doing it in the other order — mounting routes before the data layer is settled — is what makes
merges feel risky.

---

## 6. Pitfalls seen in practice

These are not hypothetical; each of them cost time in this repository.

| Pitfall | Symptom | Fix |
|---|---|---|
| Router carries `/api/v1` | `/api/v1/api/v1/...`, all routes 404 | Strip the prefix **in the source**. Re-parenting routes does not work. |
| `GET /` inside a domain router | Root redirect lands on `/api/v1/` | Root-level routes belong to the application, not a domain. |
| Module-level engine or client | Resources never closed; tests leak | Own them in `AppContext` and build them in `lifespan`. |
| A package `__init__` re-exporting the factory | Circular imports on unrelated imports | Keep `__init__.py` files free of cross-layer re-exports. |
| Configuration read from `os.environ` | Two config paths disagree silently | One configuration layer; modules receive settings. |
| Two sources of truth for a JSON shape | Client breaks on one endpoint only | The contract lives in one place per shape, with a test. |
| A router that builds queries | Authorization is re-implemented per endpoint | `repository.py` + `ProjectScope`. |
