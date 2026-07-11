---
type: feature
priority: high
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, crud, user, project]
keywords: [currentUser, project, GET, PUT, dependency injection, Depends]
patterns: [user endpoint, project CRUD, auth dependency, serialization]
---

# FEATURE-007: /currentUser + /project CRUD

## Description

Implement the first Phase 2 routes: `GET /currentUser` and the Project CRUD endpoints (`GET /project`, `PUT /project`). These are the simplest authenticated routes and establish the pattern for all subsequent CRUD implementations.

## Context

Blueprint Section 8, Phase 2. After Phase 1 verifies JWT interop and the proxy middleware, Phase 2 moves core domain routes. These routes require auth (JWT → current user) and DB access (SQLAlchemy async sessions).

## Requirements

### Functional Requirements

**GET /currentUser:**
- Authenticate via `get_current_user` dependency
- Return `{ currentUser: { id, name, email, avatarUrl, projectId, createdAt, updatedAt } }`
- Response format must match Node's `/currentUser` exactly

**GET /project:**
- Authenticate via `get_current_user` dependency
- Load `currentUser.project` with eager-loaded `issues` and `users`
- Return `{ project: { id, name, url, description, category, issues: [...], users: [...], createdAt, updatedAt } }`
- Issue partials must use `issuePartial` serializer matching Node

**PUT /project:**
- Authenticate, validate request body (Pydantic model)
- Update `project.name`, `project.url`, `project.description`, `project.category`
- Return `{ project: updated_project_dict }`

**Dependencies:**
- Implement `get_current_user` FastAPI dependency (JWT verify → DB lookup → return User)
- Implement `get_db` FastAPI dependency (async session, commit on success, rollback on error)

**Serializers:**
- `issue_partial(issue) → dict` matching TypeScript `issuePartial` exactly
- `project_to_dict(project) → dict` matching Node response
- `user_to_dict(user) → dict` matching Node response

### Non-Functional Requirements

- Eager loading via `selectinload` for project's issues/users
- CamelCase keys in JSON responses (matching Node convention)
- ISO 8601 timestamps

## Current State

`api/src/controllers/users.ts` and `api/src/controllers/projects.ts` — reference implementations. Serializer: `api/src/serializers/issues.ts`.

## Success Criteria

### Automated Verification
- [ ] `GET /currentUser` with valid JWT returns 200 with user object
- [ ] `GET /currentUser` with invalid JWT returns 401 with correct error format
- [ ] `GET /currentUser` without JWT returns 403
- [ ] `GET /project` returns project with issues and users arrays
- [ ] `PUT /project` updates fields and returns updated project
- [ ] Python `/currentUser` response matches Node `/currentUser` JSON (keys, types, structure)
- [ ] Python `/project` response matches Node `/project` JSON
- [ ] Issue partial serializer matches Node: `userIds` is array of numbers, `listPosition` is float

### Manual Verification
- [ ] With proxy active (FEATURE-006): `curl http://localhost:3824/currentUser` → Python response
- [ ] Compare: `curl http://localhost:3824/project | jq .` before and after Phase 2 cutover

## Related Information

- Depends on: FEATURE-005 (auth, JWT interop), FEATURE-006 (proxy)
- Blocks: FEATURE-008 (issues CRUD — same patterns)
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 8, Phase 2

## Notes

This ticket establishes the CRUD pattern (auth dependency → DB session → service → serializer → JSON response) that FEATURE-008 and FEATURE-009 will follow. Get the serializers right here because every ticket depends on them.
