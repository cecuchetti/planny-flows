# Planny-Flows Python Migration Architecture Blueprint

**Date**: 2026-07-11
**Status**: Design / Pre-implementation
**Author**: Python Backend Architect review of `planny-flows` codebase

---

## Executive Summary

The current planny-flows backend is a well-structured TypeScript/Node.js/Express monolith with clean layered architecture, dual SQLite/PostgreSQL support via TypeORM, dual Jira instance integration, and health-check endpoints. The codebase is disciplined but small enough (~2500 lines of actual business logic) to migrate incrementally without excessive risk.

Migration to Python adds immediate value: compatibility with the user's other Python projects, access to FastAPI's native OpenAPI generation, Pydantic v2's superior validation, and the broader Python data ecosystem. The migration will be progressive: both backends coexist throughout the entire transition. The current Node.js backend acts as the entry point and proxy/router — internally forwarding requests for migrated endpoints to the Python backend (port 13824) while continuing to handle non-migrated routes directly. The React client only communicates with Node (port 3824) and sees zero difference. Once migration is complete, Node can be decommissioned or remain as a lightweight proxy.

**Key Strengths of Current Codebase:**
- Clean Controller → Service → Repository separation
- Consistent error hierarchy with global handler
- Structured logging with Pino (request IDs, external API tracing)
- DI container pattern for Jira integrations (testable)
- Health/readiness/liveness endpoints for orchestration
- Env-var + YAML dual config for Jira instances

**Critical Concern:** `synchronize: true` in TypeORM means no formal migration history. Must capture current schema via Alembic before Python writes any data.

**Readiness Assessment:** Architecture is well-understood. Migration can begin immediately with Phase 1 (health + guest auth), which has zero database writes and minimal dependencies.

---

## 1. High-Level Migration Strategy

### Strangler Fig Phases

```
                          ┌──────────────────────────────┐
   Client ───────────────►│   Node Backend (port 3824)    │
 (React, port 8192)       │                              │
                          │  Migrated routes ───────────► │
                          │  (proxy via http-proxy-       │
                          │   middleware or axios)        │
                          │                              │
                          │  Non-migrated routes          │
                          │  (handled locally)            │
                          └────────────┬─────────────────┘
                                       │
                                       ▼
                          ┌──────────────────────────────┐
                          │  Python Backend (port 13824)  │
                          │  (internal, not exposed to    │
                          │   client directly)            │
                          └──────────────────────────────┘
```

La migración es progresiva: ambos backends coexisten hasta completar la migración total. El backend Node.js actual actúa como proxy/router. El cliente React solo conoce el puerto 3824. Node redirige internamente los requests de endpoints ya migrados hacia el backend Python (puerto 13824), que no está expuesto directamente al cliente.

Cuando un request llega a Node, el middleware de proxy verifica si la ruta ya fue migrada:
- **Ruta migrada**: Node reenvía el request al backend Python vía HTTP, devuelve la respuesta al cliente.
- **Ruta no migrada**: Node maneja el request normalmente con su lógica existente.

**Routing Strategy:**
- Cliente React → solo conoce Node Backend (puerto 3824)
- Python backend corre en puerto 13824 como servicio interno
- Node usa `http-proxy-middleware` (o axios para forwarding manual) para redirigir requests migrados
- Ambos backends comparten la misma base de datos (mismo connection string para PG / mismo archivo para SQLite)
- El listado de rutas migradas se configura en Node (env var o archivo de configuración)
- Revertir una ruta es cambiar la config y reiniciar Node — instantáneo, sin infraestructura externa

**Routing Architecture (Node middleware):**
```typescript
// En el middleware de proxy de Node, cada fase agrega rutas al arreglo:
const MIGRATED_PREFIXES: string[] = [
  // Phase 1
  '/health', '/health/ready', '/health/live', '/authentication/guest', '/', '/test/',
  // Phase 2 (se agregan al completar)
  // '/project', '/issues', '/comments', '/currentUser',
  // Phase 3 (se agregan al completar)
  // '/quick-actions',
  // Phase 4 (se agregan al completar)
  // '/api/v1/jira',
];

// Middleware que decide si forwardear a Python
app.use((req, res, next) => {
  const shouldProxy = MIGRATED_PREFIXES.some(prefix => req.path.startsWith(prefix));
  if (shouldProxy) {
    proxy.web(req, res, { target: PYTHON_BACKEND_URL }); // http://localhost:13824
  } else {
    next();
  }
});
```

**Migration Order (justification follows):**

| Phase | Routes | Rationale |
|-------|--------|-----------|
| **Phase 0**: Scaffold | None (parallel, no traffic) | Set up project, connect to DB read-only, verify health |
| **Phase 1**: Health + Guest Auth | `/health*`, `/authentication/guest` | Zero writes to existing tables, simple logic, verifies JWT interop |
| **Phase 2**: Core CRUD | `/project`, `/issues*`, `/comments*`, `/currentUser` | Core domain, moderate complexity, no Jira deps |
| **Phase 3**: Quick Actions | `/quick-actions/*` | Tempo export, Outlook clean; depends on Jira client (next phase) |
| **Phase 4**: Jira Integrations | `/api/v1/jira/*` | Most complex; dual instance, worklog orchestration, YAML config |

**Rollback per phase:**
- Remover el prefijo de ruta de `MIGRATED_PREFIXES` y reiniciar Node — rollback instantáneo
- Ambos backends siempre corriendo — no hay downtime
- Sin migración de datos (misma DB, mismo schema)
- Testear cada fase con el cliente React antes de declararla en producción
- Si el backend Python no responde, Node puede reintentar o fallback a manejarlo localmente

**Why this order:**
1. Phase 1 has zero side effects — validates the entire Python stack (framework, config, JWT, logging, error handling) without risking data
2. Phase 2 covers 80% of actual user interactions with moderate complexity
3. Phase 3 depends on Jira HTTP client (Phase 4), but the quick-actions controllers themselves are simpler and make good integration tests for the Jira client
4. Phase 4 is the hardest — dual Jira instances, worklog orchestration with status tracking, YAML config loading. Get everything else solid first

---

## 2. Python Tech Stack

### Framework: FastAPI

**Justification:**
- Native async support — critical for I/O-bound Jira HTTP calls and DB queries
- Pydantic v2 integration — request/response validation is first-class, not bolted on
- Automatic OpenAPI/Swagger docs — replaces need for manual API documentation
- Dependency injection system — clean replacement for Express middleware pattern
- ASGI native — works with Uvicorn out of the box, no adapter needed
- Growing ecosystem — most Starlette middleware works directly

**What we lose from Express:**
- Mature middleware ecosystem (but FastAPI + Starlette covers 95% of needs)
- Familiarity for JS devs (not relevant — this is a Python migration)

### ORM: SQLAlchemy 2.0 (sync for SQLite, async for PostgreSQL)

**Justification:**
- **SQLModel rejected**: Ties models to FastAPI patterns, less flexible for complex queries (Jira worklog JOINs across 3 tables). Good for simple CRUD, painful for existing schema with custom column names.
- **Peewee rejected**: Not async-capable, smaller ecosystem, no Alembic integration.
- **Tortoise ORM rejected**: Django-ORM style but immature, limited migration support, not battle-tested for dual SQLite/PG.
- **SQLAlchemy 2.0**: The standard. Alembic for migrations. Can do sync with SQLite and async with PostgreSQL from the same model definitions (using `sync_engine` and `async_engine`). TypeORM-like relationship patterns (`relationship()`, `back_populates`).

**Key SQLAlchemy decisions:**
```python
# Use Imperative Mapping (Table + mapper) or Declarative Base.
# For this project: Declarative Base with explicit __tablename__ and Column definitions.
# This mirrors TypeORM's decorator pattern cleanly.

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class Project(Base):
    __tablename__ = "project"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))  # mirrors TypeORM @Column('varchar')
    # ...
```

### Auth: python-jose + passlib

- **python-jose**: JWT encode/decode with HS256 matching the existing `jsonwebtoken` library behavior
- **passlib**: Not needed yet (no passwords — guest accounts only), but included for future
- **Why not FastAPI-users**: Overkill. Current auth is a single JWT verify middleware + guest account creation. FastAPI-users adds database user models, registration flows, password reset — none of which exist here.

### Validation: Pydantic v2

Already paired with FastAPI. The existing Zod schemas (used in Jira integrations for validation) map directly to Pydantic models.

```python
# Zod -> Pydantic v2 mapping:
# z.string() -> str
# z.number() -> int | float
# z.enum() -> Enum | Literal
# z.object() -> BaseModel

from pydantic import BaseModel, Field
from enum import Enum

class IssueType(str, Enum):
    TASK = "task"
    BUG = "bug"
    STORY = "story"

class CreateIssueRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    type: IssueType
    status: IssueStatus
    # ...
```

### Logging: structlog

- Direct Pino replacement: structured JSON logging, bound contexts, child loggers
- Integration with standard `logging` module (works with Uvicorn's log output)
- Request ID propagation via `structlog.contextvars.bind_contextvars(request_id=...)`

```python
import structlog

logger = structlog.get_logger()

# Equivalent to: logger.info({ requestId, method, path }, 'Incoming request')
logger.info("Incoming request", method=request.method, path=request.url.path)

# Context binding (like Pino child loggers):
log = logger.bind(user_id=user.id, project_id=project.id)
log.info("Issue created")
```

### HTTP Client: httpx

- Native async support (unlike `requests`)
- Connection pooling, timeouts, retry middleware
- API similar to `axios` — interceptors via event hooks

```python
import httpx

class JiraWorklogClient:
    def __init__(self, config: JiraInstanceConfig):
        self.base_url = config.base_url
        self.auth = httpx.BasicAuth(config.email, config.api_token)  # or Bearer
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            auth=self.auth,
            timeout=httpx.Timeout(config.timeout_ms / 1000),
            event_hooks={
                "request": [self._log_request],
                "response": [self._log_response],
            },
        )
```

### Testing: pytest + pytest-asyncio + httpx.AsyncClient

- `TestClient` (sync) or `httpx.AsyncClient` (async) for FastAPI
- Fixtures for DB setup/teardown (matching Vitest `beforeEach` patterns)
- `pytest-cov` for coverage parity with Vitest coverage

### Config Management: pydantic-settings

- `.env` file loading + env var override
- Type-safe, validated at startup
- Mirrors the `appConfig` object pattern

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    port: int = 3824
    client_url: str = "http://localhost:8192"
    db_type: Literal["postgres", "sqlite"] = "postgres"
    jwt_secret: str = "jira-clone-dev-secret"
    jwt_expires_in: str = "180 days"
    # ... all env vars

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
```

### Rate Limiting: Custom (port from TypeScript)

The existing rate limiter is a simple in-memory implementation (70 lines). Port directly — same algorithm, same headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`). Wrap as a FastAPI dependency or middleware.

### YAML Config: PyYAML

Direct replacement for `js-yaml`. Used for `jira-instances.yaml`.

### Migration Tool: Alembic

Critical for transitioning away from `synchronize: true`. See Database Architecture section.

### Dependency Summary

| Node.js | Python | Notes |
|---------|--------|-------|
| express 4.x | fastapi >= 0.110 | ASGI-native, Pydantic v2 |
| typeorm 0.3 | sqlalchemy >= 2.0 + alembic | Declarative base, async for PG |
| better-sqlite3 | aiosqlite + sqlalchemy | Via SQLAlchemy SQLite dialect |
| pg | asyncpg + sqlalchemy | Via SQLAlchemy async PG dialect |
| jsonwebtoken | python-jose[cryptography] | HS256 matching |
| pino | structlog | Structured JSON, context binding |
| axios | httpx | Async, event hooks, connection pool |
| zod | pydantic >= 2.0 | Integrated with FastAPI |
| js-yaml | pyyaml | YAML config loading |
| uuid | uuid (stdlib) | Python `uuid.uuid4()` |
| striptags | bleach or html2text | HTML tag stripping for search |
| lodash | Toolz or stdlib | Native Python covers most uses |
| express-async-handler | Built into FastAPI | FastAPI catches async exceptions natively |

---

## 3. Monorepo Structure

### Directory Layout

```
planny-flows/
├── api/                    # Existing Node backend (unchanged)
├── client/                 # Existing React client (unchanged)
├── packages/               # NEW: Python monorepo
│   ├── planny-core/        # Domain models, shared config, errors
│   │   ├── src/
│   │   │   └── planny_core/
│   │   │       ├── __init__.py
│   │   │       ├── config.py          # pydantic-settings
│   │   │       ├── database.py        # Engine/session factory
│   │   │       ├── errors.py          # Custom exceptions
│   │   │       ├── models/            # SQLAlchemy models
│   │   │       │   ├── __init__.py
│   │   │       │   ├── project.py
│   │   │       │   ├── user.py
│   │   │       │   ├── issue.py
│   │   │       │   ├── comment.py
│   │   │       │   ├── worklog_submission.py
│   │   │       │   ├── worklog_submission_result.py
│   │   │       │   ├── external_hours_daily.py
│   │   │       │   ├── daily_hours.py
│   │   │       │   └── tempo_hours_daily.py
│   │   │       ├── schemas/           # Pydantic request/response schemas
│   │   │       │   ├── __init__.py
│   │   │       │   ├── project.py
│   │   │       │   ├── issue.py
│   │   │       │   ├── comment.py
│   │   │       │   └── user.py
│   │   │       └── enums.py           # IssueType, IssueStatus, etc.
│   │   ├── pyproject.toml
│   │   └── tests/
│   │
│   ├── planny-api/          # FastAPI application (the Strangler Fig replacement)
│   │   ├── src/
│   │   │   └── planny_api/
│   │   │       ├── __init__.py
│   │   │       ├── main.py            # FastAPI app factory
│   │   │       ├── dependencies.py    # Auth, DB session DI
│   │   │       ├── middleware/
│   │   │       │   ├── __init__.py
│   │   │       │   ├── request_id.py
│   │   │       │   ├── request_logger.py
│   │   │       │   ├── rate_limiter.py
│   │   │       │   └── error_handler.py
│   │   │       ├── routers/
│   │   │       │   ├── __init__.py
│   │   │       │   ├── health.py
│   │   │       │   ├── auth.py
│   │   │       │   ├── projects.py
│   │   │       │   ├── issues.py
│   │   │       │   ├── comments.py
│   │   │       │   ├── users.py
│   │   │       │   ├── quick_actions.py
│   │   │       │   └── jira_integrations/
│   │   │       │       ├── __init__.py
│   │   │       │       ├── worklogs.py
│   │   │       │       └── issues.py
│   │   │       └── services/
│   │   │           ├── __init__.py
│   │   │           ├── issue_service.py
│   │   │           └── guest_account.py
│   │   ├── pyproject.toml
│   │   └── tests/
│   │
│   ├── planny-jira/         # Jira integration service (extractable as standalone)
│   │   ├── src/
│   │   │   └── planny_jira/
│   │   │       ├── __init__.py
│   │   │       ├── client.py          # httpx-based HTTP client
│   │   │       ├── config.py          # YAML + env loading
│   │   │       ├── worklog_service.py # Orchestration logic
│   │   │       ├── issue_service.py   # Issue search/transitions
│   │   │       └── repositories/      # DB persistence
│   │   ├── pyproject.toml
│   │   └── tests/
│   │
│   └── pyproject.toml        # Workspace root
│
├── pyproject.toml            # Root project config
├── alembic/                  # Alembic migrations (at root, manages all tables)
│   ├── env.py
│   └── versions/
├── alembic.ini
├── docker-compose.yml        # Updated with Python service
└── Dockerfile.python         # Multi-stage Python build
```

### Namespace Packages

All Python packages use the `planny_` prefix. This avoids conflicts on PyPI and clearly groups related packages.

```toml
# packages/planny-core/pyproject.toml
[project]
name = "planny-core"
version = "0.1.0"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/planny_core"]
```

### Build System: uv

```toml
# pyproject.toml (root)
[project]
name = "planny-flows"
version = "0.1.0"
requires-python = ">=3.12"

[tool.uv.workspace]
members = ["packages/*"]

[tool.uv]
dev-dependencies = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "pytest-cov>=5.0",
    "httpx>=0.27",
    "ruff>=0.4",
    "mypy>=1.10",
]
```

### How Other Python Projects Integrate

When the user migrates other small Python projects into this repo:
1. Add package to `packages/` directory
2. Add to `[tool.uv.workspace].members`
3. If it needs API, depend on `planny-core` for models/config
4. If it needs Jira, depend on `planny-jira` for HTTP client
5. Each package has its own `pyproject.toml` with its own deps

### Dockerfile Strategy

```dockerfile
# Dockerfile.python (multi-stage, uv-based)
FROM python:3.12-slim AS builder

RUN pip install uv
WORKDIR /app

# Copy workspace config and lock file
COPY pyproject.toml uv.lock ./
COPY packages/ ./packages/

# Install dependencies (production only, no dev)
RUN uv sync --frozen --no-dev

# Runtime stage
FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY packages/ ./packages/
COPY alembic/ ./alembic/
COPY alembic.ini .

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 13824

CMD ["uvicorn", "planny_api.main:app", "--host", "0.0.0.0", "--port", "13824"]
```

### CI/CD Adaptations

```yaml
# .github/workflows/python.yml (add to existing workflows)
python-checks:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/setup-python@v5
      with: { python-version: "3.12" }
    - run: pip install uv
    - run: uv sync
    - run: uv run ruff check packages/
    - run: uv run mypy packages/
    - run: uv run pytest packages/ --cov
    - run: uv run alembic check  # Verify migrations are current
```

---

## 4. Database Architecture

### SQLAlchemy Model Definitions

Direct mapping from TypeORM entities. Critical: use the exact table and column names that TypeORM generates.

```python
# packages/planny-core/src/planny_core/models/project.py
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base
from ..enums import ProjectCategory

class Project(Base):
    __tablename__ = "project"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[ProjectCategory] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    issues: Mapped[list["Issue"]] = relationship(back_populates="project")
    users: Mapped[list["User"]] = relationship(back_populates="project")
```

```python
# packages/planny-core/src/planny_core/models/issue.py
class Issue(Base):
    __tablename__ = "issue"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255))
    type: Mapped[IssueType] = mapped_column(String(50))
    status: Mapped[IssueStatus] = mapped_column(String(50))
    priority: Mapped[IssuePriority] = mapped_column(String(10))
    list_position: Mapped[float] = mapped_column(Float)  # "double precision" in TypeORM
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_spent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_remaining: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reporter_id: Mapped[int] = mapped_column(Integer)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("project.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project: Mapped["Project"] = relationship(back_populates="issues")
    comments: Mapped[list["Comment"]] = relationship(back_populates="issue", cascade="all, delete-orphan")
    users: Mapped[list["User"]] = relationship(
        secondary="issue_users_user", back_populates="issues"
    )
```

```python
# Many-to-many junction table (TypeORM generates this from @JoinTable)
# TypeORM creates: issue_users_user (issueId, userId)
issue_users = Table(
    "issue_users_user",
    Base.metadata,
    Column("issue_id", Integer, ForeignKey("issue.id"), primary_key=True),
    Column("user_id", Integer, ForeignKey("user.id"), primary_key=True),
)
```

### Alembic Migration Strategy

**The problem**: TypeORM with `synchronize: true` has been creating and modifying tables at startup. There is no migration history. The database schema is the "source of truth."

**The solution:**

1. **Capture the current schema** as the initial Alembic migration:
```bash
# Generate migration from existing database
alembic revision --autogenerate -m "initial_schema_from_typeorm"

# Verify it produces exactly the current schema
alembic upgrade head
# Compare with a fresh TypeORM startup — they must be identical
```

2. **Mark as applied** in both Node and Python:
```bash
# After verifying, stamp the database so Alembic knows this migration is applied
alembic stamp head
```

3. **Disable `synchronize: true` in Node** after Alembic takes over:
```typescript
// api/src/database/createConnection.ts
// Change: synchronize: true -> synchronize: false
// Add: migrations: ["path/to/migrations/*.ts"] (optional for Node)
// All future schema changes go through Alembic
```

4. **Migration workflow going forward:**
```
1. Developer creates Alembic migration: alembic revision -m "add_issue_labels"
2. Migration tested against both SQLite and PostgreSQL
3. On deploy: alembic upgrade head runs before app starts
4. Node backend reads same (already-migrated) tables — no conflict
```

### Handling `synchronize: true` Transition

**Phase 0 (now)**: Python connects read-only, validates schema compatibility
**Phase 1-2**: Python reads + writes to existing tables, no schema changes
**Phase 3+**: All new columns/tables go through Alembic, Node's `synchronize: false` prevents conflicts

### Index Strategy

Current TypeORM indexes (from entity decorators and `@Index`):

```python
# Issue: frequently queried by projectId + status, projectId + searchTerm
Index("ix_issue_project_status", Issue.project_id, Issue.status)
Index("ix_issue_project_title", Issue.project_id, Issue.title)
Index("ix_issue_project_description_text", Issue.project_id, Issue.description_text)

# DailyHours: unique on workDate
Index("idx_daily_hours_work_date", DailyHours.work_date, unique=True)

# Comment: frequently queried by issueId
Index("ix_comment_issue_id", Comment.issue_id)

# WorklogSubmission: unique on requestId
Index("ix_worklog_submission_request_id", WorklogSubmission.request_id, unique=True)
```

### Connection Pooling

**SQLite:**
```python
# SQLite doesn't support connection pooling well.
# Use SQLAlchemy's NullPool for SQLite (one connection per thread).
# For async: use aiosqlite with queue pool size 1.
engine = create_engine(
    f"sqlite:///{db_path}",
    poolclass=NullPool,
    connect_args={"check_same_thread": False},
)
```

**PostgreSQL:**
```python
# Use asyncpg connection pool (20 connections, matching PG defaults)
async_engine = create_async_engine(
    f"postgresql+asyncpg://{user}:{pass}@{host}:{port}/{db}",
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,  # Verify connections before use
    pool_recycle=3600,   # Recycle after 1 hour
)
```

### Dual ORM Coexistence Risks

| Risk | Mitigation |
|------|------------|
| TypeORM and SQLAlchemy cache stale data | Use short-lived sessions; rely on DB-level constraints |
| Different transaction isolation levels | Use READ COMMITTED (default for both PG and SQLite) |
| TypeORM's `@BeforeInsert` hooks (striptags) not replicated | Implement as SQLAlchemy `@validates` or `before_insert` event listener |
| Enum values differ between ORMs | Use the same string values; store as VARCHAR, not native enums |
| Auto-increment ID conflicts | Both use DB-native auto-increment — no conflict |
| Timestamp precision differences | Both use `datetime` type; Python uses `datetime.utcnow` matching Node's `Date` |

**striptags hook replication:**
```python
# Replicate TypeORM's @BeforeInsert/@BeforeUpdate descriptionText generation
from sqlalchemy import event
import bleach  # or html2text

@event.listens_for(Issue, "before_insert")
@event.listens_for(Issue, "before_update")
def set_description_text(mapper, connection, target):
    if target.description:
        target.description_text = bleach.clean(
            target.description, tags=[], strip=True
        )
```

---

## 5. API Design

### Route Structure (exact match)

```python
# packages/planny-api/src/planny_api/routers/health.py
router = APIRouter(tags=["health"])

@router.get("/health")
async def health_check(request: Request, db: AsyncSession = Depends(get_db)):
    """Health check with DB and Jira integration status."""
    # ... matches Express /health exactly
```

All routes use the same paths, HTTP methods, and query parameters as the Express routes. The React client must see zero difference.

### FastAPI Dependency Injection

```python
# packages/planny-api/src/planny_api/dependencies.py
from fastapi import Depends, Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from planny_core.database import async_session_factory
from planny_core.models import User

security = HTTPBearer()

async def get_db() -> AsyncSession:
    """FastAPI dependency: provides a database session per request."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency: authenticates request and returns User."""
    token = credentials.credentials
    # Verify JWT and extract user_id
    payload = verify_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise InvalidTokenError()

    user = await db.get(User, int(user_id))
    if not user:
        raise InvalidTokenError("User not found")
    return user
```

Controllers become FastAPI path operations with injected dependencies:

```python
# packages/planny-api/src/planny_api/routers/issues.py
router = APIRouter(prefix="/issues", tags=["issues"])

@router.get("")
async def get_project_issues(
    searchTerm: str | None = Query(None, alias="searchTerm"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    issues = await issue_service.search_by_project(
        db, current_user.project_id, searchTerm
    )
    return {"issues": [issue_to_dict(i) for i in issues]}

@router.get("/{issue_id}")
async def get_issue(
    issue_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    issue = await issue_service.find_by_id_and_project(
        db, issue_id, current_user.project_id
    )
    # Eager load users, comments, comments.user
    return {"issue": issue_to_dict(issue, include_users=True, include_comments=True)}
```

### Error Response Format

Must match exactly:
```json
{
  "error": {
    "message": "Issue not found.",
    "code": "ENTITY_NOT_FOUND",
    "status": 404,
    "data": {}
  },
  "requestId": "req_a1b2c3d4e5f6"
}
```

```python
# packages/planny-core/src/planny_core/errors.py
class AppError(Exception):
    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        status_code: int = 500,
        data: dict | None = None,
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.data = data or {}

class EntityNotFoundError(AppError):
    def __init__(self, entity_name: str):
        super().__init__(
            f"{entity_name} not found.",
            code="ENTITY_NOT_FOUND",
            status_code=404,
        )

# ... RouteNotFoundError, BadUserInputError, InvalidTokenError, etc.

# packages/planny-api/src/planny_api/middleware/error_handler.py
from fastapi import Request
from fastapi.responses import JSONResponse
from planny_core.errors import AppError

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    status_code = exc.status_code

    # Skip logging for auth failures (matching Node behavior)
    if status_code != 401:
        logger.warning(
            "Request error",
            request_id=request_id,
            code=exc.code,
            status=status_code,
            message=exc.message,
        )

    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "message": exc.message,
                "code": exc.code,
                "status": status_code,
                "data": exc.data,
            },
            "requestId": request_id,
        },
    )
```

### OpenAPI / Swagger

FastAPI generates OpenAPI schema automatically from Pydantic models and route definitions. Available at `/docs` (Swagger UI) and `/redoc` (ReDoc).

The existing Express app has no API documentation beyond the code itself. FastAPI provides this for free — a significant upgrade.

---

## 6. Jira Integration Architecture

### Porting Strategy

The Jira integration is the most complex part. Architecture: DI container with HTTP client abstraction, dual instance support (Internal/Tempo + External client Jira), YAML config loading, worklog orchestration with status tracking.

**Port plan:**

1. **HTTP Client**: `Axios` → `httpx.AsyncClient` with event hooks for logging
2. **DI Container**: `JiraContainer` (TS class) → FastAPI dependencies + simple factory function
3. **Config**: `js-yaml` → `PyYAML` with env var interpolation (same `${VAR}` syntax)
4. **Domain types/interfaces**: TypeScript interfaces → Python `Protocol` classes (structural subtyping)
5. **Worklog Service**: Direct port of orchestration logic
6. **Repositories**: TypeORM repositories → SQLAlchemy async sessions

### httpx Client

```python
# packages/planny-jira/src/planny_jira/client.py
import httpx
import structlog
from dataclasses import dataclass
from typing import Literal

logger = structlog.get_logger()

@dataclass
class JiraInstanceConfig:
    base_url: str
    auth_type: Literal["basic", "bearer"]
    email: str | None = None
    api_token: str | None = None
    timeout_ms: int = 5000
    system_name: str = "external-jira"
    fixed_issue_key: str | None = None
    my_account_id: str | None = None

class JiraHttpClient:
    """Async HTTP client for Jira API with logging interceptors."""

    def __init__(self, config: JiraInstanceConfig):
        self.config = config
        self.system_name = config.system_name

        auth = None
        if config.auth_type == "bearer" and config.api_token:
            auth = BearerAuth(config.api_token)
        elif config.auth_type == "basic" and config.email and config.api_token:
            auth = httpx.BasicAuth(config.email, config.api_token)

        self._client = httpx.AsyncClient(
            base_url=config.base_url,
            auth=auth,
            timeout=httpx.Timeout(config.timeout_ms / 1000),
            event_hooks={
                "request": [self._log_request],
                "response": [self._log_response],
            },
        )

    async def _log_request(self, request: httpx.Request):
        logger.debug(
            "External API request",
            system=self.system_name,
            method=request.method,
            url=str(request.url),
        )

    async def _log_response(self, response: httpx.Response):
        request = response.request
        duration_ms = response.elapsed.total_seconds() * 1000
        log_method = logger.debug if response.status_code < 400 else logger.warning
        log_method(
            "External API response",
            system=self.system_name,
            method=request.method,
            url=str(request.url),
            status_code=response.status_code,
            duration_ms=round(duration_ms),
        )

    async def get(self, path: str, **kwargs) -> dict:
        response = await self._client.get(path, **kwargs)
        response.raise_for_status()
        return response.json()

    async def post(self, path: str, json_data: dict | None = None, **kwargs) -> dict:
        response = await self._client.post(path, json=json_data, **kwargs)
        response.raise_for_status()
        return response.json()

    async def close(self):
        await self._client.aclose()
```

### DI Container → FastAPI Dependencies

TypeScript DI container becomes a FastAPI dependency function with `lru_cache`:

```python
# packages/planny-api/src/planny_api/dependencies.py (continued)
from functools import lru_cache
from planny_jira.client import JiraHttpClient, JiraInstanceConfig
from planny_jira.worklog_service import WorklogService
from planny_jira.config import get_jira_instance_config, get_worklog_instance_names

@lru_cache()
def get_jira_worklog_service() -> WorklogService:
    """Singleton-like: creates WorklogService with both Jira clients."""
    names = get_worklog_instance_names()
    internal_config = get_jira_instance_config(names["internal"])
    external_config = get_jira_instance_config(names["external"])

    internal_client = JiraHttpClient(internal_config)
    external_client = JiraHttpClient(external_config)

    return WorklogService(
        internal_client=internal_client,
        external_client=external_client,
        tempo_issue_key=internal_config.fixed_issue_key or "VIS-2",
        external_account_id=external_config.my_account_id,
    )
```

### Worklog Orchestration Port

The existing `WorklogService` in TypeScript is ~250 lines of pure logic with clear inputs/outputs. Direct port:

```python
# packages/planny-jira/src/planny_jira/worklog_service.py
import uuid
from dataclasses import dataclass
from enum import Enum
from planny_jira.client import JiraHttpClient

class WorklogTarget(str, Enum):
    TEMPO = "TEMPO"
    JIRA = "JIRA"
    BOTH = "BOTH"

@dataclass
class CreateWorklogRequest:
    target: WorklogTarget
    external_issue_key: str | None = None
    work_date: str | None = None
    started_at: str | None = None
    time_spent_seconds: int = 0
    description: str = ""

class WorklogService:
    def __init__(
        self,
        internal_client: JiraHttpClient,
        external_client: JiraHttpClient,
        tempo_issue_key: str,
        external_account_id: str | None = None,
    ):
        self.internal = internal_client
        self.external = external_client
        self.tempo_issue_key = tempo_issue_key
        self.external_account_id = external_account_id

    async def create_worklog(
        self, request: CreateWorklogRequest, db: AsyncSession
    ) -> dict:
        request_id = f"wlr_{uuid.uuid4().hex[:8]}"
        # ... orchestration logic (direct port from TS)
        # Creates submission record, calls internal/external clients,
        # tracks results, updates ExternalHoursDaily
```

---

## 7. Middleware & Cross-Cutting Concerns

### Request ID Middleware

```python
# packages/planny-api/src/planny_api/middleware/request_id.py
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id")
        if not request_id:
            request_id = f"req_{uuid.uuid4().hex[:16]}"

        request.state.request_id = request_id
        request.headers.__dict__["x-request-id"] = request_id  # propagate

        structlog.contextvars.bind_contextvars(request_id=request_id)

        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response
```

### Request Logger Middleware

```python
# packages/planny-api/src/planny_api/middleware/request_logger.py
import time
from starlette.middleware.base import BaseHTTPMiddleware

class RequestLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.monotonic()
        request_id = getattr(request.state, "request_id", "unknown")

        logger.info(
            "Incoming request",
            method=request.method,
            path=request.url.path,
            query=str(request.query_params),
        )

        response = await call_next(request)

        duration_ms = round((time.monotonic() - start_time) * 1000)
        log_method = logger.warning if response.status_code >= 400 else logger.debug
        log_method(
            "Request completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response
```

### Rate Limiter (ported from TypeScript)

```python
# packages/planny-api/src/planny_api/middleware/rate_limiter.py
import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

class InMemoryRateLimiter:
    """Direct port of the TypeScript in-memory rate limiter."""

    def __init__(self, window_ms: int, max_requests: int):
        self.window_ms = window_ms
        self.max_requests = max_requests
        self.store: dict[str, tuple[int, float]] = {}  # IP -> (count, reset_at)

    def is_allowed(self, client_ip: str) -> tuple[bool, int, int]:
        now = time.time() * 1000
        key = client_ip or "unknown"

        if key not in self.store:
            self.store[key] = (1, now + self.window_ms)
            return True, self.max_requests - 1, self.window_ms // 1000

        count, reset_at = self.store[key]
        if now > reset_at:
            self.store[key] = (1, now + self.window_ms)
            return True, self.max_requests - 1, self.window_ms // 1000

        count += 1
        self.store[key] = (count, reset_at)
        remaining = max(0, self.max_requests - count)
        reset_seconds = int((reset_at - now) / 1000)

        if count > self.max_requests:
            return False, 0, reset_seconds
        return True, remaining, reset_seconds
```

### JWT Authentication Middleware

FastAPI handles this via dependency injection rather than middleware. The `get_current_user` dependency (shown in Section 5) is applied to protected routes via `Depends()`.

### Global Error Handler

Registered on the FastAPI app:

```python
# In main.py
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(HTTPException, http_exception_handler)  # FastAPI built-in
app.add_exception_handler(Exception, unhandled_exception_handler)
```

### FastAPI App Assembly

```python
# packages/planny-api/src/planny_api/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from planny_core.config import settings
from .middleware.request_id import RequestIDMiddleware
from .middleware.request_logger import RequestLoggerMiddleware
from .routers import health, auth, projects, issues, comments, users, quick_actions

def create_app() -> FastAPI:
    app = FastAPI(
        title="Planny API",
        version="1.0.0",
        docs_url="/docs" if settings.env != "production" else None,
    )

    # CORS (exact origin list from Node config)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Custom middleware (order matters)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(RequestLoggerMiddleware)

    # Public routes
    app.include_router(health.router)
    app.include_router(auth.router)

    # Protected routes (auth dependency on router level)
    app.include_router(
        projects.router,
        dependencies=[Depends(get_current_user)],
    )
    app.include_router(issues.router, dependencies=[Depends(get_current_user)])
    app.include_router(comments.router, dependencies=[Depends(get_current_user)])
    app.include_router(users.router, dependencies=[Depends(get_current_user)])
    app.include_router(quick_actions.router, dependencies=[Depends(get_current_user)])

    # Error handlers
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    return app

app = create_app()
```

---

## 8. Migration Phases (Detailed)

### Phase 0: Project Scaffold (no traffic routing)

**Goal**: Python project exists, connects to DB read-only, all models defined, health check works.

**Tasks:**
1. Initialize monorepo with uv
2. Create `planny-core` package with all 9 SQLAlchemy models
3. Create `planny-api` package with FastAPI app skeleton
4. Create `planny-jira` package skeleton
5. Set up Alembic, generate initial migration from existing DB
6. Write `GET /health` and verify it returns same JSON as Node

**Verification:**
```bash
# Start both backends
cd api && npm start          # Node on 3824
cd packages && uv run uvicorn planny_api.main:app --port 13824  # Python on 13824

# Compare health responses
curl http://localhost:3824/health | jq .
curl http://localhost:13824/health | jq .
# Must be identical except timestamp
```

**Files created:**
```
pyproject.toml (root)
packages/pyproject.toml (workspace)
packages/planny-core/pyproject.toml
packages/planny-core/src/planny_core/__init__.py
packages/planny-core/src/planny_core/config.py
packages/planny-core/src/planny_core/database.py
packages/planny-core/src/planny_core/errors.py
packages/planny-core/src/planny_core/enums.py
packages/planny-core/src/planny_core/models/ (9 files)
packages/planny-api/pyproject.toml
packages/planny-api/src/planny_api/main.py
packages/planny-api/src/planny_api/middleware/request_id.py
packages/planny-api/src/planny_api/middleware/request_logger.py
packages/planny-api/src/planny_api/middleware/error_handler.py
packages/planny-api/src/planny_api/routers/health.py
packages/planny-api/src/planny_api/dependencies.py
alembic.ini
alembic/env.py
alembic/versions/001_initial_schema_from_typeorm.py
```

### Phase 1: Health + Guest Auth

**Routes moved:**
- `GET /health`, `GET /health/ready`, `GET /health/live`
- `POST /authentication/guest`
- `GET /` (redirect)
- `DELETE /test/reset-database`, `POST /test/create-account` (test env only)

**What stays on Node**: Everything else.

**Testing strategy:**
- Unit tests for guest account creation (matches Node: find existing guest or seed new project)
- Integration test: call Python `/health` and `/authentication/guest`, verify JWT token works with Node middleware
- Verify the returned `authToken` can be used on Node's `/currentUser` endpoint

**Cutover mechanism:**
```typescript
// Agregar al arreglo MIGRATED_PREFIXES en el middleware de proxy de Node:
const MIGRATED_PREFIXES: string[] = [
  '/health',                  // GET /health, /health/ready, /health/live
  '/authentication/guest',    // POST /authentication/guest
  '/',                        // GET / redirect
  '/test/',                   // DELETE /test/reset-database, POST /test/create-account
];
// Node automáticamente forwardea estas rutas al backend Python (port 13824).
// El resto de las rutas siguen manejándose en Node normalmente.
```

### Phase 2: Core CRUD

**Routes moved:**
- `GET /project`, `PUT /project`
- `GET /issues`, `GET /issues/:issueId`, `POST /issues`, `PUT /issues/:issueId`, `DELETE /issues/:issueId`
- `POST /comments`, `PUT /comments/:commentId`, `DELETE /comments/:commentId`
- `GET /currentUser`

**What stays on Node**: Quick Actions, Jira Integrations

**Python services needed:**
- `IssueService` with search (LIKE on title + descriptionText)
- `GuestAccountService` (create, seed project/users/issues/comments)
- Generic `find_entity_or_throw`, `update_entity`, `create_entity`, `delete_entity`
- `striptags` equivalent: use `bleach` library or `html2text` with `body_width=0`

**Testing strategy:**
- Create guest account via Python, use returned JWT for all CRUD tests
- Compare Python responses with Node responses byte-for-byte for same inputs
- Test issue search with various searchTerm values
- Test comment CRUD with project scoping (comment must belong to issue in user's project)
- Test listPosition auto-calculation for new issues

**Cutover mechanism:**
```typescript
// Phase 1 prefixes + Phase 2 prefixes:
const MIGRATED_PREFIXES: string[] = [
  // Phase 1
  '/health', '/authentication/guest', '/', '/test/',
  // Phase 2
  '/project', '/issues', '/comments', '/currentUser',
];
// Node forwardea todas estas rutas al backend Python.
// Solo Quick Actions y Jira Integrations quedan en Node.
```

### Phase 3: Quick Actions

**Routes moved:**
- `GET /quick-actions/actions/outlook-clean/status`
- `POST /quick-actions/actions/outlook-clean`
- `GET /quick-actions/actions/tempo-export/hours`
- `GET /quick-actions/actions/tempo-export/week`
- `PUT /quick-actions/actions/tempo-export/hours`
- `POST /quick-actions/actions/tempo-export`

**Dependencies**: Requires `planny-jira` package with `JiraHttpClient` and `WorklogService`.

**Python services needed:**
- Outlook clean background task (use `asyncio.create_task` or `BackgroundTasks`)
- Tempo export service (uses `WorklogService`)
- `TempoHoursRepository` (SQLAlchemy port)
- Rate limiter dependency on Tempo routes

**Testing strategy:**
- Mock external HTTP calls (Outlook cleaner, Jira API)
- Test in-memory rate limiter: exceed limit, verify 429 response
- Test Outlook clean state machine transitions (idle → running → success/failed)

### Phase 4: Jira Integrations

**Routes moved:**
- `POST /api/v1/jira/worklogs`
- `GET /api/v1/jira/worklogs`
- `GET /api/v1/jira/worklogs/hours-by-date`
- `PATCH /api/v1/jira/worklogs/hours-by-date/:date`
- `GET /api/v1/jira/issues`
- `GET /api/v1/jira/issues/:issueKey`
- `GET /api/v1/jira/issues/:issueKey/transitions`
- `POST /api/v1/jira/issues/:issueKey/transitions`

**Dependencies**: Full `planny-jira` package.

**Python services needed:**
- Complete `JiraHttpClient` (GET, POST with auth)
- Complete `WorklogService` with dual instance orchestration
- `SubmissionRepository`, `ExternalHoursDailyRepository`
- `JiraIssueClient` for issue search and transitions
- YAML config loader with env var interpolation

**Testing strategy:**
- Unit test `WorklogService` with mocked clients
- Integration test with real Jira API (if credentials available in test env)
- Test YAML config fallback (YAML file → env vars)
- Test worklog status transitions (PENDING → SUCCESS/FAILED/PARTIAL_SUCCESS)

**Cutover mechanism:**
```typescript
// Migración completa: todas las rutas van a Python.
const MIGRATED_PREFIXES: string[] = ['/'];
// Node forwardea todos los requests al backend Python (port 13824).
// Node sigue corriendo en 3824 solo como proxy/fallback.
// Si se necesita rollback, cambiar a MIGRATED_PREFIXES = [] y reiniciar.
```

---

## 9. Risks & Mitigations

### Dual ORM Access

**Risk**: TypeORM and SQLAlchemy write to the same tables simultaneously. Race conditions on auto-increment IDs, inconsistent transaction handling.

**Mitigation:**
- Route-based segregation: never have both ORMs writing to the same table at the same time
- Each route is either fully on Node OR fully on Python — never split
- During Phase 1-3, Python writes only to `user` and `project` tables after Phase 1 cutover; Node still writes to `issue` and `comment`
- Use DB-level constraints as safety net (foreign keys, unique indexes)
- Monitor for deadlocks in PostgreSQL logs

### JWT Token Compatibility

**Risk**: Python-generated JWTs must be verifiable by Node and vice versa.

**Mitigation:**
- Use exact same algorithm (HS256), secret, and claim structure
- Same `sub` claim (user ID as string or number — verify both handle it)
- Same expiration format (`"180 days"` → Python `timedelta(days=180)`)
- Test: Python creates token → Node verifies it → 200 response
- Test: Node creates token → Python verifies it → 200 response

```python
# JWT verification — must match Node's jsonwebtoken verify
from jose import jwt, JWTError

def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
        )
        return payload
    except JWTError:
        raise InvalidTokenError()
```

### Response Format Drift

**Risk**: Python response differs from Node in key shape, casing, or null handling.

**Mitigation:**
- Create a "response snapshot" test suite: record Node responses for all endpoints with known data, replay against Python, compare JSON
- Use `snapshottest` or custom dict comparison
- Key fields to watch: `userIds` (array of numbers), `listPosition` (float), enum values (string), `createdAt`/`updatedAt` (ISO 8601 format)
- Serializer functions must match: `pick(issue, ['id', 'title', ...])` → Python dict comprehension

```python
def issue_partial(issue: Issue) -> dict:
    """Exact match for TypeScript issuePartial serializer."""
    return {
        "id": issue.id,
        "title": issue.title,
        "type": issue.type,
        "status": issue.status,
        "priority": issue.priority,
        "listPosition": issue.list_position,
        "createdAt": issue.created_at.isoformat() if issue.created_at else None,
        "updatedAt": issue.updated_at.isoformat() if issue.updated_at else None,
        "userIds": [u.id for u in issue.users] if issue.users else [],
    }
```

### Database Migration Conflicts

**Risk**: Alembic migration and TypeORM `synchronize` both try to modify schema.

**Mitigation:**
- After Phase 0: set `synchronize: false` in TypeORM
- All schema changes from that point go through Alembic migrations
- `alembic upgrade head` runs before Python app starts
- Node starts after DB is migrated (or uses migration-ready tables)
- If Node must add a column: do it via raw SQL migration (Alembic) before TypeORM code change

### Performance Regression

**Risk**: Python async might be slower than Node's event loop for certain workloads.

**Mitigation:**
- Benchmark both backends with `wrk` or `oha` on the same hardware
- Target: Python 90%+ of Node throughput for same routes
- SQLAlchemy async overhead: use `selectinload` for eager loading (matching TypeORM `relations`)
- Connection pooling: ensure pool size matches expected concurrency
- Profile with `py-spy` if performance gap appears
- For CPU-heavy operations: offload to thread pool executor

---

## 10. Recommended First Step

### Concrete First Task: Scaffold Phase 0

```bash
# 1. Install uv if not present
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. Create Python project structure from planny-flows root
mkdir -p packages/planny-core/src/planny_core/models
mkdir -p packages/planny-api/src/planny_api/{middleware,routers,services}
mkdir -p packages/planny-jira/src/planny_jira
mkdir -p alembic/versions

# 3. Initialize root pyproject.toml
cat > pyproject.toml << 'EOF'
[project]
name = "planny-flows"
version = "0.1.0"
requires-python = ">=3.12"

[tool.uv.workspace]
members = ["packages/*"]

[tool.uv]
dev-dependencies = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
    "ruff>=0.4",
    "mypy>=1.10",
]
EOF

# 4. Initialize planny-core package
cat > packages/planny-core/pyproject.toml << 'EOF'
[project]
name = "planny-core"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "sqlalchemy>=2.0",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "python-jose[cryptography]>=3.3",
    "structlog>=24.0",
    "pyyaml>=6.0",
    "bleach>=6.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/planny_core"]
EOF

# 5. Initialize planny-api package
cat > packages/planny-api/pyproject.toml << 'EOF'
[project]
name = "planny-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "planny-core",
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "httpx>=0.27",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/planny_api"]
EOF

# 6. Install everything
uv sync
```

### First File to Create

`packages/planny-core/src/planny_core/errors.py` — the error hierarchy is the foundation everything else builds on.

```python
"""Custom error hierarchy matching the TypeScript customErrors.ts."""
from typing import Any


class AppError(Exception):
    """Base application error. Mirrors TypeScript CustomError."""

    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        status_code: int = 500,
        data: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.code = code
        self.status_code = status_code
        self.data = data or {}
        super().__init__(message)


class RouteNotFoundError(AppError):
    def __init__(self, original_url: str) -> None:
        super().__init__(
            f"Route '{original_url}' does not exist.",
            code="ROUTE_NOT_FOUND",
            status_code=404,
        )


class EntityNotFoundError(AppError):
    def __init__(self, entity_name: str) -> None:
        super().__init__(
            f"{entity_name} not found.",
            code="ENTITY_NOT_FOUND",
            status_code=404,
        )


class BadUserInputError(AppError):
    def __init__(self, error_data: dict[str, Any]) -> None:
        super().__init__(
            "There were validation errors.",
            code="BAD_USER_INPUT",
            status_code=400,
            data=error_data,
        )


class InvalidTokenError(AppError):
    def __init__(
        self, message: str = "Authentication token is invalid."
    ) -> None:
        super().__init__(
            message,
            code="INVALID_TOKEN",
            status_code=401,
        )


class IntegrationUnavailableError(AppError):
    def __init__(
        self, message: str = "Integration is not available."
    ) -> None:
        super().__init__(
            message,
            code="INTEGRATION_UNAVAILABLE",
            status_code=503,
        )


class ExternalServiceError(AppError):
    def __init__(self, message: str, service: str) -> None:
        super().__init__(
            message,
            code="EXTERNAL_SERVICE_ERROR",
            status_code=502,
            data={"service": service},
        )
```

### How to Verify It Works Alongside Node

```bash
# Terminal 1: Start Node backend (existing)
cd api && npm start
# → API server started on port 3824

# Terminal 2: Start Python backend
uv run uvicorn planny_api.main:app --host 0.0.0.0 --port 13824 --reload
# → Uvicorn running on http://0.0.0.0:13824

# Terminal 3: Verify
curl -s http://localhost:13824/health | jq .
# Should return: {"status": "healthy", "timestamp": "...", "checks": [...]}

curl -s http://localhost:3824/health | jq .
# Compare — should be structurally identical

# Verify JWT interop
curl -s -X POST http://localhost:3824/authentication/guest | jq .authToken > /tmp/node_token
TOKEN=$(cat /tmp/node_token | tr -d '"')
curl -s http://localhost:3824/currentUser -H "Authorization: Bearer $TOKEN" | jq .
# Works with Node token on Node

# When Phase 1 is implemented:
curl -s http://localhost:13824/currentUser -H "Authorization: Bearer $TOKEN" | jq .
# Should work with Node-issued token on Python backend
```

---

## Appendix A: Complete Dependency Mapping

| Express/Middleware | FastAPI Equivalent |
|---|---|
| `app.use(cors())` | `app.add_middleware(CORSMiddleware)` |
| `app.use(express.json())` | Built-in (Starlette) |
| `app.use(addRequestId())` | Custom `RequestIDMiddleware` |
| `app.use(requestLogger())` | Custom `RequestLoggerMiddleware` |
| `app.use(authenticateUser)` | `Depends(get_current_user)` on router |
| `app.use(handleError)` | `app.add_exception_handler()` |
| `res.respond(data)` | `return data` (FastAPI auto-serializes) |
| `catchErrors(fn)` | Built-in async exception handling |

## Appendix B: Environment Variables

All existing env vars are reused unchanged. Python reads them via `pydantic-settings`.

```
# Unchanged from existing .env
PORT=13824
CLIENT_URL=http://localhost:8192
DB_TYPE=sqlite                          # or postgres
DB_PATH=./data/jira.sqlite
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=
DB_DATABASE=jira_clone
JWT_SECRET=jira-clone-dev-secret
JWT_EXPIRES_IN=180 days
APP_DEFAULT_TIMEZONE=America/Argentina/Cordoba
INTERNAL_ATLASSIAN_BASE_URL=...
INTERNAL_JIRA_AUTH_TYPE=basic
INTERNAL_JIRA_EMAIL=...
INTERNAL_JIRA_API_TOKEN=...
INTERNAL_JIRA_FIXED_ISSUE_KEY=VIS-2
EXTERNAL_ATLASSIAN_BASE_URL=...
EXTERNAL_JIRA_AUTH_TYPE=basic
EXTERNAL_JIRA_EMAIL=...
EXTERNAL_JIRA_API_TOKEN=...
EXTERNAL_MY_ACCOUNT_ID=...
HTTP_CONNECT_TIMEOUT_MS=5000
HTTP_READ_TIMEOUT_MS=10000
OUTLOOK_CLEANER_URL=https://outlook-cleaner.fly.dev/api/v1/trigger-clean
OUTLOOK_CLEANER_API_KEY=...
QUICK_ACTIONS_WORKDAY_HOURS=8
QUICK_ACTIONS_WORKLOG_START_TIME=19:30
QUICK_ACTIONS_WORKLOG_DEFAULT_DESCRIPTION=Working on issue {issueKey}
```

## Appendix C: TypeORM → SQLAlchemy Type Mapping

| TypeORM | SQLAlchemy | Notes |
|---------|------------|-------|
| `@PrimaryGeneratedColumn()` | `mapped_column(primary_key=True, autoincrement=True)` | Integer auto-increment |
| `@Column('varchar')` | `mapped_column(String)` | Default length varies |
| `@Column('varchar', { length: 2000 })` | `mapped_column(String(2000))` | |
| `@Column('text')` | `mapped_column(Text)` | |
| `@Column('integer')` | `mapped_column(Integer)` | |
| `@Column('double precision')` | `mapped_column(Float)` | listPosition |
| `@Column('decimal', { precision: 6, scale: 2 })` | `mapped_column(Numeric(6, 2))` | hoursLogged |
| `@CreateDateColumn({ type: 'datetime' })` | `mapped_column(DateTime, default=datetime.utcnow)` | |
| `@UpdateDateColumn({ type: 'datetime' })` | `mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)` | |
| `@ManyToOne(() => X)` | `mapped_column(ForeignKey("x.id"))` + `relationship()` | |
| `@OneToMany(() => X, x => x.parent)` | `relationship(back_populates="parent")` | |
| `@ManyToMany(() => X)` | `relationship(secondary="junction_table")` | |
| `@JoinTable()` | `Table("junction_table", ...)` | Explicit junction table |
| `@RelationId(...)` | Direct FK column access (`issue.user_ids` via relationship) | |
| `@BeforeInsert()` | `@event.listens_for(Model, "before_insert")` | |
| `@Index("name", ["col"], { unique: true })` | `Index("name", Model.col, unique=True)` | |

---

## Appendix D: Prioritized Implementation Checklist

### Must-fix (Phase 0 prerequisites)
- [ ] Install uv, scaffold monorepo
- [ ] Run `alembic revision --autogenerate` to capture current schema
- [ ] Set `synchronize: false` in TypeORM after Alembic stamp
- [ ] Verify Python can connect to existing database read-only

### Should-fix (Phase 1-2)
- [ ] Implement all 9 SQLAlchemy models with exact column/table names
- [ ] Implement error hierarchy (`AppError` and subclasses)
- [ ] Implement request ID + request logger middleware
- [ ] Implement JWT sign/verify matching Node behavior
- [ ] Implement `/health`, `/authentication/guest`, `/` redirect
- [ ] Implement core CRUD (Project, Issue, Comment, currentUser)
- [ ] Write response snapshot tests against Node output
- [ ] Set up proxy (Nginx/Traefik) for traffic splitting

### Nice-to-have
- [ ] OpenTelemetry tracing for cross-backend request tracking
- [ ] Prometheus metrics endpoint (`/metrics`)
- [ ] Redis-based rate limiter (replace in-memory for multi-instance)
- [ ] API versioning strategy (`/api/v2/` for future breaking changes)
- [ ] Automated migration testing (run Alembic, start both backends, run integration tests)
- [ ] Async background task queue (Dramatiq or ARQ) for Outlook clean (currently in-process with exponential backoff)

---

*End of architecture document. This blueprint is ready for Phase 0 implementation.*
