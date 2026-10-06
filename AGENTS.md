# AGENTS.md

## Project

Planny Flows — a proxy in front of one or two real Jira instances, plus a local board.
- **API (Python)**: FastAPI + SQLAlchemy 2.0 + Alembic
- **Client**: React/JavaScript with Webpack

The backend is a **modular monolith**: each domain is a package under
`planny_api/modules/` that declares itself, and the kernel discovers and mounts it. Read
[docs/architecture/2026-10-05-backend-modular-blueprint.md](docs/architecture/2026-10-05-backend-modular-blueprint.md)
before changing the structure.

## Commands

### Root
```bash
npm run install-dependencies  # Install client deps
npm run start:client          # Start client dev server
npm run build:client          # Build client for production
npm run start:python          # Start Python API dev server with reload
```

### Python API (`packages/planny-api/`)
```bash
uv run uvicorn planny_api.main:app --host 0.0.0.0 --port 3824 --reload  # Development
uv run pytest packages/ -v --tb=short                                   # Run all tests
uv run pytest packages/planny-api/tests/test_issues.py -v               # Single test file
uv run ruff check packages/                                              # Lint
uv run mypy packages/                                                    # Type check
```

### Architecture tests

The blueprint's guiding principles are enforced by the suite, not by convention:

```bash
uv run pytest packages/planny-api/tests/test_architecture.py -v
```

They check: every domain package declares itself; `planny-core` never imports the web
framework; only the configuration layer reads the environment; routers do not build
queries; `main.py` stays an entrypoint and the factory names no domain.

### Client (`/client`)
```bash
npm start                   # Development (webpack serve)
npm run build               # Production build
npm run test:jest           # Unit tests with Jest
npm run test:cypress        # E2E tests with Cypress
```

### Pre-commit
```bash
cd client && npm run pre-commit   # Client lint + format
npx prettier --write "**/*.{ts,tsx,js,jsx,json,md}"
```

## Code Style Guidelines

### Prettier
```json
{ "printWidth": 100, "singleQuote": true, "trailingComma": "all" }
```

### Python Backend Conventions
- **Naming**: snake_case files/modules/functions, PascalCase classes
- **Tests**: pytest with `test_*.py` pattern
- **Imports**: absolute from package root (e.g., `from planny_core.config import settings`)
- **Lint**: ruff
- **Types**: type hints required, mypy strict mode
- **Errors**: `AppError` subclasses in `planny_core/errors/`; codes come from
  `planny_core.errors.ErrorCode`, never from string literals
- **Configuration**: the whole `planny_core/config/` package is the only layer allowed to
  read the process environment — an architecture test enforces it. Import via
  `from planny_core.config import Settings, settings`.

  | Module | Responsibility |
  |---|---|
  | `config/settings.py` | The typed `Settings` object; resolves the environment and `.env` tiers |
  | `config/keys.py` | Declarative registry: one entry per configurable key. Drives resolution, the API and the UI form |
  | `config/resolver.py` | Applies store overrides on top of settings, then revalidates |
  | `config/bootstrap.py` | Tier-0 values (database connection, admin, master key) needed before the store is reachable |
  | `config/paths.py` | Repository paths, independent of the working directory |

  Precedence for runtime keys: `database > process env > .env > default`. Add a setting by
  adding one entry to `config/keys.py` — not in six places.
- **DB**: SQLAlchemy 2.0 with async sessions

### React Guidelines (Client)
- Functional components
- Hooks
- PropTypes validation
- Destructure props
- Use fragments

```javascript
const Component = ({ prop1, prop2 }) => (
  <><div>{prop1}</div><div>{prop2}</div></>
);

Component.propTypes = { prop1: PropTypes.string.isRequired, prop2: PropTypes.func };
```

### Error Handling
**API**: Use `AppError` subclasses from `planny_core.errors` — handled globally by middleware.

**Client**: Use ErrorBoundary at app root.

### Testing Pattern

**pytest**:
```python
async def test_something(client, db_session):
    result = await service.method()
    assert result.status == "ok"
```

### Project Structure
```
/packages
  /planny-core       - Kernel
    /config          - configuration layer: the only place that reads the environment
    /models          - SQLAlchemy models
    /db, /errors, /enums
  /planny-api        - FastAPI application
    /app             - factory, context, lifespan, handlers
    /kernel          - module contract, registry, mounting, capabilities
    /core            - cross-cutting: security policies
    /middleware      - request id, logging, error handling, rate limiting
    /modules         - one package per domain, auto-discovered
  /planny-jira       - Jira HTTP client, constants, worklog orchestration

/client/src
  /App            - Root component
  /Project        - Feature components
  /shared         - Reusable components/hooks
  /Auth           - Authentication
```

There is no `routers/`, `schemas/` or `services/` directory. Every domain owns its own, and
an architecture test fails if one of those layer directories reappears.

### Adding to a domain

| Layer | Responsibility |
|---|---|
| `router.py` | Validate input, delegate, serialize. **No SQL, no business rules** |
| `service.py` | Business rules and orchestration |
| `repository.py` | Every query for the domain |
| `schemas.py` | Pydantic request/response models |
| `serializers.py` | The JSON shape returned to the client |
| `__init__.py` | `MODULE = ApiModule(...)` — the discovery entrypoint |

Guides: [add a module](docs/architecture/how-to-add-a-module.md) ·
[merge a project](docs/architecture/how-to-merge-a-project.md)

### Environment Requirements
- Node.js >= 25
- Python >= 3.12
- uv (Python package manager)
- PostgreSQL or SQLite

## Notes
- Python backend runs on port 3824 (was Node, now Python directly)
- Client webpack proxies API requests to localhost:3824
- DB lives at `data/jira.sqlite` (relative to project root)
- SQLAlchemy models defined in `planny_core.models`
- Alembic for schema migrations. The CLI is **not currently declared as a dependency**, so
  `uv run alembic` fails on a fresh clone — see finding H15 in the blueprint
- API routes are served both versioned (`/api/v1/...`) and unversioned (legacy alias). New
  work targets the versioned path; the alias exists so the client keeps working
- Infrastructure probes (`/health`) are deliberately unversioned
- Configuration has two tiers. **Bootstrap** (tier 0) is needed before the runtime
  store is reachable and is never stored: the database connection, `ADMIN_EMAIL` and
  `MASTER_KEY`. **Runtime** (tier 1) is stored in `app_setting` and editable. The last
  known-good database connection is cached at `data/bootstrap.json` (0600) so a bad
  value entered in the UI cannot lock the application out; the master key is **never**
  cached, or it would sit beside the data it protects

## Shell tool preferences
- Use `rg` instead of `grep`
- Use `fd` instead of `find`

Default to `rg` and `fd` for search and file discovery unless there is a clear technical reason not to.

Use `grep` or `find` only if:
- the expected behavior cannot be reproduced with `rg` or `fd`
- strict POSIX compatibility is explicitly required
- `rg` or `fd` are not installed

Heuristic: text/content search → `rg`, file/path discovery → `fd`.
