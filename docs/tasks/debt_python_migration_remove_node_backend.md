---
type: debt
priority: low
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, cleanup, node, removal]
keywords: [Node, Express, TypeORM, cleanup, decommission]
patterns: [dependency removal, directory cleanup, npm scripts update, GitHub Actions update]
---

# DEBT-001: Remove Node backend after full Python migration

## Description

After all routes have been migrated and verified in production for a stabilization period (recommended: 2 weeks minimum), remove the Node/Express backend from the repository. This includes the `api/` directory, Node-specific dependencies, build scripts, and CI configuration.

## Context

The Python backend handles 100% of traffic via `MIGRATED_PREFIXES = ['/']`. Node serves only as a proxy with no business logic. After a stabilization period with no rollbacks needed, the Node proxy can be replaced by starting Python directly on port 3824 (or keeping Uvicorn on 13824 and removing the proxy layer).

## Requirements

### Functional Requirements

- Remove `api/` directory entirely (source code, build artifacts, `data/`)
- Remove Node-specific root-level config: `package.json` scripts (if migrated), tsconfig references
- Remove Node-specific dependencies from `package.json` (or the entire root `package.json` if it was only for the API)
- Remove GitHub Actions workflows for Node (lint, test, build)
- Update root `package.json` scripts: remove `start:production`, `build`, `install-dependencies` references to `api/`
- Update root `AGENTS.md`: remove Node/TypeScript commands, replace with Python equivalents
- Update root `README.md` (if exists): replace Node setup with Python setup
- Update `docker-compose.yml`: remove Node service, keep only Python + DB
- Document in `docs/architecture/` that migration is complete
- Archive the last working Node commit hash/tag for reference

### Non-Functional Requirements

- `npm install` / `yarn` at root must still work for the React client
- Python backend must be runnable standalone (no dependency on Node proxy)
- Port 3824 becomes available for Python (or Python takes it over)

## Current State

Both backends running. Python on 13824 behind Node proxy on 3824. `api/` directory contains all TypeScript source.

## Research Context

### Keywords to Search
- `api/` — directory to remove
- `npm.*api` — scripts referencing api
- `Node` — CI configuration references

### Key Decisions Made
- **Min 2 weeks stabilization**: Safety buffer before permanent removal
- **Archive commit hash**: Reference for future context, not deployment
- **Python takes port 3824**: Simplifies client config (no proxy needed)

## Success Criteria

### Automated Verification
- [ ] `npm start` in `client/` starts React dev server (not broken by api removal)
- [ ] `uv run uvicorn planny_api.main:app --port 3824` starts Python backend
- [ ] React client on 8192 talks to Python on 3824 via CORS (same origin list)
- [ ] No broken symlinks or `api/` references in scripts

### Manual Verification
- [ ] Full app works: client loads, login works, board loads, issues CRUD works
- [ ] `rg "api/"` in root finds zero residual references (except docs)
- [ ] `git log --oneline` shows the archived Node commit hash

## Related Information

- Depends on: FEATURE-013 (all routes migrated), 2+ weeks production verification
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md`

## Notes

Do NOT start this ticket until FEATURE-013 has been in production with zero rollbacks for at least 2 weeks. The Node backend is the safety net — premature removal is the highest-risk action in the entire migration.
