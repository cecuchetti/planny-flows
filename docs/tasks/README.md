# Tasks

Project management: phase checklists, task tracking, and implementation plans.

## Index

| File | Type | Status |
|------|------|--------|
| [python-migration-checklist.md](./python-migration-checklist.md) | Master checklist (all phases + ticket refs) | Not started |
| [feature_python_migration_monorepo_scaffold.md](./feature_python_migration_monorepo_scaffold.md) | FEATURE-001: Monorepo scaffold | Open |
| [feature_python_migration_planny_core_errors_enums_config.md](./feature_python_migration_planny_core_errors_enums_config.md) | FEATURE-002: Core errors, enums, config | Open |
| [feature_python_migration_models_alembic.md](./feature_python_migration_models_alembic.md) | FEATURE-003: Models + Alembic | Open |
| [feature_python_migration_fastapi_middleware_health.md](./feature_python_migration_fastapi_middleware_health.md) | FEATURE-004: FastAPI + middleware + health | Open |
| [feature_python_migration_health_guest_auth.md](./feature_python_migration_health_guest_auth.md) | FEATURE-005: Health + Guest Auth | Open |
| [feature_python_migration_node_proxy_middleware.md](./feature_python_migration_node_proxy_middleware.md) | FEATURE-006: Node proxy middleware | Open |
| [feature_python_migration_current_user_project_crud.md](./feature_python_migration_current_user_project_crud.md) | FEATURE-007: /currentUser + Project CRUD | Open |
| [feature_python_migration_issues_crud.md](./feature_python_migration_issues_crud.md) | FEATURE-008: Issues CRUD | Open |
| [feature_python_migration_comments_crud.md](./feature_python_migration_comments_crud.md) | FEATURE-009: Comments CRUD | Open |
| [feature_python_migration_quick_actions.md](./feature_python_migration_quick_actions.md) | FEATURE-010: Quick Actions | Open |
| [feature_python_migration_jira_http_client_config.md](./feature_python_migration_jira_http_client_config.md) | FEATURE-011: Jira HTTP client | Open |
| [feature_python_migration_jira_worklog_service.md](./feature_python_migration_jira_worklog_service.md) | FEATURE-012: Worklog Service | Open |
| [feature_python_migration_jira_issue_routes.md](./feature_python_migration_jira_issue_routes.md) | FEATURE-013: Jira Issue routes | Open |
| [debt_python_migration_remove_node_backend.md](./debt_python_migration_remove_node_backend.md) | DEBT-001: Remove Node backend | Open |
| [debt_python_migration_docker_ci.md](./debt_python_migration_docker_ci.md) | DEBT-002: Docker + CI/CD | Open |
| [feature_python_migration_monitoring_deferred.md](./feature_python_migration_monitoring_deferred.md) | FEATURE-014: Monitoring (deferred) | Open |

## How to Use

1. Start with FEATURE-001, work sequentially through tickets 1→13
2. Check items in [python-migration-checklist.md](./python-migration-checklist.md) as completed
3. **When a ticket is done**: move its `.md` to [done/](./done/), append completion date to filename
4. DEBT-002 (Docker/CI) can run in parallel with feature tickets
5. DEBT-001 (Node removal) only after 2+ weeks production verification
6. FEATURE-014 (monitoring) is deferred — placeholder only
7. Reference [architecture docs](../architecture/) for implementation guidance
