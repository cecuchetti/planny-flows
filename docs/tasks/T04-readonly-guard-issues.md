# T04 — Readonly Guard on Issues API

**What to build:** Add server-side guards to the issues router that reject mutations on Jira-sourced (read-only) issues. Any `PUT` or `DELETE` on an issue with `readonly=True` returns `403 Forbidden`. Exception: updating the `timeSpent` field is always allowed even on read-only issues (required for worklog tracking). Update the issue serializer to include new columns (`source_type`, `external_key`, `readonly`). GET endpoints are unaffected — read-only issues are returned normally.

**Blocked by:** T01 (models must have `readonly` column).

**Status:** ready-for-agent

## Acceptance Criteria

- [ ] `PUT /issues/{id}` — if issue has `readonly=True`, return `403 Forbidden` with error code `ISSUE_READONLY` and message indicating the issue is read-only
- [ ] `PUT /issues/{id}` with `readonly=True` — exception: if the request body contains ONLY `timeSpent` (or `timeSpent` plus other fields), process normally. The guard only blocks when non-`timeSpent` fields are being modified on a read-only issue.
- [ ] `DELETE /issues/{id}` — if issue has `readonly=True`, return `403 Forbidden` with error code `ISSUE_READONLY`
- [ ] `GET /issues` and `GET /issues/{id}` — unaffected, read-only issues returned normally
- [ ] `POST /issues` — unaffected (creates local issues only, `readonly` default is `false`)
- [ ] Issue serializer updated: `issue_partial()` includes `source_type`, `external_key` (if present), `readonly`
- [ ] Guard integration: the readonly check should happen at the router level (or in `issue_service`) before the update logic runs
- [ ] Full API tests (following existing `test_issues.py` pattern):
  - [ ] Test: `PUT /issues/{readonly_id}` with title change → returns 403
  - [ ] Test: `PUT /issues/{readonly_id}` with status change → returns 403
  - [ ] Test: `PUT /issues/{readonly_id}` with only `timeSpent` → returns 200, field updated
  - [ ] Test: `PUT /issues/{local_id}` (non-readonly) → returns 200, normal behavior
  - [ ] Test: `DELETE /issues/{readonly_id}` → returns 403
  - [ ] Test: `DELETE /issues/{local_id}` → returns 200, normal behavior
  - [ ] Test: `GET /issues/{readonly_id}` → returns 200, `readonly: true` in response
  - [ ] Test: `GET /issues/{readonly_id}` → includes `source_type` and `external_key` in response
- [ ] Existing `test_issues.py` tests continue to pass (backward compatible behavior)

## Out of Scope

- Frontend handling of 403 responses (T06 handles the UI)
- Changing the worklog submission flow (existing Jira worklog endpoints are separate and unaffected)
