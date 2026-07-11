# T07 — Sidebar Deprecation + Route Redirect

**What to build:** Update the sidebar navigation to reflect the unified board. The "External Assignments" nav item no longer links to the separate `/my-jira-issues` screen — instead it links to the unified board with a query parameter that pre-selects only Jira projects. The old `/my-jira-issues` route becomes a redirect wrapper (kept for one release cycle to avoid breaking bookmarks). The board accepts a `?filter=` query parameter to initialize the project filter state.

**Blocked by:** T05 (unified board must be in place to redirect to).

**Status:** ready-for-agent

## Acceptance Criteria

### Sidebar update

- [ ] "External Assignments" (`🔗`) nav item in sidebar now links to `/project/board?filter=jira` instead of `/project/my-jira-issues`
- [ ] Nav item label remains "External Assignments" (or equivalent i18n key) — no label change needed
- [ ] Nav item icon remains `🔗` — no visual breakage
- [ ] Active/highlight state works correctly: item is highlighted when user is on `/project/board?filter=jira`
- [ ] All other sidebar items (Kanban Board, Project Settings, Quick Actions) unchanged
- [ ] Mobile sidebar also updated (same `Sidebar` component handles both)

### Board filter param support

- [ ] Board reads `?filter=` query parameter from URL on mount
- [ ] When `filter=jira`: pre-selects only Jira projects in the `ProjectFilter`, deselects local projects
- [ ] When `filter=local`: pre-selects only local projects (future use)
- [ ] When `filter=all` or absent: all projects selected (default behavior)
- [ ] Filter param takes precedence over localStorage on initial load (but user can change selection afterward)
- [ ] When user changes filter selection manually, the URL does NOT update (query param is only for initial navigation)

### Old route deprecation

- [ ] `/project/my-jira-issues` route still works — redirects to `/project/board?filter=jira`
- [ ] Redirect uses React Router `<Navigate to="/project/board?filter=jira" replace />` so browser back button doesn't get stuck in redirect loop
- [ ] The `MyJiraIssues` component is kept in the codebase but its route just renders the redirect
- [ ] No visual flash or error during redirect

### Edge cases

- [ ] User with no Jira projects visits `/project/board?filter=jira` → shows empty board with "No Jira projects" message (or all projects if no Jira-specific filter makes sense — discuss in implementation)
- [ ] User manually types old URL → redirect works, no console errors
- [ ] Browser back button from unified board → goes back to whatever page they came from (not stuck in redirect loop)

### Tests

- [ ] `Sidebar` component test: "External Assignments" links to `/board?filter=jira`, not `/my-jira-issues`
- [ ] `Sidebar` component test: all other links unchanged
- [ ] Board test: `filter=jira` query param pre-selects only Jira projects
- [ ] Board test: `filter=all` or no param selects all projects
- [ ] Route test: navigating to `/my-jira-issues` redirects to `/board?filter=jira`
- [ ] Existing sidebar tests pass (no regressions)

## Out of Scope

- Full removal of `MyJiraIssues` component and its sub-components (deferred to cleanup phase — separate ticket)
- Removing the `my-jira-issues` i18n translation keys (may still be used by redirect page)
- "Jira-only" quick filter chip in `ProjectFilter` (out of scope for T05)
- Analytics or tracking of redirect usage
