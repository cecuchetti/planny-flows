---
type: debt
priority: medium
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, docker, ci, devops]
keywords: [Dockerfile, GitHub Actions, uv, multi-stage build, CI/CD]
patterns: [Docker build, Docker Compose, CI pipeline, Python deployment]
---

# DEBT-002: Docker + CI/CD for Python backend

## Description

Create infrastructure configuration for the Python backend: multi-stage Dockerfile, docker-compose integration, GitHub Actions CI pipeline for linting/testing/type-checking, and Alembic migration checks.

## Context

Blueprint Section 3. The existing `docker-compose.yml` only has Node and client services. The CI pipeline (`api/package.json` scripts + potential GitHub Actions) only covers Node. Python needs its own Docker build and CI checks to be production-ready.

## Requirements

### Functional Requirements

**Dockerfile.python (multi-stage):**
```dockerfile
# Builder stage: install uv, copy workspace config, uv sync --frozen --no-dev
# Runtime stage: copy .venv, packages, alembic, run uvicorn on port 13824
```

**docker-compose.yml updates:**
- Add `python-api` service: build from `Dockerfile.python`, port 13824, depends on DB
- Keep `node-api` service (until DEBT-001) and `client` service
- Shared network for all services
- DB service shared between all backends

**GitHub Actions workflow (`.github/workflows/python.yml`):**
- Trigger: push to `main`, PRs
- Steps: setup-python 3.12, install uv, uv sync, ruff check, mypy, pytest --cov
- Alembic check: verify migrations are current
- Build Docker image as validation step

**CI parity:**
- Linting: ruff (matches Node's ESLint)
- Formatting: ruff format (matches Node's Prettier)
- Type checking: mypy (matches Node's tsc --noEmit)
- Testing: pytest --cov (matches Node's vitest --coverage)
- Pre-commit: hook running ruff + mypy on staged files

### Non-Functional Requirements

- Docker build must use layer caching (dependencies separate from source)
- CI must run in under 5 minutes
- Coverage threshold: 80% (matching existing API coverage)

## Current State

- `docker-compose.yml` — Node + client services
- `api/package.json` — Node CI scripts
- No Python CI exists

## Research Context

### Keywords to Search
- `docker-compose.yml` — existing compose file
- `package.json` — existing CI scripts
- `Dockerfile` — if any existing Dockerfile

### Key Decisions Made
- **uv sync --frozen**: Reproducible builds (uses uv.lock)
- **Multi-stage Docker**: Keeps final image small
- **ruff over flake8**: Faster, drop-in replacement
- **Port 13824 for Python**: Doesn't conflict with Node (3824) or client (8192)

## Success Criteria

### Automated Verification
- [ ] `docker build -f Dockerfile.python -t planny-python .` succeeds
- [ ] `docker compose up python-api` starts and serves `/health`
- [ ] `docker compose up` starts all services (Node + Python + client + DB)
- [ ] GitHub Actions: `uv run ruff check` exits 0
- [ ] GitHub Actions: `uv run mypy packages/` exits 0
- [ ] GitHub Actions: `uv run pytest packages/ --cov` exits 0, coverage ≥ 80%
- [ ] GitHub Actions: `uv run alembic check` verifies migrations up-to-date
- [ ] Pre-commit hook runs ruff + mypy on staged files

### Manual Verification
- [ ] Docker image size < 300MB
- [ ] CI run completes in < 5 minutes
- [ ] `docker compose logs python-api` shows structured JSON logs

## Related Information

- Depends on: FEATURE-001 (monorepo scaffolded, uv sync works)
- Can be implemented in parallel with feature tickets
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 3

## Notes

The `uv.lock` file must be committed to the repo for `--frozen` installs to work in CI and Docker builds. Add to `.gitignore` exclusion if currently ignored.
