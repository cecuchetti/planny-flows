# How to add a module

A domain lives in one folder and declares itself. Nothing else in the codebase
needs to change — not the factory, not a registry file, not a configuration list.

For a worked example that is executed by the test suite, see
`packages/planny-api/tests/fixtures/planny_example_module/` and
`tests/test_external_module.py`.

---

## 1. The short version

```bash
mkdir -p packages/planny-api/src/planny_api/modules/notes
```

```python
# modules/notes/__init__.py
from planny_api.kernel.module import ApiModule
from planny_api.modules.notes.router import router

MODULE = ApiModule(name="notes", router=router)
```

```python
# modules/notes/router.py
from fastapi import APIRouter, Depends
from planny_api.core.security.policies import ProjectScope, get_project_scope

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("")
async def list_notes(scope: ProjectScope = Depends(get_project_scope)) -> dict[str, object]:
    ...
```

That is it. The kernel scans `planny_api.modules`, finds `MODULE`, and mounts it at
`/api/v1/notes` plus the unversioned alias `/notes`. `GET /docs` shows the versioned route.

---

## 2. Folder layout

```
modules/notes/
├── __init__.py       # MODULE = ApiModule(...)      <- the only entry point
├── router.py         # HTTP: validate, delegate, serialize. No SQL, no rules
├── schemas.py        # Pydantic request/response models
├── service.py        # business rules and orchestration
├── repository.py     # every query for this domain
├── serializers.py    # the JSON shape returned to the client
├── policies.py       # domain-specific authorization
└── constants.py      # enums and mapping tables owned by this domain
```

Only `__init__.py` and `router.py` are required. Add the rest when the domain needs them —
an empty `service.py` is worse than no `service.py`.

**The rule that matters:** routers must not build queries. `tests/test_architecture.py`
enforces it, and it fails if a router imports `sqlalchemy` or `sqlalchemy.orm`.

---

## 3. The `ApiModule` contract

| Field | Default | Meaning |
|---|---|---|
| `name` | required | Unique identifier. Startup fails on a duplicate. |
| `router` | required | Router with **relative** paths. Never include `/api/v1`. |
| `version` | `"1"` | Mounted at `<api_prefix>/v<version>`. |
| `tags` | `()` | OpenAPI tags. Falls back to the module name. |
| `auth` | `True` | Injects the current-user dependency on every route. |
| `capabilities` | `()` | Named preconditions, e.g. `("jira",)`. |
| `versioned` | `True` | `False` mounts unversioned only — for infrastructure probes. |
| `legacy_alias` | `True` | Also mount at the root, outside the schema, for old clients. |
| `depends_on` | `()` | Modules that must mount first. |
| `enabled` | `None` | Predicate on `Settings` to switch the module off. |

### Paths must be relative

```python
router = APIRouter(prefix="/notes")          # correct
router = APIRouter(prefix="/api/v1/notes")   # WRONG -> /api/v1/api/v1/notes
```

A router carrying the version prefix produces a doubled path and silently breaks those
routes. `create_app()` detects it at startup and refuses to boot. The prefix is baked into
each route when it is added to the router, so moving routes between routers afterwards does
**not** fix it — the source has to change.

### Unversioned-only modules

Health probes are consumed by `docker-compose.yml` and `deploy/scripts/*`, so they must stay
at `/health`:

```python
MODULE = ApiModule(name="health", router=router, auth=False, versioned=False)
```

This keeps them mounted even when `api_legacy_aliases` is turned off.

---

## 4. Capabilities

A capability is a named precondition a module requires without knowing how it is
implemented:

```python
MODULE = ApiModule(name="jira_issues", router=router, capabilities=("jira",))
```

The kernel resolves `"jira"` against `planny_api/kernel/capabilities.py`. To add one, register
it there:

```python
CAPABILITIES["billing"] = require_billing_config
```

Unregistered capability names abort startup with a clear message.

---

## 5. Doing it from another package

The same contract works from outside `planny_api`. This is how a merged project registers
its domains — see [how-to-merge-a-project.md](./how-to-merge-a-project.md).

```
my_project/
└── modules.py     # MODULES = (ApiModule(...), ...)
```

Two ways to register it:

**Entry point (preferred).** In the project's `pyproject.toml`:

```toml
[project.entry-points."planny.modules"]
my_project = "my_project.modules"
```

Installing the package is then the entire integration step.

**Explicit package name**, for development before the package is installed:

```
MODULES_PACKAGES=["my_project.modules"]
```

---

## 6. Configuration

Add a field to `Settings` in `planny_core/config.py` with a default. Do not read
`os.environ` outside the configuration layer — an architecture test enforces this.

```python
notes_page_size: int = Field(default=20, description="...")
```

The field is then `settings.notes_page_size`, and `NOTES_PAGE_SIZE` overrides it.

---

## 7. Testing

Put tests in `packages/planny-api/tests/`. Follow the existing pattern: an in-memory SQLite
engine and `app.dependency_overrides` for anything the domain depends on.

To replace application resources, override `get_context`:

```python
app.dependency_overrides[get_context] = lambda: AppContext(settings=settings)
```

---

## 8. Checklist

- [ ] `modules/<domain>/__init__.py` exposes `MODULE` or `MODULES`
- [ ] The router's paths are relative
- [ ] No SQL in the router — queries live in `repository.py`
- [ ] Authorization uses `ProjectScope`, not a bespoke query
- [ ] No `os.environ` reads outside the configuration layer
- [ ] No hardcoded business values: settings, not literals
- [ ] `uv run pytest packages/ -q`, `ruff` and `mypy` are green
- [ ] `GET /docs` shows the route under `/api/v1`, and the unversioned alias answers too
