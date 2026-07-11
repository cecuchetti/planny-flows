---
type: feature
priority: high
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, proxy, middleware, node]
keywords: [http-proxy-middleware, MIGRATED_PREFIXES, proxy, forwarding, cutover]
patterns: [request forwarding, route migration, fallback, traffic splitting]
---

# FEATURE-006: Node proxy middleware for Python backend cutover

## Description

Add proxy middleware to the Node/Express backend that inspects incoming requests and forwards those matching migrated route prefixes to the Python backend (port 13824). This is the traffic routing mechanism that enables progressive migration without external infrastructure (no Nginx, no Traefik).

## Context

Blueprint Section 1 (updated routing strategy). The Node backend acts as the entry point. A `MIGRATED_PREFIXES` array controls which routes go to Python. When a prefix is added, requests to those paths are proxied to Python. When removed, they fall back to Node handling.

## Requirements

### Functional Requirements

**Proxy middleware:**
- Install `http-proxy-middleware` (or use axios for manual forwarding)
- Create a configurable middleware that checks `req.path` against `MIGRATED_PREFIXES`
- Forward matching requests to `PYTHON_BACKEND_URL` (default: `http://localhost:13824`)
- Pass through all headers, query params, body, and method
- Return Python's response status, headers, and body verbatim to the client
- Log a debug message when proxying: `Proxying {method} {path} to Python backend`
- Handle Python backend being down: return 502 with `ExternalServiceError("Python Backend")` message

**Configuration:**
```typescript
const MIGRATED_PREFIXES: string[] = [
  // Phase 1 — add when Phase 1 is verified
  '/health', '/authentication/guest', '/',
  // Phase 2 — add when Phase 2 is verified
  // '/project', '/issues', '/comments', '/currentUser',
  // ...
];
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:13824';
```

**Placement:** Before Express route handlers, after request logging middleware. Must run after `authenticateUser` for non-public routes? Actually no — Python handles its own auth. The proxy runs before any route-specific middleware and just forwards.

### Non-Functional Requirements

- Must not affect non-migrated routes (no latency impact)
- Proxy timeout configurable (default 30s)
- Existing Node routes continue working normally

## Current State

Node backend has no proxy capability. All routes handled locally.

## Research Context

### Keywords to Search
- `http-proxy-middleware` — npm package
- `routes.ts` — where to insert proxy middleware
- `index.ts` — Express app setup, middleware order

### Key Decisions Made
- **http-proxy-middleware over axios**: True HTTP proxy preserves headers, supports streaming, battle-tested
- **Before route handlers**: Routes never see proxied requests — clean separation
- **MIGRATED_PREFIXES as config**: No .env, no JSON file needed for initial phases. Simple array.

## Success Criteria

### Automated Verification
- [ ] Proxy middleware in Express pipeline before route handlers
- [ ] Request to `/health` → Python `/health` response returned
- [ ] Request to `/issues` (not in MIGRATED_PREFIXES yet) → handled by Node normally
- [ ] Python backend down → 502 error with correct JSON format
- [ ] All original headers forwarded to Python
- [ ] Response headers from Python forwarded to client
- [ ] Non-migrated route performance unchanged (proxied test)

### Manual Verification
- [ ] Start Node on 3824, Python on 13824 with Phase 1 routes
- [ ] `curl http://localhost:3824/health` → returns Python's response (not Node's)
- [ ] `curl http://localhost:3824/issues` → returns Node's response (not proxied)
- [ ] Check Node logs: proxied request shows "Proxying GET /health to Python backend"

## Related Information

- Depends on: FEATURE-005 (need Python routes to proxy to)
- Required by: FEATURE-008 onwards (enables phased cutover)
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 1

## Notes

This ticket is the "switch" for the entire migration. Adding a prefix to `MIGRATED_PREFIXES` is the cutover, removing it is the rollback. The proxy should be as simple and transparent as possible — no request transformation, no response manipulation.
