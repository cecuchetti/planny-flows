---
type: feature
priority: medium
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, quick-actions, outlook, tempo, rate-limit]
keywords: [outlook, clean, Tempo, export, worklog, rate limiter, quick-actions]
patterns: [background task, tempo hours, worklog creation, rate limiting]
---

# FEATURE-010: Quick Actions — Outlook clean + Tempo export + rate limiter

## Description

Implement all `/quick-actions/*` routes: Outlook cleaner trigger and status, Tempo hours tracking (GET/PUT hours, GET week), Tempo worklog export, and the in-memory rate limiter on Tempo routes (10 req/min per IP).

## Context

Blueprint Section 8, Phase 3. Quick Actions depend on the Jira HTTP client (Phase 4) but the controllers themselves are simpler and serve as good integration tests. The rate limiter was already ported in FEATURE-004 but must be wired to these specific routes.

## Requirements

### Functional Requirements

**Outlook clean:**
- `GET /quick-actions/actions/outlook-clean/status`: Return current job status (idle/running/success/failed)
- `POST /quick-actions/actions/outlook-clean`: Trigger async Outlook clean job via HTTP call to `OUTLOOK_CLEANER_URL`
- Use `asyncio.create_task` for background processing (matching Node's in-process approach)
- Track status in memory (simple state machine: idle → running → success|failed)

**Tempo hours tracking:**
- `GET /quick-actions/actions/tempo-export/hours?date=YYYY-MM-DD`: Return hours logged for date from Tempo API
- `GET /quick-actions/actions/tempo-export/week?startDate=YYYY-MM-DD`: Return array of daily hours for week
- `PUT /quick-actions/actions/tempo-export/hours`: Manual override of daily hours in local DB

**Tempo export:**
- `POST /quick-actions/actions/tempo-export`: Create Tempo worklog via Jira client, update local tracking

**Rate limiter:**
- Apply `tempoExportRateLimiter` (10 req/min per IP) to all Tempo routes
- Return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` headers

### Non-Functional Requirements

- Tempo routes reuse `WorklogService` from `planny-jira` (imported as dependency)
- Rate limiter must track by client IP (`request.client.host`)
- Outlook clean state machine must be thread-safe

## Current State

`api/src/controllers/quickActions.ts` — reference. `api/src/middleware/rateLimiter.ts` — reference rate limiter.

## Success Criteria

### Automated Verification
- [ ] `GET /quick-actions/actions/outlook-clean/status` returns idle initially
- [ ] `POST /quick-actions/actions/outlook-clean` starts async job, status transitions to running
- [ ] Tempo hours endpoints return correct data (mock external API)
- [ ] Tempo export creates worklog (mock)
- [ ] Rate limiter: 11 requests → 11th returns 429 with Retry-After
- [ ] Rate limiter headers present on Tempo routes
- [ ] Rate limiter resets after window expires

### Manual Verification
- [ ] `curl http://localhost:3824/quick-actions/...` with proxy → Python response

## Related Information

- Depends on: FEATURE-006 (proxy), `planny-jira` package (HTTP client, worklog service)
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 8, Phase 3

## Notes

This ticket depends on the Jira HTTP client from Phase 4 (`planny-jira` package). It should be implemented after the HTTP client scaffold exists but the worklog orchestration logic can be stubbed initially.
