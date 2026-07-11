---
type: feature
priority: medium
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, crud, comments]
keywords: [comments, CRUD, cascade, issue_id, user_id, project scope]
patterns: [comment creation, project-scoped access, cascade delete]
---

# FEATURE-009: /comments CRUD

## Description

Implement Comment CRUD endpoints. Comments are scoped to an issue within the user's project. This is the smallest Phase 2 route set and completes the core domain CRUD migration.

## Context

Blueprint Section 8, Phase 2. Comments have a simple schema (body, userId, issueId) but require project-scoping verification: you can only comment on issues in your project, and can only edit/delete your own comments.

## Requirements

### Functional Requirements

**POST /comments:**
- Authenticate, validate body `{ body, issueId }`
- Verify issue belongs to user's project (404 if not)
- Create comment with `user_id = currentUser.id`
- Return `{ comment: { id, body, userId, issueId, createdAt, updatedAt, user: userPartial } }`

**PUT /comments/:commentId:**
- Authenticate, verify comment exists and belongs to current user
- Update `body`
- Return updated comment with user partial

**DELETE /comments/:commentId:**
- Authenticate, verify comment exists and belongs to current user
- Delete comment
- Return 200 success

### Non-Functional Requirements

- Eager load `comment.user` on response
- Cascade delete handled by FK constraint (ON DELETE CASCADE from Issue)
- Response format must match Node's comment endpoints

## Current State

`api/src/controllers/comments.ts` — reference implementation.

## Success Criteria

### Automated Verification
- [ ] `POST /comments` creates comment, returns with user partial
- [ ] Comment on issue from another project → 404
- [ ] `PUT /comments/1` updates body, returns updated comment
- [ ] `PUT /comments/1` by another user → 404 (ownership check)
- [ ] `DELETE /comments/1` deletes comment
- [ ] Delete issue → comments cascade deleted (verify 0 comments)
- [ ] Response JSON matches Node for same data

### Manual Verification
- [ ] Create comment via Python → appears in Node `/issues/:id` response (shared DB)
- [ ] With proxy active: `curl -X POST http://localhost:3824/comments ...` → Python response

## Related Information

- Depends on: FEATURE-007 (CRUD patterns), FEATURE-008 (issues must exist)
- Required for: Phase 2 completion — last core CRUD route
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 8, Phase 2

## Notes

The user partial embedded in comment responses must match Node's format. Feels redundant to load the user for their own comment, but Node does it — must match for response parity.
