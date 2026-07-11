# T06 — Read-Only Jira Issue Detail Modal

**What to build:** Modify the existing `IssueDetails` modal component to support a read-only mode for Jira-sourced issues. When an issue has `readonly=true`, all fields render as non-editable text (no edit buttons, no inline editing). Show a "Log Time" button that opens the existing `TimeEntryModal` pre-filled with the issue's `external_key`. Show a "View in Jira" external link constructed from the issue's `external_key`. Local issues (`readonly=false`) remain fully editable — no regression.

**Blocked by:** T04 (API returns `readonly` + `external_key` in issue responses), T05 (board must display clickable Jira issue cards).

**Status:** ready-for-agent

## Acceptance Criteria

### Read-only mode rendering

- [ ] `IssueDetails` checks `issue.readonly` flag on mount
- [ ] When `readonly=true`:
  - [ ] Title: rendered as static text (no inline edit)
  - [ ] Type: rendered as static badge/text (no dropdown)
  - [ ] Status: rendered as static badge/text (no dropdown)
  - [ ] Priority: rendered as static indicator (no selector)
  - [ ] Description: rendered as read-only HTML/content (no editor)
  - [ ] Assignees/Reporter: rendered as static avatar list (no add/remove)
  - [ ] Estimate/Tracking: rendered as static numbers (no inline edit)
  - [ ] Dates: rendered as static text
  - [ ] Comments: rendered as read-only list (no add comment form)
  - [ ] Delete button: hidden
- [ ] "Log Time" button visible in the modal header or actions area when `readonly=true`
- [ ] "View in Jira" external link visible, constructed from `issue.external_key` (e.g., `https://{jira-base-url}/browse/{external_key}`)
- [ ] When `readonly=false` (local issues): ALL existing edit functionality works exactly as before — no regression

### "Log Time" button behavior

- [ ] Clicking "Log Time" opens the existing `TimeEntryModal` component
- [ ] Modal receives the issue's `external_key` (e.g., "VIS-123") as a prop so worklogs are submitted against the correct Jira issue
- [ ] On successful worklog submission: the modal closes and the issue's `timeSpent` updates (if the existing worklog flow already refreshes the issue)
- [ ] On worklog submission error: error is shown within the `TimeEntryModal` (existing behavior, no changes needed)

### "View in Jira" link behavior

- [ ] Link opens in a new browser tab (`target="_blank" rel="noopener noreferrer"`)
- [ ] Link URL constructed from the Jira base URL (from existing config/env vars) + `/browse/` + `issue.external_key`
- [ ] If Jira base URL is not configured, show the link as disabled or hide it with a tooltip

### Visual distinction

- [ ] Read-only modal has a subtle visual indicator (e.g., "Read-only — Jira issue" badge or banner at the top)
- [ ] Edit buttons and interactive elements are either hidden or visibly disabled (greyed out with `cursor: not-allowed`)

### Edge cases

- [ ] Issue has `external_key` but Jira is not configured → "View in Jira" link hidden, "Log Time" button hidden or disabled with explanation
- [ ] Issue has `readonly=true` but no `external_key` (edge case, shouldn't happen in practice) → "Log Time" and "View in Jira" both hidden
- [ ] Rapid open/close of multiple issue modals → no state leakage between issues

### Tests

- [ ] `IssueDetails` component test: renders read-only mode when `readonly=true` — verifies all fields are non-editable, no edit buttons
- [ ] `IssueDetails` component test: "Log Time" button visible and functional when `readonly=true`
- [ ] `IssueDetails` component test: "View in Jira" link visible with correct URL when `external_key` present
- [ ] `IssueDetails` component test: normal edit mode still works when `readonly=false` (regression test)
- [ ] `IssueDetails` component test: delete button hidden for read-only issues
- [ ] Existing issue detail tests pass (no regressions)

## Out of Scope

- Changes to the `TimeEntryModal` component itself (it already works with Jira issue keys)
- Jira issue transitions (changing status via Jira API)
- Jira issue editing inline (always redirects to Jira for edits)
- Worklog submission flow changes (existing Jira worklog API unchanged)
