---
type: feature
priority: high
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, errors, enums, config, database]
keywords: [AppError, EntityNotFoundError, Settings, pydantic-settings, async_session_factory, structlog]
patterns: [error hierarchy, config management, database connection, SQLAlchemy engine]
---

# FEATURE-002: planny-core — Errors, enums, config, and database module

## Description

Implement the foundational modules of the `planny-core` package: custom error hierarchy matching the TypeScript error classes, all domain enums, pydantic-settings configuration, and SQLAlchemy 2.0 database engine/session factory with dual SQLite/PostgreSQL support.

## Context

Blueprint: `docs/architecture/2026-07-11-python-migration-blueprint.md`. These modules are the foundation every other package depends on. The error hierarchy must produce JSON responses identical to the Node backend. The database module must connect to the same SQLite/PostgreSQL database as the existing TypeORM setup.

## Requirements

### Functional Requirements

- **errors.py**: Implement `AppError` base class + `RouteNotFoundError`, `EntityNotFoundError`, `BadUserInputError`, `InvalidTokenError`, `IntegrationUnavailableError`, `ExternalServiceError` — matching Node's `api/src/errors/customErrors.ts` exactly
- **enums.py**: Implement `IssueType` (TASK, BUG, STORY), `IssueStatus` (BACKLOG, SELECTED, INPROGRESS, DONE), `IssuePriority` (HIGHEST=5 to LOWEST=1), `ProjectCategory` (SOFTWARE, MARKETING, BUSINESS)
- **config.py**: `Settings` class using pydantic-settings reading from `.env`. Include all env vars from `api/src/config/index.ts` plus `PYTHON_BACKEND_URL=http://localhost:13824`
- **.env.example**: Create `.env.example` with all variables and default values at project root
- **database.py**: `create_engine` for SQLite (NullPool) + `create_async_engine` for PostgreSQL (asyncpg, pool_size=20). Export `async_session_factory` and `Base` (DeclarativeBase)

### Non-Functional Requirements

- Use Python 3.12+ type hints (Mapped, mapped_column, etc.)
- structlog logger configuration must produce JSON output matching Pino format
- env vars reused unchanged from existing `.env`
- SQLite uses `check_same_thread=False`, PostgreSQL uses `pool_pre_ping=True`

## Current State

- `api/src/errors/customErrors.ts` — reference for error hierarchy
- `api/src/config/index.ts` — reference for env vars
- `api/src/constants/issues.ts`, `constants/projects.ts` — reference for enums
- `api/src/database/createConnection.ts` — reference for DB setup

## Desired State

All modules importable and functional. Database connects to existing DB read-only. Enums produce same string values as TypeScript. Error classes produce same status codes and codes as Node.

## Research Context

### Keywords to Search
- `customErrors` — TypeScript error hierarchy to replicate
- `appConfig` — TypeScript config module
- `IssueType`, `IssueStatus` — enum definitions in `api/src/constants/`
- `createConnection` — TypeORM DataSource setup

### Key Decisions Made
- **pydantic-settings**: Mirrors TypeScript `appConfig` pattern, validates at startup
- **SQLAlchemy 2.0 DeclarativeBase**: Clean separation of models from config
- **Async for PG, sync for SQLite**: Matches TypeORM's dual-engine approach
- **structlog**: Replaces Pino, structured JSON logging with context binding

## Success Criteria

### Automated Verification
- [ ] `uv run python -c "from planny_core.errors import *"` exits 0, all errors instantiatable
- [ ] Python error JSON matches Node error JSON format
- [ ] `uv run python -c "from planny_core.enums import IssueType; assert IssueType.TASK == 'task'"` passes
- [ ] DB connection test: `uv run python -c "from planny_core.database import async_session_factory; ..."` connects to existing DB
- [ ] Settings validation test: invalid env → startup error

### Manual Verification
- [ ] Python logger output matches Pino format visually
- [ ] `.env.example` lists all required vars with documented defaults

## Related Information

- Depends on: FEATURE-001 (monorepo scaffold)
- Blocks: FEATURE-003 (models), FEATURE-004 (FastAPI app)

## Notes

The error hierarchy is the single most important file — every route handler and service depends on it. Must match Node's error JSON format byte-for-byte.
