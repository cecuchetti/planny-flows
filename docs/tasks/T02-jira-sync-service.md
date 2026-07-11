# T02 — Jira Sync Service

**What to build:** A new service module that synchronizes the current user's assigned Jira issues into the local SQLite database. When called, it queries the external Jira API for all issues assigned to the current user with `status != Closed`, groups them by Jira project key, upserts `Project` and `Issue` rows, maps Jira fields to local fields, marks closed/unassigned issues as `status='done'`, and records the sync timestamp. Includes a staleness check helper.

**Blocked by:** T01 (models must have new columns + `user_projects` join table).

**Status:** ready-for-agent

## Acceptance Criteria

- [ ] New module for sync service exists with two public functions: `sync_external_projects()` and `should_auto_sync()`
- [ ] `sync_external_projects(user_id, db_session)`:
  - [ ] Calls the external Jira API using `planny_jira.client.JiraHttpClient` with JQL: `assignee = currentUser() AND status != Closed`
  - [ ] Groups returned issues by `fields.project.key`
  - [ ] For each unique project key: upserts a `Project` row (find by `external_key` or create with `source_type='jira'`, name from Jira project name), ensures `user_projects` association exists for the given user
  - [ ] For each Jira issue in the response: upserts an `Issue` row (find by `external_key` or create), maps Jira fields to local columns, sets `readonly=True`, `source_type='jira'`
  - [ ] Field mapping handles all specified conversions: `fields.summary→title`, `fields.issuetype.name→type` (Bug→bug, Task→task, Story→story), `fields.status.name→status` (To Do/Open→backlog, Selected→selected, In Progress→inprogress, Done/Closed→done), `fields.priority.name→priority` (Highest→5, High→4, Medium→3, Low→2, Lowest→1), `fields.description→description`, `fields.timetracking.timeSpentSeconds→timeSpent`, `fields.timetracking.remainingEstimateSeconds→timeRemaining`, `fields.timetracking.originalEstimateSeconds→estimate`
  - [ ] Auto-calculates `listPosition` (max existing + 1.0) and sets `reporterId` to the current user's ID
  - [ ] Closed issue handling: any issue in local DB with `source_type='jira'` NOT in the current API response → `status='done'`
  - [ ] Updates `project.last_synced_at` to current UTC timestamp
- [ ] `should_auto_sync(project)` returns `True` when `last_synced_at` is `None` or older than 24 hours
- [ ] Full unit tests with mocked `JiraHttpClient` (follow existing `test_jira_routes.py` pattern):
  - [ ] Test: Jira API returns issues → projects and issues are upserted correctly
  - [ ] Test: field mapping produces correct local values for all status/type/priority combinations
  - [ ] Test: issues missing from Jira response are marked `status='done'`
  - [ ] Test: duplicate `external_key` handled gracefully (upsert, no duplicate rows)
  - [ ] Test: `should_auto_sync` returns correct values for null, stale, and recent timestamps
  - [ ] Test: sync failure (network error) is caught and logged, does not crash
- [ ] Existing backend tests continue to pass (no regressions)

## Out of Scope

- Auto-sync trigger on app load (T03)
- Manual sync API endpoint (T03)
- Multiple Jira instances (assumes single external instance configured via `EXTERNAL_ATLASSIAN_*` env vars)
- Sync progress UI indicators
