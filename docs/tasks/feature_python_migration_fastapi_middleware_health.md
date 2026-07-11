---
type: feature
priority: high
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, fastapi, middleware, health]
keywords: [FastAPI, create_app, CORSMiddleware, RequestIDMiddleware, structlog, health check]
patterns: [application factory, middleware pipeline, error handling, dependency injection]
---

# FEATURE-004: planny-api — FastAPI app skeleton, middleware, and health router

## Description

Create the FastAPI application factory with all cross-cutting middleware (request ID, request logger, CORS, error handling) and implement the health check router. This establishes the API structure that all future route implementations plug into.

## Context

Blueprint Sections 5 & 7. The FastAPI app must mirror the Express middleware pipeline: request ID assignment → request logging → CORS → public routes → auth → private routes → error handlers. The health router returns the same JSON structure as the Node `/health`, `/health/ready`, and `/health/live` endpoints.

## Requirements

### Functional Requirements

**Middleware (4 files):**
- `request_id.py`: Read `x-request-id` header or generate UUID, attach to `request.state.request_id`, bind to structlog context, set response header
- `request_logger.py`: Log incoming request (method, path, query) + completion (status, duration_ms)
- `error_handler.py`: Register `AppError` handler producing `{ error: { message, code, status, data }, requestId }`, plus handlers for HTTPException and unhandled Exception
- `rate_limiter.py`: Port the TypeScript in-memory rate limiter (70 lines) with same algorithm and headers

**Main app:**
- `main.py`: `create_app()` factory returning FastAPI instance with:
  - CORS: exact origin list from Node config
  - All custom middleware in correct order
  - Exception handlers registered
  - Router mounting (health, auth, projects, issues, comments, users, quick_actions, jira)

**Health router:**
- `GET /health`: DB connectivity check + Jira integration status
- `GET /health/ready`: DB connectivity only (readiness probe)
- `GET /health/live`: Always returns OK (liveness probe)
- Response format must match Node `/health` structurally

### Non-Functional Requirements

- Swagger docs disabled in production (`docs_url=None` if env != development)
- FastAPI version >= 0.110, Uvicorn >= 0.29
- All routes return JSON matching Node's response format exactly
- Dependency injection for DB sessions and auth

## Current State

`api/src/middleware/` has the reference implementations in TypeScript. `api/src/routes.ts` shows the public/private route split.

## Desired State

`uv run uvicorn planny_api.main:app --port 13824` starts a server that:
- Serves `/health`, `/health/ready`, `/health/live` with correct JSON
- Logs incoming requests with request ID
- Returns proper CORS headers
- Shows unhandled errors as `{ error: { message, ... }, requestId }`

## Research Context

### Keywords to Search
- `addRequestId` — TypeScript request ID middleware
- `requestLogger` — TypeScript request logger middleware
- `handleError` — TypeScript error handler middleware
- `createRateLimiter` — TypeScript rate limiter

### Key Decisions Made
- **App factory pattern**: Enables testing with different configs
- **Custom middleware over Starlette defaults**: Need exact behavior match with Node
- **Exception handlers on the app**: Not router-level, matching Express's global error handler

## Success Criteria

### Automated Verification
- [ ] `create_app()` returns FastAPI instance with all middleware registered
- [ ] `GET /health` returns 200 with DB and Jira status
- [ ] `GET /health/ready` returns 200 with DB status
- [ ] `GET /health/live` returns 200
- [ ] Error handler test: raise `EntityNotFoundError("Issue")` → 404 JSON with `{ error: { code: "ENTITY_NOT_FOUND" } }`
- [ ] Rate limiter test: exceed limit → 429 with Retry-After header
- [ ] Health response JSON matches Node `/health` structure (compare dict keys, value types)

### Manual Verification
- [ ] `curl http://localhost:13824/health | jq` shows correct JSON
- [ ] `curl http://localhost:3824/health | jq` — compare structure with Node

## Related Information

- Depends on: FEATURE-001, FEATURE-002, FEATURE-003
- Blocks: FEATURE-005 onwards (all route implementations)
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Sections 5 & 7

## Notes

Middleware order matters: CORS → RequestID → RequestLogger → routers → error handler. Must match Node's order in `api/src/index.ts` for consistent behavior.
