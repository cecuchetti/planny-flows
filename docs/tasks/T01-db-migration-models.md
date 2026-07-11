# T01 — DB Migration + Models + Enum

**What to build:** Add source-aware columns to the existing `project` and `issue` SQLAlchemy models, create a many-to-many `user_projects` join table, add the `ProjectSourceType` enum, write an Alembic migration with data migration, and update the `User` model with the new relationship. After this ticket, the database schema fully supports both local and Jira-sourced data — but no sync logic or new API endpoints exist yet. All existing endpoints continue working unchanged (backward compatible).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## Acceptance Criteria

- [ ] `Project` model gains four new mapped columns: `source_type` (string, default "local"), `external_key` (string, nullable), `external_id` (string, nullable), `last_synced_at` (datetime, nullable)
- [ ] `Issue` model gains three new mapped columns: `source_type` (string, default "local"), `external_key` (string, nullable, unique), `readonly` (boolean, default false)
- [ ] New `ProjectSourceType` enum (`LOCAL = "local"`, `JIRA = "jira"`) added to `planny_core.enums` as a `StrEnum`
- [ ] New `user_projects` table defined as a `Table` object with `userId` (FK → user.id) and `projectId` (FK → project.id), composite primary key
- [ ] `User` model updated: new `projects` relationship (many-to-many via `user_projects`), old `project` relationship kept alongside
- [ ] `Project` model updated: `users` relationship now goes through `user_projects` join table instead of the old `user.projectId` FK. `User.projectId` column kept (NOT dropped) for backward compatibility
- [ ] Alembic migration created: upgrade adds all 7 columns + `user_projects` table; downgrade removes them
- [ ] Data migration step in Alembic: all existing rows get `source_type='local'`
- [ ] Data migration step in Alembic: existing `user.projectId` FK values populate `user_projects` (one row per user)
- [ ] All existing model tests continue to pass after schema changes
- [ ] `user.projectId` FK still functional — old queries using it still work

## Out of Scope

- Changing any existing API endpoints to use the new columns
- Creating sync logic (T02)
- Creating new API routes (T03, T04)
- Dropping `user.projectId` (future cleanup phase)
