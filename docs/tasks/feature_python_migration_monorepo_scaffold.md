---
type: feature
priority: high
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, monorepo, scaffold, uv]
keywords: [uv, pyproject.toml, workspace, hatchling, packages]
patterns: [monorepo structure, build system configuration, namespace packages]
---

# FEATURE-001: Monorepo scaffold with uv workspaces

## Description

Initialize the Python monorepo at the root of planny-flows using `uv` as the package manager and build system. Create the workspace root, three sub-packages (planny-core, planny-api, planny-jira), and the Alembic migrations directory. All code in English, all packages use the `planny_` namespace prefix.

## Context

The planny-flows backend is being migrated from TypeScript/Node.js/Express to Python using the Strangler Fig pattern (see `docs/architecture/2026-07-11-python-migration-blueprint.md`). Phase 0 establishes the project skeleton before any traffic is routed.

## Requirements

### Functional Requirements

- Install `uv` and initialize the root `pyproject.toml` with workspace config
- Create `packages/pyproject.toml` as workspace root listing members
- Create `packages/planny-core/` with `pyproject.toml` and `src/planny_core/` package
- Create `packages/planny-api/` with `pyproject.toml` and `src/planny_api/` package
- Create `packages/planny-jira/` with `pyproject.toml` and `src/planny_jira/` package
- Create `alembic/` directory with `env.py` and `versions/`
- Create `alembic.ini` at project root
- All packages use `hatchling` build backend
- `uv sync` must resolve and install all dependencies successfully
- Python >= 3.12 required

### Non-Functional Requirements

- Each package has its own `pyproject.toml` with dependencies scoped appropriately
- planny-core depends on: sqlalchemy, pydantic, pydantic-settings, python-jose, structlog, pyyaml, bleach
- planny-api depends on: planny-core, fastapi, uvicorn, httpx
- planny-jira depends on: planny-core, httpx, pyyaml
- Root dev-dependencies: pytest, pytest-asyncio, pytest-cov, httpx, ruff, mypy
- Must not break existing Node `api/` or React `client/` builds

## Current State

No Python project exists. Only `api/` (Node/TypeScript) and `client/` (React) exist.

## Desired State

Fully scaffolded monorepo where `uv sync` installs all packages, `uv run uvicorn planny_api.main:app` starts a FastAPI server (even if it does nothing yet), and `alembic --help` works.

## Research Context

### Keywords to Search

- `pyproject.toml` — existing project configs in repo for reference
- `.env` — existing environment variables to replicate

### Patterns to Investigate

- monorepo structure — `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 3

### Key Decisions Made

- **uv over poetry**: Faster, no separate venv, native workspace support
- **hatchling over setuptools**: Simpler config, recommended for uv workspaces
- **planny_ prefix**: Groups all packages under one namespace, avoids PyPI conflicts
- **Three packages**: Core (shared models/config), API (FastAPI routes), Jira (HTTP client)

## Success Criteria

### Automated Verification

- [ ] `uv sync` exits 0 and creates virtual environment
- [ ] `uv run python -c "import planny_core"` succeeds (even if empty)
- [ ] `uv run python -c "import planny_api"` succeeds
- [ ] `uv run python -c "import planny_jira"` succeeds
- [ ] `uv run ruff check packages/` exits 0 (no code yet, but tooling works)
- [ ] `uv run mypy packages/` exits 0

### Manual Verification

- [ ] `uv run uvicorn planny_api.main:app --port 13824` starts without errors
- [ ] `uv run alembic --help` shows CLI output
- [ ] Existing `cd api && npm start` still works alongside (no port conflicts)

## Related Information

- Blueprint: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 3 & 10
- Checklist: `docs/tasks/python-migration-checklist.md` Phase 0

## Notes

This is ticket 1 of 16 in the Python migration sequence. Depends on nothing. Must be completed before any other Phase 0 ticket.
