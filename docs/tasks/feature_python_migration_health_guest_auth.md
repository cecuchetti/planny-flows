---
type: feature
priority: high
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, health, auth, jwt, guest]
keywords: [authentication, guest, JWT, python-jose, HS256, authToken]
patterns: [guest account creation, JWT sign/verify, token interop]
---

# FEATURE-005: Health endpoints + Guest auth + GET / redirect

## Description

Implement the first traffic-bearing Python routes: health check endpoints, guest account creation, and the root redirect. These Phase 1 routes have no database writes to existing tables and validate JWT interop between Python and Node.

## Context

Blueprint Section 8, Phase 1. These are the simplest routes with zero side effects, making them the ideal first cutover. The guest auth endpoint must produce JWT tokens that Node's middleware can verify, and vice versa. This validates the entire Python stack before moving to core CRUD.

## Requirements

### Functional Requirements

**Health endpoints (already scaffolded in FEATURE-004):**
- Verify they return correct responses against real DB connection

**Guest auth:**
- `POST /authentication/guest`: Find existing guest user by email suffix, or seed new project with users/issues/comments
- Return `{ authToken: "<jwt>" }` matching Node's response format exactly
- JWT payload must include `{ sub: userId, iat, exp }` matching Node
- Use HS256 with same `JWT_SECRET`

**Root redirect:**
- `GET /`: 302 redirect to `CLIENT_URL`

**JWT interop tests:**
- Python-issued token → Node `/currentUser` returns 200
- Node-issued token → Python auth dependency verifies correctly

### Non-Functional Requirements

- python-jose[cryptography] for JWT sign/verify
- Same secret, same algorithm (HS256), same clock/expiration handling as Node
- User ID in `sub` claim — ensure both handle string vs int consistently

## Current State

`api/src/controllers/authentication.ts` — reference guest account creation. `api/src/middleware/authentication.ts` — reference JWT verify. `api/src/utils/authToken.ts` — reference JWT sign.

## Research Context

### Keywords to Search
- `createGuestAccount` — TypeScript guest account controller
- `authToken` — JWT utility functions
- `authenticateUser` — JWT middleware

### Key Decisions Made
- **python-jose over PyJWT**: Better ergonomics, same HS256 support
- **User ID as string in sub**: Matches Node's jsonwebtoken behavior
- **180 days expiration**: Matches existing JWT_EXPIRES_IN default

## Success Criteria

### Automated Verification
- [ ] `POST /authentication/guest` returns 200 with `{ authToken }` 
- [ ] Repeated calls return same guest user (idempotent)
- [ ] New guest project gets seeded with issues and comments
- [ ] Python JWT decoded by Node `jsonwebtoken.verify()` — no errors
- [ ] Node JWT decoded by Python `jose.jwt.decode()` — no errors
- [ ] Node-issued token → GET Python protected route returns 200
- [ ] Python-issued token → GET Node `/currentUser` returns 200
- [ ] `GET /` returns 302 to CLIENT_URL

### Manual Verification
- [ ] `curl -X POST http://localhost:13824/authentication/guest` returns token
- [ ] Use that token on `curl http://localhost:3824/currentUser` → works
- [ ] Use Node token on Python (Phase 2): works

## Related Information

- Depends on: FEATURE-004 (FastAPI app with middleware)
- Blocks: FEATURE-006 (proxy middleware — needs Python routes live to proxy to)
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 8, Phase 1

## Notes

Guest account seeding uses hardcoded data matching Node's `createGuestAccount.ts`. If the guest project exists, reuse it. If not, create project + users + issues + comments. The seeding logic must be idempotent across restarts.
