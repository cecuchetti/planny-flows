# AGENTS.md

## Project

Jira Clone:
- **API (Python)**: Python with FastAPI + SQLAlchemy 2.0 + Alembic
- **Client**: React/JavaScript with Webpack

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
- **Errors**: custom exception hierarchy (`planny_core/errors.py`)
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
  /planny-core       - Shared config, models, database, errors, enums
  /planny-api        - FastAPI app: routers, middleware, services, schemas
  /planny-jira       - Jira HTTP client and worklog orchestration

/client/src
  /App            - Root component
  /Project        - Feature components
  /shared         - Reusable components/hooks
  /Auth           - Authentication
```

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
- Alembic for schema migrations

## Shell tool preferences
- Use `rg` instead of `grep`
- Use `fd` instead of `find`

Default to `rg` and `fd` for search and file discovery unless there is a clear technical reason not to.

Use `grep` or `find` only if:
- the expected behavior cannot be reproduced with `rg` or `fd`
- strict POSIX compatibility is explicitly required
- `rg` or `fd` are not installed

Heuristic: text/content search → `rg`, file/path discovery → `fd`.
