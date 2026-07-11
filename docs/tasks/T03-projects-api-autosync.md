# T03 — Projects API Rewrite + Auto-Sync

**What to build:** Rewrite the projects router to support the unified project model. Add three new endpoints (`GET /projects`, extended `GET /project?ids=`, `POST /projects/{id}/sync`) while keeping the old `GET /project` and `PUT /project` backward compatible. Integrate auto-sync: when `GET /projects` is called, check all Jira projects for staleness (>24h) and trigger background sync for any stale ones. Update the project serializer to include new columns (`source_type`, `external_key`, `last_synced_at`).

**Blocked by:** T01 (models + join table), T02 (sync service for POST sync + auto-sync).

**Status:** ready-for-agent

## Acceptance Criteria

- [ ] `GET /projects` — lists all projects associated with the current user (via `user_projects` join table), returns `[{id, name, source_type, external_key, last_synced_at, issue_count}]`, ordered by name
- [ ] `GET /project?ids=1,2,3` — loads multiple projects with their issues in a single response (eager-load `issues` via `selectinload`), returns `{"projects": [{project_fields..., "issues": [...]}, ...]}`
- [ ] `GET /project` (no `ids` param) — backward compatible: returns the user's default local project with issues (existing behavior, untouched)
- [ ] `PUT /project` — backward compatible: update local project fields. Add guard: reject if `source_type='jira'` (return 400 with meaningful error)
- [ ] `POST /projects/{id}/sync` — triggers a manual sync for a specific Jira project via the sync service. Returns `{synced: true, project: {...}}` on success. Returns 400 if project is not `source_type='jira'`. Returns 404 if project not found or not associated with user.
- [ ] Auto-sync hook on `GET /projects`: after querying projects, check all `source_type='jira'` projects using `should_auto_sync()`. If any are stale, trigger `sync_external_projects()` as a background task (using `asyncio.create_task` or FastAPI `BackgroundTasks`). Return current data immediately — do NOT block the response waiting for sync.
- [ ] Project serializer updated: `project_to_dict()` includes `source_type`, `external_key` (if present), `last_synced_at` (if present)
- [ ] Full API tests (following existing `test_projects.py` pattern with `httpx.AsyncClient` + in-memory SQLite):
  - [ ] Test: `GET /projects` returns projects for the current user (verify shape, source_type, counts)
  - [ ] Test: `GET /projects` returns empty list when user has no projects
  - [ ] Test: `GET /project?ids=1,2` returns projects with issues arrays
  - [ ] Test: `GET /project?ids=999` (non-existent) returns empty or 404
  - [ ] Test: `GET /project` (no ids) still works (backward compat)
  - [ ] Test: `PUT /project` on Jira project returns 400
  - [ ] Test: `PUT /project` on local project still works
  - [ ] Test: `POST /projects/1/sync` triggers sync and returns success
  - [ ] Test: `POST /projects/1/sync` on local project returns 400
  - [ ] Test: `POST /projects/999/sync` returns 404
  - [ ] Test: `GET /projects` triggers auto-sync for stale projects (verify sync service called)
  - [ ] Test: `GET /projects` with fresh projects does NOT trigger sync
- [ ] Existing `test_projects.py` tests still pass (backward compatible behavior)
- [ ] All existing backend tests pass (no regressions)

## Out of Scope

- Pagination for `GET /projects` (single user's project count expected to be small, <50)
- Pagination for `GET /project?ids=` (board issues loaded in full)
- Sync progress tracking or status reporting in API response
