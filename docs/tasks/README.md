# Unified Project & Issue Model — Master Plan

**Status:** Ready
**Created:** 2026-07-11
**Source:** `docs/architecture/projects_and_taks_unification_implementation_plan.md`
**Spec:** `docs/specs/project-unification-spec.md`

## Summary

Merge local board projects and external Jira projects into a single data model in the local SQLite database. Both project types coexist in the `project` table, both issue types in the `issue` table — distinguished by `source_type` column ("local" | "jira"). Jira projects auto-discover from assigned issues, auto-sync when >24h stale, plus manual refresh. The Kanban board becomes the unified view for issues from all selected projects. Jira issues render as read-only cards; clicking opens read-only detail modal with "Log Time" action. Old "External Assignments" screen deprecated → redirect to unified board.

## Sequence & Dependencies

```
T01 (DB Migration + Models)
├── T02 (Jira Sync Service) ──→ T03 (Projects API + Auto-Sync) ──→ T05 (Unified Board + Filter)
│                                                                   ├── T06 (Read-Only Issue Details)
└── T04 (Readonly Guard Issues) ────────────────────────────────→───┘
                                                                   └── T07 (Sidebar Deprecation)
```

## Parallelization Plan

| Wave | Tickets | Parallel | What happens |
|---|---|---|---|
| **Wave 1** | T01 | ❌ Solo | Foundation — DB schema changes, models, enum, Alembic migration. Must finish first. |
| **Wave 2** | T02, T04 | ✅ 2 parallel | Sync service + readonly guard touch different modules, different test files, no shared code. |
| **Wave 3** | T03 | ❌ Solo | Depends on T02 sync service for POST /projects/:id/sync and auto-sync hook. |
| **Wave 4** | T05 | ❌ Solo | Depends on T03 API endpoints (GET /projects, GET /project?ids=). |
| **Wave 5** | T06, T07 | ✅ 2 parallel | Read-only modal + sidebar deprecation are independent components. Both depend on T05 board. |

**Max parallelism: 2 tickets per wave.**

## Ticket Summary

| # | Ticket | Layer | Blocked by | Size |
|---|---|---|---|---|
| T01 | DB Migration + Models + Enum | Backend | — | Medium |
| T02 | Jira Sync Service | Backend | T01 | Large |
| T03 | Projects API Rewrite + Auto-Sync | Backend | T01, T02 | Medium |
| T04 | Readonly Guard on Issues API | Backend | T01 | Small |
| T05 | Unified Board: Filter + Multi-Project Load | Frontend | T03 | Large |
| T06 | Read-Only Jira Issue Detail Modal | Frontend | T04, T05 | Medium |
| T07 | Sidebar Deprecation + Route Redirect | Frontend | T05 | Small |

## Verification Gates

### After Wave 3 (Backend complete)

```bash
uv run pytest packages/ -v --tb=short
uv run alembic upgrade head && uv run alembic downgrade -1
```

### After Wave 5 (Frontend complete)

```bash
cd client && npm run test:jest
cd client && npm run build
```

### Manual smoke tests (full stack)

1. Load Kanban board → project filter shows all projects
2. Select/deselect projects → issues filter correctly
3. Click external issue → read-only modal with "Log Time" button
4. Click local issue → full edit modal
5. Refresh button → sync triggers, board updates
6. Old `/my-jira-issues` route → redirects to board with Jira filter

## Rollback Plan

- Revert frontend to use `GET /project` (old endpoint — untouched, backward compatible)
- New DB columns are additive — existing queries unaffected
- `user_projects` table can be ignored if not used

## Phasing (Strangler Fig)

1. **Backend** (T01-T04): Add columns, create join table, build sync service, extend API. Old endpoints unchanged.
2. **Frontend** (T05-T07): Swap board to new endpoints, add project filter, add read-only modal, deprecate sidebar.
3. **Cleanup** (future, separate tickets): Drop `user.projectId`, remove `MyJiraIssues` component, remove old Node endpoints.
