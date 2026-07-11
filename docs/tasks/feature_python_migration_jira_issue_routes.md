---
type: feature
priority: medium
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, jira, issues, routes, search, transitions]
keywords: [JiraIssueClient, issue search, transitions, JQL, /api/v1/jira]
patterns: [issue search, issue transitions, Jira REST API, route wiring]
---

# FEATURE-013: Jira Issue Service + /api/v1/jira/* routes

## Description

Port the Jira Issue Client (issue search, detail, transitions) and wire all `/api/v1/jira/*` routes into the FastAPI app. This completes Phase 4 — the last remaining routes before full migration.

## Context

Blueprint Section 8, Phase 4. The Jira Issue Client handles `GET /search` (JQL), `GET /issue/:key`, `GET /issue/:key/transitions`, and `POST /issue/:key/transitions`. After this, all routes are in Python and the proxy can send everything to port 13824.

## Requirements

### Functional Requirements

**JiraIssueClient (`planny-jira`):**
- `search_issues(jql: str, max_results: int = 50) → list[dict]`: Call Jira REST API `/rest/api/2/search`
- `get_issue(issue_key: str) → dict`: Get single issue by key
- `get_transitions(issue_key: str) → list[dict]`: Get available transitions
- `transition_issue(issue_key: str, transition_id: str) → dict`: Execute transition

**Routes (`planny_api/routers/jira_integrations/`):**
- `POST /api/v1/jira/worklogs` → delegate to WorklogService.create_worklog
- `GET /api/v1/jira/worklogs` → submission history
- `GET /api/v1/jira/worklogs/hours-by-date` → hours by date range
- `PATCH /api/v1/jira/worklogs/hours-by-date/:date` → update hours
- `GET /api/v1/jira/issues` → search Jira issues
- `GET /api/v1/jira/issues/:issueKey` → single issue
- `GET /api/v1/jira/issues/:issueKey/transitions` → available transitions
- `POST /api/v1/jira/issues/:issueKey/transitions` → execute transition

**Route gating:**
- `require_jira_config` middleware: return 503 if Jira integrations not configured
- All routes require authentication (JWT)

### Non-Functional Requirements

- Pagination headers or query params for issue search
- Error mapping: Jira API errors → `ExternalServiceError`

## Current State

`api/src/jira-integrations/integrations/jiraIssueClient.ts` — reference. `api/src/jira-integrations/routes.ts` — reference routes.

## Success Criteria

### Automated Verification
- [ ] `GET /api/v1/jira/issues?jql=project=VIS` returns issue list (mock)
- [ ] `GET /api/v1/jira/issues/VIS-1` returns single issue (mock)
- [ ] `GET /api/v1/jira/issues/VIS-1/transitions` returns available transitions (mock)
- [ ] `POST /api/v1/jira/issues/VIS-1/transitions` executes transition (mock)
- [ ] Without Jira config: all routes return 503
- [ ] Without auth: all routes return 401
- [ ] `GET /api/v1/jira/worklogs` returns submission history
- [ ] `POST /api/v1/jira/worklogs` creates worklog and returns result
- [ ] Response JSON matches Node for same data

### Manual Verification
- [ ] With proxy: `MIGRATED_PREFIXES = ['/']` → all routes go to Python
- [ ] `curl http://localhost:3824/api/v1/jira/worklogs` → Python response

## Related Information

- Depends on: FEATURE-011 (Jira client), FEATURE-012 (worklog service)
- Blocks: Phase 4 completion
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 8, Phase 4

## Notes

After this ticket and `MIGRATED_PREFIXES = ['/']`, the Python backend handles 100% of traffic. Node stays running on port 3824 as fallback — instant rollback by changing the array back to `[]`.
