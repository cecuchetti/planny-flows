---
type: feature
priority: high
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, crud, issues, search, striptags]
keywords: [issues, CRUD, searchTerm, listPosition, striptags, bleach, descriptionText]
patterns: [issue search, position calculation, HTML stripping, description text auto-generation]
---

# FEATURE-008: /issues CRUD + search + striptags + listPosition

## Description

Implement full Issue CRUD with search, the `descriptionText` auto-generation hook (replaces TypeORM `@BeforeInsert`), and `listPosition` auto-calculation for new issues. This is the core domain entity — the most used route in the entire app.

## Context

Blueprint Section 8, Phase 2. Issues are the primary entity users interact with. The search endpoint uses `LIKE` on title + descriptionText. New issues auto-calculate `listPosition` as the max existing position + 1. The `descriptionText` field is auto-stripped from HTML on save (mimics TypeORM's `striptags` decorator hook).

## Requirements

### Functional Requirements

**GET /issues?searchTerm=...:**
- Authenticate, scope to `currentUser.projectId`
- If `searchTerm` provided: `WHERE (title LIKE '%term%' OR description_text LIKE '%term%') AND project_id = ?`
- If no searchTerm: return all issues for project
- Return `{ issues: [issuePartial, ...] }`
- Issue partial includes `userIds` (array of numbers)

**GET /issues/:issueId:**
- Authenticate, verify issue belongs to user's project
- Eager load `users`, `comments`, `comments.user`
- Return `{ issue: full_issue_dict }`

**POST /issues:**
- Validate body with Pydantic model (title, type, status, priority required; description, estimate, timeSpent, timeRemaining, reporterId optional)
- Auto-calculate `listPosition` = `MAX(existing list_position for project) + 1`
- Create issue with `project_id = currentUser.projectId`
- Return `{ issue: new_issue_dict }`

**PUT /issues/:issueId:**
- Authenticate, verify ownership
- Update allowed fields
- Return `{ issue: updated_issue_dict }`

**DELETE /issues/:issueId:**
- Authenticate, verify ownership
- Delete issue (cascade deletes comments)
- Return 200 success

**striptags hook:**
- SQLAlchemy event listener on `Issue` (before_insert, before_update)
- Strip HTML tags from `description` → set `description_text`
- Use `bleach.clean(description, tags=[], strip=True)`

### Non-Functional Requirements

- B-tree indexes on (project_id, status), (project_id, title), (project_id, description_text) for search performance
- `selectinload` for eager loading relationships
- All responses camelCase

## Current State

`api/src/controllers/issues.ts`, `api/src/services/IssueService.ts`, `api/src/repositories/IssueRepository.ts` — reference implementations.

## Research Context

### Keywords to Search
- `searchTerm` — search parameter in query string
- `listPosition` — float field, auto-calculated
- `striptags` — HTML stripping in TypeORM entity
- `descriptionText` — auto-generated from description

### Key Decisions Made
- **bleach over html2text**: Direct replacement for striptags, same output
- **Float for listPosition**: Allows insertion between two positions
- **LIKE over FULLTEXT**: SQLite compatibility, sufficient for project-scoped data

## Success Criteria

### Automated Verification
- [ ] `GET /issues` returns all issues for user's project
- [ ] `GET /issues?searchTerm=bug` returns only matching issues
- [ ] `GET /issues/1` returns full issue with users and comments
- [ ] `POST /issues` creates issue with auto-calculated listPosition
- [ ] `PUT /issues/1` updates issue fields
- [ ] `DELETE /issues/1` deletes issue and its comments
- [ ] Cross-project access denied (issue from other project → 404)
- [ ] striptags test: `description="<p>Hello</p>"` → `description_text="Hello"`
- [ ] listPosition test: create 3 issues → positions are 1.0, 2.0, 3.0
- [ ] Response JSON matches Node for same data (snapshot test)

### Manual Verification
- [ ] `curl http://localhost:3824/issues?searchTerm=test` with proxy active → Python response

## Related Information

- Depends on: FEATURE-007 (CRUD patterns, serializers)
- Blocks: FEATURE-009 (comments — FK to issue)
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 5 + 8

## Notes

The `descriptionText` SQLAlchemy event listener uses the mapper-level event (not instance-level) to match TypeORM's `@BeforeInsert` behavior — fires during `session.flush()`, not on property assignment.
