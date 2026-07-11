# T05 — Unified Board: ProjectFilter + Multi-Project Load

**What to build:** Transform the Kanban board from a single-project view into a multi-project unified view. Build a new `ProjectFilter` component (multi-select chips) that lets users toggle which projects' issues appear on the board. Update the data loading in `Project/index.jsx` to fetch projects from the new `GET /projects` endpoint and board issues from `GET /project?ids=`. The board's list columns merge issues from all selected projects into the same status columns. Selection state persists in localStorage. Default is all projects selected.

**Blocked by:** T03 (needs `GET /projects` and `GET /project?ids=` endpoints).

**Status:** ready-for-agent

## Acceptance Criteria

### ProjectFilter component

- [ ] Renders as a horizontal row of multi-select chips in the board header (above or alongside existing Filters)
- [ ] Each chip shows: project name, source icon (📌 for local, 🔗 for Jira), selected/unselected visual state
- [ ] Clicking a chip toggles its selection (adds/removes project from filter)
- [ ] Selection state persisted in localStorage under key `planny-selected-project-ids`
- [ ] Default state (no localStorage entry): all projects selected
- [ ] Loading state: chips show skeleton/spinner while `GET /projects` is in flight
- [ ] Error state: if `GET /projects` fails, show existing issues from cached data; chips show error indicator
- [ ] Empty state: if user has no projects, chips area shows nothing or a subtle message
- [ ] Props: receives `selectedIds` (array of ints) and `onChange` (callback), or manages state internally via a custom hook

### Board data loading

- [ ] `Project/index.jsx` fetches project list from `GET /projects` (uses `useApi.get`)
- [ ] Board receives `selectedProjectIds` and fetches issues from `GET /project?ids=1,2,3` whenever selection changes
- [ ] Board passes merged issues (concat across all loaded projects) to `Lists` component
- [ ] Each issue record includes its `projectId` and `projectKey` so the board can display project context
- [ ] Loading state: board shows spinner while multi-project data loads
- [ ] Error state: board shows error message if `GET /project?ids=` fails

### Board Lists merge

- [ ] Issues from multiple projects appear in the same status columns (Backlog, Selected, In Progress, Done)
- [ ] Issue cards show project key prefix (existing behavior via `normalizeBoardIssue` — verify it still works with multi-project data)
- [ ] Drag-and-drop reordering still works for local issues (Jira issues already excluded from drag via `readonly` flag — handled in T06)
- [ ] Filters (search, user, my-only, recent) apply across all projects uniformly
- [ ] Board behaves identically to before when only one (local) project is selected

### Edge cases

- [ ] Selecting zero projects → board shows empty columns with message "Select at least one project"
- [ ] All projects are Jira (no local) → board shows only read-only issue cards
- [ ] Jira not configured → `GET /projects` returns only local projects, no sync attempts, no errors
- [ ] Rapidly toggling project selection → debounce the `GET /project?ids=` call (or use request cancellation)

### Tests

- [ ] `ProjectFilter` component test: renders chips from project list, toggles selection on click, persists to localStorage
- [ ] `ProjectFilter` component test: source icons rendered correctly for local vs Jira projects
- [ ] Board integration test: loads issues from multiple projects, filters correctly when selection changes
- [ ] Existing board tests continue to pass (no regressions in single-project behavior)

## Out of Scope

- Project color indicators on issue cards (optional enhancement, defer to separate ticket)
- Mobile-responsive filter layout (desktop-first, defer to separate ticket)
- "Select All" / "Deselect All" bulk actions on the filter
- Jira-only or local-only quick filter presets
