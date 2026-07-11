---
type: feature
priority: high
created: 2026-07-11T12:00:00Z
status: open
tags: [python, migration, jira, http-client, config, yaml]
keywords: [httpx, AsyncClient, JiraHttpClient, event hooks, PyYAML, jira-instances.yaml]
patterns: [HTTP client abstraction, logging interceptors, YAML config, env var interpolation]
---

# FEATURE-011: Jira HTTP client + YAML config loader

## Description

Port the Jira HTTP client abstraction from Axios to httpx and the YAML config loader from js-yaml to PyYAML. This is the foundation for all Jira integration routes (Phase 4). The client supports dual instances (Internal/Tempo + External client Jira) with basic/bearer auth and logging interceptors.

## Context

Blueprint Section 6. The existing Axios-based Jira client in `api/src/jira-integrations/integrations/` uses interceptors for request/response logging. The YAML config (optional file `jira-instances.yaml`) supports `${ENV_VAR}` interpolation for credentials.

## Requirements

### Functional Requirements

**JiraHttpClient (`planny-jira/src/planny_jira/client.py`):**
- `JiraInstanceConfig` dataclass: base_url, auth_type ("basic"|"bearer"), email, api_token, timeout_ms, system_name, fixed_issue_key, my_account_id
- `JiraHttpClient` class wrapping `httpx.AsyncClient` with:
  - BasicAuth or BearerAuth based on config
  - Event hooks: `_log_request` (DEBUG level), `_log_response` (DEBUG for 2xx/3xx, WARNING for 4xx/5xx)
  - Duration tracking in response log
  - `get(path, **kwargs) → dict` and `post(path, json_data, **kwargs) → dict` convenience methods
  - `raise_for_status()` on every response
  - `close()` to cleanup the async client

**YAML config loader (`planny-jira/src/planny_jira/config.py`):**
- `get_jira_instance_config(instance_name) → JiraInstanceConfig`: Load from YAML file or env vars
- `get_worklog_instance_names() → dict`: Return `{ internal: "vis-2", external: "external-jira" }`
- Support `${ENV_VAR_NAME}` interpolation in YAML values (same as js-yaml pattern)
- Fallback chain: YAML file → env vars → defaults

### Non-Functional Requirements

- httpx timeout handling matching Axios `timeout` config
- Logging uses structlog with `system=<name>` binding

## Current State

`api/src/jira-integrations/integrations/baseClient.ts` — reference Axios wrapper. `api/src/jira-integrations/config/instances.ts` — reference YAML loader.

## Success Criteria

### Automated Verification
- [ ] `JiraHttpClient` created with BasicAuth config → `async get()` returns dict
- [ ] `JiraHttpClient` created with BearerAuth config → correct `Authorization: Bearer xxx` header
- [ ] HTTP 4xx response → logged at WARNING, raises `httpx.HTTPStatusError`
- [ ] HTTP 5xx response → logged at WARNING, raises `httpx.HTTPStatusError`
- [ ] Request/response logged with system name and duration_ms
- [ ] `client.close()` cleans up connection pool
- [ ] YAML config loader resolves `${INTERNAL_JIRA_EMAIL}` to env var value
- [ ] Missing YAML file → falls back to env vars
- [ ] `get_worklog_instance_names()` returns correct keys

### Manual Verification
- [ ] With real Jira creds (if available): `GET /rest/api/2/myself` returns user data

## Related Information

- Depends on: FEATURE-001 (planny-jira package scaffold)
- Blocks: FEATURE-012 (worklog service), FEATURE-013 (issue service)
- Reference: `docs/architecture/2026-07-11-python-migration-blueprint.md` Section 6

## Notes

The BearerAuth class is a custom httpx Auth implementation. Not built into httpx like BasicAuth — needs a small custom class: `class BearerAuth(httpx.Auth): def auth_flow(self, request): request.headers["Authorization"] = f"Bearer {self.token}"; yield request`
