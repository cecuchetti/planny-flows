# API routes

Generated from the running application, not written by hand. To refresh it:

```bash
uv run python -c "
import warnings; warnings.filterwarnings('ignore')
from planny_api.main import create_app
schema = create_app().openapi()
for path, ops in sorted(schema['paths'].items()):
    for method in sorted(m for m in ops if m in ('get','post','put','patch','delete')):
        print(method.upper(), path, sorted(schema['paths'][path][method]['responses']))
"
```

Last generated: 2026-10-05 — **32 operations across 24 paths**.

---

## Canonical routes

Every domain route is served under `/api/v1`. This is the surface to build on.

| Method | Path | Responses |
|---|---|---|
| `POST` | `/api/v1/authentication/guest` | 200 |
| `GET` | `/api/v1/currentUser` | 200 |
| `GET` | `/api/v1/projects` | 200 |
| `GET` | `/api/v1/project` | 200, 422 |
| `PUT` | `/api/v1/project` | 200, 422 |
| `POST` | `/api/v1/projects/sync` | 200 |
| `POST` | `/api/v1/projects/{project_id}/sync` | 200, 422 |
| `GET` | `/api/v1/issues` | 200, 422 |
| `POST` | `/api/v1/issues` | **201**, 422 |
| `GET` | `/api/v1/issues/{issue_id}` | 200, 422 |
| `PUT` | `/api/v1/issues/{issue_id}` | 200, 422 |
| `DELETE` | `/api/v1/issues/{issue_id}` | **204**, 422 |
| `POST` | `/api/v1/comments` | **201**, 422 |
| `PUT` | `/api/v1/comments/{comment_id}` | 200, 422 |
| `DELETE` | `/api/v1/comments/{comment_id}` | **204**, 422 |
| `GET` | `/api/v1/jira/issues` | 200, 422 |
| `GET` | `/api/v1/jira/issues/{issue_key}` | 200, 422 |
| `GET` | `/api/v1/jira/issues/{issue_key}/transitions` | 200, 422 |
| `POST` | `/api/v1/jira/issues/{issue_key}/transitions` | 200, 422 |
| `GET` | `/api/v1/jira/worklogs` | 200, 422 |
| `POST` | `/api/v1/jira/worklogs` | 200, 422 |
| `GET` | `/api/v1/jira/worklogs/hours-by-date` | 200, 422 |
| `PATCH` | `/api/v1/jira/worklogs/hours-by-date/{date}` | 200, 422 |
| `POST` | `/api/v1/quick-actions/actions/outlook-clean` | 200 |
| `GET` | `/api/v1/quick-actions/actions/outlook-clean/status` | 200 |
| `POST` | `/api/v1/quick-actions/actions/tempo-export` | 200, 422 |
| `GET` | `/api/v1/quick-actions/actions/tempo-export/hours` | 200, 422 |
| `PUT` | `/api/v1/quick-actions/actions/tempo-export/hours` | 200, 422 |
| `GET` | `/api/v1/quick-actions/actions/tempo-export/week` | 200, 422 |

## Unversioned routes

| Method | Path | Why |
|---|---|---|
| `GET` | `/` | Redirects to the client. Application-level, not a domain. |
| `GET` | `/health` | Consumed by `docker-compose.yml` and four scripts under `deploy/scripts/`. |
| `GET` | `/health/ready` | Readiness probe. |
| `GET` | `/health/live` | Liveness probe. |

Health probes are deliberately unversioned: versioning them would break deployment tooling
for no benefit, and they are excluded from the module versioning via `versioned=False`.

## Legacy aliases

Every route above that belongs to a **versioned** module is also served **without** the
`/api/v1` prefix: `/issues`, `/project`, `/comments`, `/quick-actions/...` and so on. The
React client still calls those paths.

The aliases are:
- the **same router object**, mounted a second time — not a copy, so they cannot diverge;
- excluded from the OpenAPI schema, so `/docs` shows one canonical API;
- removable with `API_LEGACY_ALIASES=false`.

Two modules opt out because their legacy path *is* the canonical one: `jira_issues` and
`jira_worklogs` are already mounted under `/api/v1/jira/...`.

The `tests/test_module_mounting.py` suite asserts, for every aliased route, that both paths
return the same status and the same response body (ignoring the per-request `requestId`).

## Error contract

Every error uses one envelope:

```json
{
  "error": { "message": "...", "code": "ENTITY_NOT_FOUND", "status": 404, "data": {} },
  "requestId": "req_..."
}
```

Including 401 (missing **or** invalid token), 409 and 429. Codes come from
`planny_core.errors.ErrorCode`.

## Status codes

| Situation | Code |
|---|---|
| Resource created | `201` |
| Action performed, resource returned | `200` |
| Resource deleted | `204`, no body |
| Validation failure | `422` (FastAPI) or `400` (`BAD_USER_INPUT`) |
| Missing or invalid token | `401` |
| Out of scope or absent | `404` — never `403`, so the API does not confirm existence |
| Read-only Jira issue mutated | `403` (`ISSUE_READONLY`) |
| Already running | `409` (`ALREADY_RUNNING`) |
| Rate limited | `429` with `X-RateLimit-*` |
| Jira not configured | `503` |
| Upstream failure | `502` |

`POST` is **not** universally `201`: `/authentication/guest` is a login that may reuse an
account, and the sync and trigger endpoints start work rather than creating an addressable
resource. They keep `200` because that is accurate.
