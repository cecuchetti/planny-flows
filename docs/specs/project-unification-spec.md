Spec: Unified Project & Issue Model — Local + Jira Projects
Status: Draft | Created: 2026-07-11
Problem Statement
The application has two completely separate views for managing work:
1. Kanban Board (/project/board) — shows issues from a single local project in SQLite. Full CRUD, drag-and-drop, status columns.
2. External Assignments (/project/my-jira-issues) — separate screen that calls Jira API directly. Read-only issues, separate UI, separate code path.
Users switch between two disconnected UIs to see all their work. Jira issues are invisible to the board's filtering, status columns, and search. The result is context-switching friction and no unified "everything I'm working on" view.
Solution
Merge local projects and external Jira projects into a single data model in the local SQLite database. Both project types coexist in the same project table, both issue types in the same issue table. A source_type column distinguishes them.
Jira projects auto-discover from the user's assigned issues during first sync. Re-sync auto-triggers when data is >24h stale, plus manual refresh button.
The Kanban board becomes the single unified view for all issues across all selected projects. A project filter (multi-select chips) narrows the board. Jira issues appear as read-only cards in the same status columns. Clicking a Jira issue opens a read-only detail modal with "Log Time" action.
The old "External Assignments" screen is deprecated → redirects to the unified board with Jira filter pre-selected.
Users associate with projects via many-to-many (user_projects join table), replacing the old user.projectId single-project FK (kept for backward compat during transition).
User Stories
Project Discovery & Sync
1. As a user, I want Jira projects I'm assigned to automatically appear alongside my local projects after first sync.
2. As a user, I want Jira issues to sync automatically when I open the app if data is >24h stale.
3. As a user, I want a manual "Sync" button on each Jira project for immediate refresh.
4. As a user, I want sync to happen in background without blocking the UI.
5. As a user, I want Jira issues that are closed/unassigned to be marked as Done locally.
6. As a user, I want upsert sync (no data loss on re-sync, no duplicate issues).
Unified Board
 7. As a user, I want to see issues from ALL my projects (local + Jira) on one Kanban board.
 8. As a user, I want to filter the board by project with multi-select chips.
 9. As a user, I want each chip to show source icon: 📌 local, 🔗 Jira.
10. As a user, I want my project filter selection persisted across page reloads (localStorage).
11. As a user, I want all projects selected by default on first visit.
12. As a user, I want Jira issues in correct status columns (Backlog/Selected/In Progress/Done) mixed with local issues.
13. As a user, I want Jira issue cards to show their project key prefix (e.g., "VIS-123").
14. As a user, I want subtle visual distinction between Jira and local issue cards.
Read-Only Jira Issues
15. As a user, I want to click a Jira issue and see full details in a read-only modal.
16. As a user, I want all fields (title, type, status, priority, description, assignees, estimate, tracking) rendered as non-editable text.
17. As a user, I want a "Log Time" button on Jira issue details (opens existing TimeEntryModal).
18. As a user, I want a "View in Jira" link on Jira issue details.
19. As a user, I want local issues to remain fully editable — no regression.
Guardrails & Security
20. As a developer, I want API to reject PUT/PATCH/DELETE on readonly=true issues (403).
21. As a developer, I want API to allow timeSpent updates even on read-only issues (worklog tracking).
22. As a user, I want sync scoped to my own user account.
Transition & Deprecation
23. As a user, I want the old "External Assignments" sidebar link to redirect to unified board with Jira filter pre-selected.
24. As a user, I want the Kanban board to keep working exactly as before for local-only projects.
25. As a user, I want the unified board to be the default landing page.
Edge Cases
26. As a user, I want graceful handling when I have no local projects (only Jira).
27. As a user, I want graceful handling when Jira is not configured (no breakage).
28. As a user, I want sync failures to surface as non-blocking warnings, not errors.
29. As a user, I want duplicate external keys deduplicated during sync (last-write-wins).
Implementation Decisions
Domain Model
Project model (extend existing planny_core.models.project.Project):
- source_type: string, default "local", values "local" | "jira"
- external_key: string, nullable — Jira project key (e.g., "VIS")
- external_id: string, nullable — Jira project ID (e.g., "10001")
- last_synced_at: datetime, nullable — timestamp of last successful sync
Issue model (extend existing planny_core.models.issue.Issue):
- source_type: string, default "local", values "local" | "jira"
- external_key: string, nullable, unique — Jira issue key (e.g., "VIS-123")
- readonly: boolean, default false — gates mutations server-side
User-Project association: New user_projects join table:
user_projects = Table(
    "user_projects", Base.metadata,
    Column("userId", Integer, ForeignKey("user.id"), primary_key=True),
    Column("projectId", Integer, ForeignKey("project.id"), primary_key=True),
)
User model gains projects: Mapped[list[Project]] relationship via this table. Old user.projectId column kept for backward compat.
New enum (planny_core.enums):
class ProjectSourceType(StrEnum):
    LOCAL = "local"
    JIRA = "jira"
API Design
Method	Endpoint
GET	/projects
GET	/project?ids=1,2,3
GET	/project
POST	/projects/{id}/sync
PUT	/project
PUT	/issues/:id
DELETE	/issues/:id
Response shape for GET /project?ids=1,2,3:
{
  "projects": [
    {"id": 1, "name": "Singularity 1.0", "source_type": "local", "issues": [...]},
    {"id": 2, "name": "Vision", "source_type": "jira", "external_key": "VIS", "issues": [...]}
  ]
}
Readonly guard exception: Updating timeSpent field is always allowed, even on read-only issues. This is necessary for worklog submission to update local time tracking.
Jira Sync Service
Module: planny_api.services.jira_sync_service
Algorithm:
1. Call external Jira API: assignee = currentUser() AND status != Closed (using planny_jira.client.JiraHttpClient)
2. Group returned issues by fields.project.key
3. For each project key → upsert Project row by external_key
4. For each Jira issue → upsert Issue row by external_key (unique constraint)
5. Map Jira fields to local fields (see table below)
6. Set readonly=True, source_type='jira'
7. Issues in local DB with source_type='jira' NOT in API response → status='done'
8. Update project.last_synced_at to datetime.utcnow()
Field Mapping:
Jira Field	Local Field
fields.summary	title
fields.issuetype.name	type
fields.status.name	status
fields.priority.name	priority
fields.description	description
fields.timetracking.timeSpentSeconds	timeSpent
fields.timetracking.remainingEstimateSeconds	timeRemaining
fields.timetracking.originalEstimateSeconds	estimate
—	listPosition
—	reporterId
Staleness check: should_auto_sync(project) returns True if last_synced_at is null or >24h old.
Auto-sync hook: On GET /projects, check all user's Jira projects. If any stale → trigger background sync (returns stale data immediately, sync runs async).
Database Migration (Alembic)
New migration file in alembic/versions/:
 1. ALTER TABLE project ADD COLUMN source_type VARCHAR(20) DEFAULT 'local'
 2. ALTER TABLE project ADD COLUMN external_key VARCHAR(50)
 3. ALTER TABLE project ADD COLUMN external_id VARCHAR(100)
 4. ALTER TABLE project ADD COLUMN last_synced_at DATETIME
 5. ALTER TABLE issue ADD COLUMN source_type VARCHAR(20) DEFAULT 'local'
 6. ALTER TABLE issue ADD COLUMN external_key VARCHAR(50) (unique constraint)
 7. ALTER TABLE issue ADD COLUMN readonly BOOLEAN DEFAULT 0
 8. CREATE TABLE user_projects (userId INTEGER, projectId INTEGER, PRIMARY KEY(...), FK...)
 9. Data migration: UPDATE project SET source_type='local', UPDATE issue SET source_type='local'
10. Data migration: INSERT INTO user_projects SELECT id, projectId FROM user
TypeORM compatibility: Ensure Node API has synchronize: false so it doesn't drop new columns.
Frontend Architecture
New component — ProjectFilter (client/src/Project/Board/Filters/ProjectFilter.jsx):
- Multi-select chips: project name + 📌/🔗 icon
- State from useApi.get('/projects')
- Selection persisted in localStorage key planny-selected-project-ids
- Default: all selected
- Props: selectedIds, onChange
Modified — Project/index.jsx:
- Replace useApi.get('/project') → useApi.get('/projects') for project list
- Board gets issues via GET /project?ids=1,2,3 based on selectedProjectIds
Modified — Board/Lists/:
- Receive issues from multiple projects merged into status columns
- Issue cards already show project key prefix (existing normalizeBoardIssue behavior)
Modified — IssueDetails/:
- Check issue.readonly flag
- Readonly mode: all fields as text/disabled, no edit buttons
- Show "Log Time" button → opens TimeEntryModal
- Show "View in Jira" link → constructed from external_key
Modified — Sidebar/index.jsx:
- "External Assignments" nav item route changes from /my-jira-issues → /board?filter=jira
- MyJiraIssues kept as redirect wrapper, removed later
Testing Decisions
Testing Seams
Primary seam: HTTP API surface. All backend tests use httpx.AsyncClient + ASGITransport + in-memory SQLite + app.dependency_overrides. Follows existing pattern in test_projects.py, test_issues.py, test_jira_routes.py.
Jira external API: Always mocked via MagicMock/AsyncMock injected through dependency overrides. Follows test_jira_routes.py pattern.
Frontend seam: Component-level tests with Jest + React Testing Library. API hooks (useApi) mocked.
Test Modules
Backend — new:
- test_jira_sync.py — sync service: upsert, field mapping, closed issue handling, dedup, stale detection
Backend — modified:
- test_projects.py — add: GET /projects, GET /project?ids=, POST /projects/:id/sync
- test_issues.py — add: PUT/DELETE returns 403 for readonly, timeSpent exemption
Frontend — new:
- ProjectFilter.test.jsx — chip rendering, toggle, localStorage persist, icons
Frontend — modified:
- Board/index.test.jsx — multi-project loading, merged columns, filtering
- IssueDetails/index.test.jsx — readonly mode, "Log Time" button, "View in Jira" link
- Sidebar/index.test.jsx — deprecated nav redirect
Test Principles
- Test external behavior (HTTP response shape, status codes), not internal functions
- Test boundaries: readonly guards, empty projects, missing Jira config, stale timestamps
- Do NOT test: SQLAlchemy internals, Alembic mechanics, Webpack bundling
Out of Scope
- Real-time sync / WebSocket push from Jira
- Bi-directional sync (local → Jira)
- Creating Jira issues from the board
- Jira issue transitions (status changes) from the board
- Multiple Jira instances (assumes single external instance)
- Project CRUD for Jira projects (read-only locally)
- User management UI for Jira project associations
- Node.js API migration (TypeORM entities stay as-is with synchronize: false)
- Full removal of MyJiraIssues component (deferred one release cycle)
- Mobile-responsive project filter (desktop-first)
- Global sync progress bar (manual button only)
Further Notes
Phasing (Strangler Fig)
1. Phase 1 — Backend: Add columns, create user_projects, build sync service, extend API. Old endpoints unchanged. No frontend changes.
2. Phase 2 — Frontend: Swap board to new endpoints, add project filter, add read-only modal, deprecate sidebar item.
3. Phase 3 — Cleanup (future): Drop user.projectId, remove MyJiraIssues, remove old Node endpoints.
Rollback
- Revert frontend to use GET /project (old endpoint, untouched)
- New columns are additive — existing queries unaffected
- user_projects table can be ignored
Data Integrity
- external_key unique constraint on issue prevents duplicates
- Orphaned Jira issues (project deleted in Jira) remain with status='done'
- Concurrent syncs: upsert handles naturally, last-write-wins (acceptable — Jira is source of truth)
Performance
- Auto-sync runs async in background — never blocks API response
- Multi-project load uses selectinload eager loading — no N+1
- Project filter in localStorage: lightweight (array of ints)