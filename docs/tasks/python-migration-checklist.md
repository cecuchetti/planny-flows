# Python Migration Checklist

Tickets located in `docs/tasks/`. When a ticket is completed, move its `.md` file to `docs/tasks/done/` and check all its items here. Each ticket has detailed requirements, success criteria, and dependencies.

## Ticket Index

| # | Ticket | Type | Priority | Blocks |
|---|--------|------|----------|--------|
| 1 | [FEATURE-001](feature_python_migration_monorepo_scaffold.md) | feature | high | Phase 0 |
| 2 | [FEATURE-002](feature_python_migration_planny_core_errors_enums_config.md) | feature | high | Phase 0 |
| 3 | [FEATURE-003](feature_python_migration_models_alembic.md) | feature | high | Phase 0 |
| 4 | [FEATURE-004](feature_python_migration_fastapi_middleware_health.md) | feature | high | Phase 0 |
| 5 | [FEATURE-005](feature_python_migration_health_guest_auth.md) | feature | high | Phase 1 |
| 6 | [FEATURE-006](feature_python_migration_node_proxy_middleware.md) | feature | high | Phase 1 |
| 7 | [FEATURE-007](feature_python_migration_current_user_project_crud.md) | feature | high | Phase 2 |
| 8 | [FEATURE-008](feature_python_migration_issues_crud.md) | feature | high | Phase 2 |
| 9 | [FEATURE-009](feature_python_migration_comments_crud.md) | feature | medium | Phase 2 |
| 10 | [FEATURE-010](feature_python_migration_quick_actions.md) | feature | medium | Phase 3 |
| 11 | [FEATURE-011](feature_python_migration_jira_http_client_config.md) | feature | high | Phase 4 |
| 12 | [FEATURE-012](feature_python_migration_jira_worklog_service.md) | feature | high | Phase 4 |
| 13 | [FEATURE-013](feature_python_migration_jira_issue_routes.md) | feature | medium | Phase 4 |
| 14 | [DEBT-001](debt_python_migration_remove_node_backend.md) | debt | low | Cleanup |
| 15 | [DEBT-002](debt_python_migration_docker_ci.md) | debt | medium | Infra |
| 16 | [FEATURE-014](feature_python_migration_monitoring_deferred.md) | feature | low | Deferred |

---

## Phase 0: Scaffold (no traffic routing)

**Ticket: FEATURE-001**

- [ ] Install `uv` (Python package manager)
- [ ] Initialize root `pyproject.toml` with uv workspace config
- [ ] Create `packages/pyproject.toml` (workspace root)
- [ ] Scaffold `planny-core`, `planny-api`, `planny-jira` packages with `hatchling` build
- [ ] Create `alembic/` directory, `alembic.ini`, `alembic/env.py`
- [ ] Create `.env.example` with all variables and defaults
- [ ] Verify: `uv sync` installs all dependencies, all 3 packages importable

**Ticket: FEATURE-002**

- [ ] Implement `planny_core/errors.py` — `AppError` + 6 subclasses matching Node
- [ ] Implement `planny_core/enums.py` — IssueType, IssueStatus, IssuePriority, ProjectCategory
- [ ] Implement `planny_core/config.py` — `Settings` via pydantic-settings reading `.env`
- [ ] Implement `planny_core/database.py` — SQLAlchemy engines (SQLite + PostgreSQL), `async_session_factory`, `Base`
- [ ] Verify: DB connects to existing database read-only

**Ticket: FEATURE-003**

- [ ] Implement all 9 SQLAlchemy models: Project, User, Issue, Comment, WorklogSubmission, WorklogSubmissionResult, ExternalHoursDaily, DailyHours, TempoHoursDaily
- [ ] Implement `issue_users_user` junction table (Issue-User many-to-many)
- [ ] Implement striptags SQLAlchemy event listener for `description_text`
- [ ] Run `alembic revision --autogenerate -m "initial_schema_from_typeorm"`
- [ ] Run `alembic stamp head` to mark migration applied
- [ ] Set `synchronize: false` in TypeORM config (`api/src/database/createConnection.ts`)
- [ ] Verify: SQLite `.schema` before/after Alembic stamp — no drift
- [ ] Verify: Node backend still starts with `synchronize: false`

**Ticket: FEATURE-004**

- [ ] Implement request ID middleware (`x-request-id` header → UUID → context binding)
- [ ] Implement request logger middleware (incoming + completion with duration)
- [ ] Implement global error handler (`AppError` → JSON error response format)
- [ ] Implement in-memory rate limiter (ported from TypeScript)
- [ ] Create `create_app()` factory with CORS, all middleware, router mounting
- [ ] Implement `/health`, `/health/ready`, `/health/live` routers
- [ ] Verify: `uv run uvicorn planny_api.main:app --port 13824` serves health endpoints
- [ ] Verify: Python `/health` response matches Node `/health` structure

---

## Phase 1: Health + Guest Auth + Proxy

**Ticket: FEATURE-005**

- [ ] Implement `POST /authentication/guest` (find existing guest or seed new project)
- [ ] Implement `GET /` redirect to CLIENT_URL
- [ ] Verify: Python-issued JWT → works on Node `/currentUser`
- [ ] Verify: Node-issued JWT → works on Python auth dependency
- [ ] Verify: Guest account seeding is idempotent across restarts

**Ticket: FEATURE-006**

- [ ] Install `http-proxy-middleware` in Node backend
- [ ] Create configurable proxy middleware with `MIGRATED_PREFIXES` array
- [ ] Forward matching requests to Python backend (port 13824)
- [ ] Handle Python backend down → return 502 error
- [ ] Verify: `curl http://localhost:3824/health` returns Python response
- [ ] Verify: `curl http://localhost:3824/issues` returns Node response (not proxied)

---

## Phase 2: Core CRUD

**Ticket: FEATURE-007**

- [ ] Implement `get_current_user` FastAPI dependency (JWT verify → DB lookup)
- [ ] Implement `get_db` FastAPI dependency (async session with commit/rollback)
- [ ] Implement `GET /currentUser` with auth
- [ ] Implement `GET /project` with eager-loaded issues + users
- [ ] Implement `PUT /project` with validation
- [ ] Implement serializers: `issue_partial`, `project_to_dict`, `user_to_dict`
- [ ] Verify: Response JSON matches Node for same data

**Ticket: FEATURE-008**

- [ ] Implement `GET /issues?searchTerm=` (LIKE on title + description_text, scoped by project)
- [ ] Implement `GET /issues/:issueId` (eager load users, comments, comments.user)
- [ ] Implement `POST /issues` (auto-calculate listPosition, strip description HTML)
- [ ] Implement `PUT /issues/:issueId` (update allowed fields)
- [ ] Implement `DELETE /issues/:issueId` (cascade delete comments)
- [ ] Verify: Response JSON matches Node (snapshot tests)
- [ ] Verify: Cross-project access denied (issue from other project → 404)

**Ticket: FEATURE-009**

- [ ] Implement `POST /comments` (verify issue belongs to user's project)
- [ ] Implement `PUT /comments/:commentId` (verify comment belongs to current user)
- [ ] Implement `DELETE /comments/:commentId` (verify ownership)
- [ ] Verify: Comment response includes user partial matching Node format
- [ ] Verify: Issue cascade delete → comments removed

---

## Phase 3: Quick Actions

**Ticket: FEATURE-010**

- [ ] Implement `GET /quick-actions/actions/outlook-clean/status` (state machine: idle/running/success/failed)
- [ ] Implement `POST /quick-actions/actions/outlook-clean` (async background task)
- [ ] Implement `GET /quick-actions/actions/tempo-export/hours?date=` (Tempo API)
- [ ] Implement `GET /quick-actions/actions/tempo-export/week?startDate=` (week array)
- [ ] Implement `PUT /quick-actions/actions/tempo-export/hours` (manual override)
- [ ] Implement `POST /quick-actions/actions/tempo-export` (create Tempo worklog)
- [ ] Wire rate limiter (10 req/min per IP) to all Tempo routes
- [ ] Verify: Rate limiter returns 429 + correct headers after 11th request

---

## Phase 4: Jira Integrations

**Ticket: FEATURE-011**

- [ ] Port `JiraHttpClient` — httpx.AsyncClient with BasicAuth/BearerAuth
- [ ] Implement event hooks for request/response logging with duration
- [ ] Implement `get()` and `post()` convenience methods with `raise_for_status()`
- [ ] Port YAML config loader — PyYAML with `${ENV_VAR}` interpolation
- [ ] Implement `get_jira_instance_config()` with fallback chain
- [ ] Verify: HTTP 4xx/5xx logged at WARNING, exceptions raised

**Ticket: FEATURE-012**

- [ ] Port `WorklogService` — dual instance orchestration (~250 lines)
- [ ] Implement `create_worklog()` with requestId generation
- [ ] Implement `get_submission_history()` with date filters
- [ ] Implement `get_hours_by_date()` and `update_hours_for_date()`
- [ ] Implement enums: WorklogTarget, SubmissionStatus
- [ ] Implement repositories: SubmissionRepository, ExternalHoursDailyRepository, TempoHoursRepository, DailyHoursRepository
- [ ] Verify: BOTH target → both clients called, results tracked per instance
- [ ] Verify: External client fails → PARTIAL_SUCCESS status
- [ ] Verify: Hours updated atomically with submission

**Ticket: FEATURE-013**

- [ ] Port `JiraIssueClient` — search, detail, transitions
- [ ] Implement `POST /api/v1/jira/worklogs` (create worklog)
- [ ] Implement `GET /api/v1/jira/worklogs` (submission history)
- [ ] Implement `GET/PATCH /api/v1/jira/worklogs/hours-by-date`
- [ ] Implement `GET /api/v1/jira/issues?jql=`
- [ ] Implement `GET /api/v1/jira/issues/:issueKey`
- [ ] Implement `GET /api/v1/jira/issues/:issueKey/transitions`
- [ ] Implement `POST /api/v1/jira/issues/:issueKey/transitions`
- [ ] Implement `require_jira_config` middleware (503 if not configured)
- [ ] Verify: All routes → Python (`MIGRATED_PREFIXES = ['/']`)

---

## Phase 5: Cleanup

**Ticket: DEBT-001** (after 2+ weeks production verification)

- [ ] Remove `api/` directory (TypeScript source, build artifacts, dependencies)
- [ ] Update root `package.json` scripts (remove Node references)
- [ ] Update GitHub Actions (remove Node lint/test/build)
- [ ] Update `AGENTS.md` (replace Node commands with Python)
- [ ] Update `docker-compose.yml` (remove Node service)
- [ ] Document migration completion in `docs/architecture/`
- [ ] Archive last working Node commit hash
- [ ] Verify: `npm start` in `client/` still works
- [ ] Verify: `uv run uvicorn planny_api.main:app --port 3824` starts standalone

---

## Infrastructure (parallel)

**Ticket: DEBT-002**

- [ ] Create `Dockerfile.python` (multi-stage, uv-based)
- [ ] Add `python-api` service to `docker-compose.yml`
- [ ] Create `.github/workflows/python.yml` (ruff + mypy + pytest + alembic check)
- [ ] Add pre-commit hooks for ruff + mypy on staged Python files
- [ ] Verify: `docker compose up python-api` serves `/health`
- [ ] Verify: CI pipeline passes (ruff check, mypy, pytest --cov ≥ 80%)

---

## Deferred

**Ticket: FEATURE-014** (after migration complete)

- [ ] OpenTelemetry auto-instrumentation for FastAPI
- [ ] OpenTelemetry manual spans for Jira HTTP calls
- [ ] Prometheus `/metrics` endpoint (request count, duration, DB queries)
- [ ] Trace context propagation via `traceparent` header
- [ ] Redis-based rate limiter (replace in-memory)
- [ ] Async background task queue (Dramatiq or ARQ) for Outlook clean
