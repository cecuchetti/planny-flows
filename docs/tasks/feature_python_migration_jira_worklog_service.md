---
type: feature
priority: high
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, jira, worklog, tempo, repositories]
keywords: [WorklogService, WorklogSubmission, ExternalHoursDaily, dual instance, orchestration]
patterns: [worklog creation, dual Jira submission, status tracking, repositories]
---

# FEATURE-012: Jira Worklog Service + repositories

## Description

Port the WorklogService orchestration logic from TypeScript to Python. This service handles dual-instance worklog creation (Internal Tempo + External Jira), tracks submission status, and accumulates daily hours. Also implement the persistence repositories.

## Context

Blueprint Section 6. The existing `WorklogService` in `api/src/jira-integrations/services/worklogService.ts` (~250 lines) orchestrates creating worklogs across two Jira instances, tracking results per submission, and updating daily hour totals. This is the most complex single service in the codebase.

## Requirements

### Functional Requirements

**WorklogService:**
- `create_worklog(request: CreateWorklogRequest, db: AsyncSession) → dict`:
  - Generate `requestId = f"wlr_{uuid4().hex[:8]}"`
  - Create `WorklogSubmission` record (status: PENDING)
  - If target is TEMPO or BOTH: call internal Jira client for Tempo worklog
  - If target is JIRA or BOTH: call external Jira client for external worklog
  - Create `WorklogSubmissionResult` for each call (status: SUCCESS or FAILED)
  - Update submission overall_status (SUCCESS, FAILED, PARTIAL_SUCCESS)
  - Update `ExternalHoursDaily` accumulation
  - Return submission with results

- `get_submission_history(db, filters) → list[WorklogSubmission]`:
  - Search past submissions with optional date range filters

- `get_hours_by_date(db, start_date, end_date) → list[ExternalHoursDaily]`:
  - Query daily hours within date range

- `update_hours_for_date(db, date, hours) → ExternalHoursDaily`:
  - Manual override of daily hours

**Enums and types:**
- `WorklogTarget`: TEMPO, JIRA, BOTH
- `SubmissionStatus`: PENDING, SUCCESS, FAILED, PARTIAL_SUCCESS
- `CreateWorklogRequest` dataclass with Pydantic validation

**Repositories (in `planny-jira` package):**
- `SubmissionRepository`: CRUD for `WorklogSubmission` + `WorklogSubmissionResult`
- `ExternalHoursDailyRepository`: Upsert for `ExternalHoursDaily`
- `TempoHoursRepository`: CRUD for `TempoHoursDaily`
- `DailyHoursRepository`: CRUD for `DailyHours`

### Non-Functional Requirements

- All repository operations use async SQLAlchemy sessions
- Worklog aggregation must be atomic (single transaction for submission + results + hours update)

## Current State

`api/src/jira-integrations/services/worklogService.ts` — reference (~250 lines). `api/src/jira-integrations/persistence/` — 4 repository files.

## Success Criteria

### Automated Verification
- [ ] Create TEMPO worklog → internal client called, external skipped, status SUCCESS
- [ ] Create BOTH worklog → both clients called, results tracked for each
- [ ] External client fails → external result FAILED, overall PARTIAL_SUCCESS
- [ ] Both clients fail → overall FAILED
- [ ] Hours updated after successful submission
- [ ] `get_submission_history` returns filtered results
- [ ] `get_hours_by_date` returns correct aggregation
- [ ] Repository unit tests: CRUD operations on all 4 repos
- [ ] All tests use mocked JiraHttpClient (no real API calls)

### Manual Verification
- [ ] With proxy active: create worklog via `/api/v1/jira/worklogs` → correct response

## Related Information

- Depends on: FEATURE-011 (Jira HTTP client)
- Blocks: FEATURE-010 (Quick Actions Tempo export), FEATURE-013 (routes)
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 6

## Notes

The requestId format (`wlr_<8 chars>`) must match TypeScript's pattern for consistency with existing data. The worklog orchestration logic is ~250 lines of pure business logic — a direct port, not a redesign.
