# Blueprint: Runtime Configuration (Database + UI)

| Field | Value |
|---|---|
| Date | 2026-10-05 |
| Status | **Proposal — pending review** |
| Scope | Backend configuration layer + `settings` module + one client tab |
| Complements | [Backend modular blueprint](./2026-10-05-backend-modular-blueprint.md) |
| Requirement source | Direct user request: two configuration sources, one of them database-backed and editable from the UI in its own tab, falling back to `.env` defaults without promoting `.env` |

---

## 1. Requirement

Two ways to configure the application:

1. **Database-backed, editable from the UI** in its own tab: database urls, passwords, paths, hosts, Jira urls, and so on.
2. **`.env` defaults**, used only when the database has no value for a key.

`.env` is explicitly **not** the promoted path: it is a fallback for first run and for
bootstrap values, not the primary configuration surface.

---

## 2. The bootstrap paradox

This is the first thing that must be solved, because it constrains the whole design.

> Reading the settings table requires a database connection.
> The database connection is itself a setting.

```
to read settings  ->  need a DB session
to get a DB session ->  need db.host, db.password, db.path ...
those are settings  ->  stored in the settings table  ->  need a DB session
```

Any design that ignores this either deadlocks or silently ships "database settings that
cannot actually change the database".

There is a second, independent instance of the same problem: **secrets must be encrypted
at rest, but the encryption key cannot live in the encrypted store.**

Both are solved the same way: a small, explicitly separate **bootstrap tier** that cannot
come from the database, because it is what makes reaching the database possible.

---

## 3. Design: two tiers

| Tier | Contents | Storage | Editable in UI |
|---|---|---|---|
| **0 — Bootstrap** | What is needed to *reach* the settings store and *decrypt* it: DB connection, master encryption key, first-admin identity | Process env → bootstrap cache file → `.env` | **No** (view-only, masked) |
| **1 — Runtime** | Everything else: Jira instances/urls/tokens, quick actions, sync tuning, CORS, rate limits, feature flags, API settings, **and the database override** | `app_setting` table in the database | **Yes**, in its own tab |

### 3.1 Resolution order

```
Bootstrap keys (tier 0):
    process env  >  bootstrap cache file  >  .env  >  code default
    (the database can never supply these — that is the point)

Runtime keys (tier 1):
    database  >  process env  >  .env  >  code default
    (database wins, per the requirement: ".env is only a default")
```

Both orders are declarative, not implicit: they live in one registry (§5) and are covered
by table-driven tests.

### 3.2 The database-override case

The request explicitly lists "database urls, passwords, paths, hosts" as UI-editable. That
is supported, with one honest caveat.

At startup:

1. Resolve the **bootstrap** DB connection (tier 0) and connect.
2. Read the tier-1 override set (`database.*`).
3. If an override exists and differs from the bootstrap connection:
   - dispose the bootstrap engine, build a new one from the override, and continue;
   - log `config.database.override_applied` with both targets (password omitted).

At runtime, editing `database.*` from the UI:

- persists the new values;
- marks them `apply = RESTART` (see §7), because hot-swapping the engine under in-flight
  transactions is not safe;
- the UI shows a "restart required" banner.

**The restart problem.** If the process restarts and no tier-0 database variables are
present, the app cannot reach the database to read the tier-1 override. Mitigation: a
**bootstrap cache file**.

### 3.3 Bootstrap cache file

On every successful start, the app writes the *effective* bootstrap connection to
`data/bootstrap.json` (mode `0600`, gitignored). Resolution becomes:

```
process env  >  bootstrap cache file  >  .env  >  code default
```

So the first run needs env variables (or `.env`), and every later run is self-sufficient
even if the env is emptied — which is what makes "configure the database from the UI"
actually work across restarts.

> **Decision point for review.** This is the one place where the design writes a
> credential to local disk. It never stores the master key (that must always come from the
> environment), only the connection settings. Two alternatives:
>
> - **Option A (recommended, described above):** bootstrap cache file. DB connection is
>   fully UI-editable. Cost: a DB password on local disk with `0600`, next to the existing
>   SQLite database file which already holds the same class of data.
> - **Option B:** no cache file. DB connection is read-only in the UI (shown masked) and
>   changed only through env / a secret file. Cost: contradicts the request's list.
>
> The remaining sections assume Option A.

---

## 4. Secret handling

Several tier-1 values are credentials: database passwords, Jira API tokens, the Outlook
cleaner API key.

| Rule | Detail |
|---|---|
| Encrypted at rest | AES-GCM (via `cryptography`, declared explicitly in `planny-core`) — **verified**: `cryptography` 49.0.0 is importable and an AES-GCM round-trip works; the ciphertext does not contain the plaintext. It currently arrives transitively through `python-jose[cryptography]`, so it must be added to `planny-core` dependencies explicitly rather than relied upon |
| Key source | `PLANNY_BOOTSTRAP__MASTER_KEY` (tier 0, env only, never stored in the DB) |
| Key rotation | Ciphertext rows carry a `key_id`; new writes use the current key, old rows decrypt by id |
| Never returned | `GET /settings` returns `{"is_set": true, "value": null}` for secrets; the UI renders a masked placeholder |
| One-way writes | Send a value to replace, send `null` to clear. There is no "read it back" path |
| Fail closed | If secrets exist in the DB but no master key is configured, startup **aborts** with an actionable message. Never silently falls back to plaintext |
| Never logged | Request logging must redact secret-bearing keys (§9) |

---

## 5. The settings key registry — the "no hardcoding" answer

One declarative registry drives resolution, storage, validation, the REST API, the UI form
and the documentation. **Adding a setting is one entry**, not a change in six places.

```python
# planny_api/modules/settings/registry.py

class Tier(StrEnum):
    BOOTSTRAP = "bootstrap"   # tier 0 — env only, never DB-backed
    RUNTIME = "runtime"       # tier 1 — DB-backed, UI-editable


class ApplyMode(StrEnum):
    LIVE = "live"             # rebuild the affected resource immediately
    RESTART = "restart"       # persist now, apply on next start


class SettingType(StrEnum):
    STRING = "string"
    SECRET = "secret"
    INTEGER = "integer"
    BOOLEAN = "boolean"
    URL = "url"
    ENUM = "enum"


@dataclass(frozen=True, slots=True)
class SettingKey:
    key: str                  # "jira.external.base_url"
    type: SettingType
    tier: Tier
    default: object
    group: str                # UI section, e.g. "Jira"
    label: str                # UI label
    help: str = ""
    apply: ApplyMode = ApplyMode.LIVE
    choices: tuple[str, ...] = ()
    env_aliases: tuple[str, ...] = ()   # legacy flat names, e.g. ("EXTERNAL_ATLASSIAN_BASE_URL",)


SETTINGS: tuple[SettingKey, ...] = (
    # ── Tier 0 — bootstrap ────────────────────────────────────────────────
    SettingKey("bootstrap.master_key", SettingType.SECRET, Tier.BOOTSTRAP, None,
               group="Bootstrap", label="Master encryption key",
               env_aliases=("PLANNY_BOOTSTRAP__MASTER_KEY", "PLANNY_MASTER_KEY")),
    SettingKey("bootstrap.db.type", SettingType.ENUM, Tier.BOOTSTRAP, "postgres",
               group="Bootstrap", label="Database engine",
               choices=("postgres", "sqlite"),
               env_aliases=("PLANNY_BOOTSTRAP__DB_TYPE", "DB_TYPE")),
    # ... host, port, username, password, database, path

    # ── Tier 1 — runtime ─────────────────────────────────────────────────
    SettingKey("jira.external.base_url", SettingType.URL, Tier.RUNTIME, "",
               group="Jira", label="External Atlassian base URL",
               env_aliases=("EXTERNAL_ATLASSIAN_BASE_URL",)),
    SettingKey("jira.external.api_token", SettingType.SECRET, Tier.RUNTIME, None,
               group="Jira", label="External API token",
               env_aliases=("EXTERNAL_JIRA_API_TOKEN",)),
    SettingKey("database.host", SettingType.STRING, Tier.RUNTIME, None,
               group="Database", label="Host", apply=ApplyMode.RESTART, ...),
)
```

Because `env_aliases` carries the existing flat names, **every variable currently in
`.env.example` keeps working unchanged** — the migration is lossless (verified: 20 of 31
map 1:1, the other 11 are the per-instance Jira variables handled by the prefix selector
described in the main blueprint).

---

## 6. Storage model

```sql
CREATE TABLE app_setting (
    key             VARCHAR(120) PRIMARY KEY,
    value_encrypted TEXT,           -- NULL means "unset" -> fall back to the next tier
    is_secret       BOOLEAN NOT NULL DEFAULT FALSE,
    key_id          VARCHAR(40),    -- master key identifier, for rotation
    updated_at      DATETIME NOT NULL,
    updated_by      INTEGER REFERENCES "user"(id)
);
```

Notes:

- The table stores **only overrides**. Absence of a row means "no override", which is what
  makes the `.env` / default fallback work without duplicating values.
- One Alembic migration; no changes to existing tables.
- `updated_by` provides a minimal audit trail, which matters because these are credentials.

---

## 7. Applying changes

| Mode | Keys | Behaviour |
|---|---|---|
| `LIVE` | Jira instances, quick actions, sync tuning, CORS, rate limits, feature flags | The settings service rebuilds the affected piece of the `AppContext` immediately; the next request uses it. No restart |
| `RESTART` | Database connection | Persisted immediately, applied on next start. The UI shows a "restart required" badge |
| — | Master key (tier 0) | Never editable from the UI |

The client needs no logic for this: `GET /settings` returns the `apply` mode per key and
the tab renders the badge generically.

---

## 8. ⚠️ Blocking prerequisite: authorization

**This is the most important finding in this document, and it is a security issue, not a
design preference.**

The settings API reads and writes database passwords and Jira API tokens. The current
authentication model has **no notion of roles**: `POST /authentication/guest` creates an
account for anyone who calls it, and every authenticated user has identical privileges.

Shipping the settings endpoint on top of that model means **any anonymous visitor can read
your database password and overwrite your infrastructure credentials**.

Therefore the settings module **must not ship before an authorization model exists**:

| Prerequisite | Detail |
|---|---|
| `user.role` column | `admin` \| `member`, with a migration and a model default of `member` |
| `require_admin` dependency | Lives in `planny_api/core/security/policies.py`, reuses the module-level dependency plumbing |
| First admin bootstrap | From `PLANNY_BOOTSTRAP__ADMIN_EMAIL` (tier 0). On first run, that user is promoted to `admin` |
| Fail closed | If no admin can be resolved, the settings module is **disabled**: its routes are not mounted and a clear message is logged. It never falls back to "everyone is an admin" |
| Route protection | Read and write are both admin-only. Non-admin receives `403 FORBIDDEN` |
| Audit | `updated_by` + structured log entry per change, with the key name but never the value |

This is recorded as a hard phase gate: **C2 must complete before C4**.

The main blueprint already lists this under "out of scope → real authentication
(email/password, SSO)". That remains out of scope. Roles are the minimum needed to make
the settings tab safe; full authentication is a separate, larger piece of work.

---

## 9. API surface

New module `planny_api/modules/settings/`, mounted like any other (canonical
`/api/v1/settings`, with the legacy alias mechanism available but not needed for a new
module).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/settings` | admin | Effective values + metadata (group, label, help, type, apply mode, `is_set`). Secrets masked |
| `PUT` | `/api/v1/settings` | admin | Partial update. `null` clears an override and restores the fallback |
| `POST` | `/api/v1/settings/test/database` | admin | Server-side connection probe with the submitted (or stored) values |
| `POST` | `/api/v1/settings/test/jira` | admin | Server-side probe per Jira instance |
| `GET` | `/api/v1/settings/schema` | admin | Registry metadata only, for client form generation |

`PUT` response reports, per key: `applied: "live" | "pending_restart"`, so the UI can show
exactly what took effect.

Request logging middleware must redact any query/body key whose registry entry is a secret.

---

## 10. Client tab

A single new tab, rendered **from the registry**, not from hardcoded form fields:

- Grouped by `group` (Database, Jira, Quick actions, Sync, API, ...).
- Widget chosen from `type`; `secret` renders a masked input with Set / Replace / Clear.
- `apply == RESTART` renders a badge and a banner after a successful write.
- "Test connection" buttons call the probe endpoints.
- The tab is hidden entirely for non-admins (the API enforces it regardless).
- Adding a setting to the registry makes it appear in the UI with **no client change**.

---

## 11. Testing

| Area | Test |
|---|---|
| Resolution order | Table-driven: bootstrap keys never read the DB; runtime keys prefer DB over env over default |
| Overrides | A row overrides the env value; deleting the row restores the env value |
| Secrets | Write → row is ciphertext (assert plaintext is absent from the column) → `GET` returns `is_set: true, value: null` |
| Fail closed | Secrets present + no master key → startup aborts with an actionable message |
| Authorization | Non-admin gets 403 on `GET` and `PUT`; no admin resolvable → routes not mounted |
| Apply modes | `LIVE` key changes behaviour without restart; `RESTART` key reports `pending_restart` |
| Database override | Startup with a differing override reconnects; password never appears in logs |
| Bootstrap cache | Start with env → cache written `0600`; start with empty env → cache used |
| Losslessness | Every variable in `.env.example` still resolves (regression guard for the migration) |
| Registry integrity | Keys unique; every `Tier.BOOTSTRAP` key has no DB override path; every key has a group and label |

---

## 12. Phases

| Phase | Content | Gate |
|---|---|---|
| **C1** | `SettingKey` registry + layered resolver + bootstrap cache. No database layer yet | **DONE** — `planny_core/config/` package (`keys.py`, `resolver.py`, `bootstrap.py`); 34 keys in 7 groups, 6 typed as secrets, 8 flagged restart-only. 58 new tests |
| **C2** | **Authorization prerequisite:** `user.role`, `require_admin`, first-admin bootstrap, fail-closed | **DONE** — `UserRole` enum, `user.role` column with an unprivileged server default, `require_admin`, promotion of the configured admin at authentication, and a migration. 14 role tests + 12 migration-hygiene tests |
| **C3** | `app_setting` table + `SettingsStore` + AES-GCM. Fail-closed if secrets exist and there is no master key | **DONE** — `config/crypto.py` (AES-256-GCM, HKDF-derived key, `key_id` per ciphertext) and `config/store.py` (`SettingsStore`, `resolve_stored_settings`). 54 new tests |
| **C4** | Admin-only settings API with live/restart apply modes | **DONE** — `modules/settings/` (router, service, schemas). Mounted only when an administrator is configured; every route behind `require_admin`. 32 new tests |
| **C5** | Client tab rendered from the registry | **DONE** — `client/src/Configuration/` (page, `Field.jsx`, `Styles.js`, `formState.js`). Route `/configuration`, linked from the navbar for administrators only. 16 unit tests |
| **C6** | Bootstrap cache file + database-override apply-on-restart | Start with empty env after a UI edit |

C1 folds into Phase 1 of the main blueprint: the layered resolver **is** the configuration
kernel. Building `Settings` as a static pydantic object first would mean rewriting it here.

---

## 13. Decisions — RESOLVED

All four were answered on 2026-10-05.

| # | Question | Decision |
|---|---|---|
| 1 | Bootstrap cache file | **Option A** — the DB connection is fully editable from the UI, with the last known-good connection cached at `data/bootstrap.json` (`0600`). The master key is never cached. |
| 2 | Precedence | **Confirmed**: `database > process env > .env > default`. Not 12-factor, by design: the requirement is that `.env` acts only as a fallback. |
| 3 | Roles scope | **Minimal roles now.** `admin`/`member` plus a first admin from an environment variable, with the module failing closed. Full authentication is deferred. |
| 4 | Master key | **Environment variable for now.** External key management is deferred. |

### One deviation from §3, recorded

This document originally described three interchangeable sources (database, environment,
default) behind one resolver. In the implementation the environment and ``.env`` tiers stay
where they already work correctly — inside ``Settings``, via pydantic-settings — and the
resolver contributes the tier pydantic cannot know about.

Reimplementing the environment tier as a source would have duplicated a working
implementation, along with its alias handling and type coercion, to reach the same result.
The observable precedence is unchanged: ``database > process env > .env > default``.

What the resolver *does* add beyond merging is **revalidation**. Applying overrides with
``model_copy`` would bypass validation entirely and let a bad stored value — a port of
``"abc"`` — reach the engine builder. Every override is applied to a fully resolved
``Settings`` and the result is validated.

### Two security decisions worth recording

**A secret is never read back.** The settings API can list which keys are stored and
whether each is a secret, but a secret's value is never returned — only the fact that one
exists. An admin may replace a token; reading it back would put every credential on screen
and into every response body captured by a log or a proxy.

**The store fails closed.** If a secret is stored and no master key is available, loading
raises instead of skipping the row. Skipping would start the application with credentials
the operator believes are configured but which are silently not in effect — the failure
would surface later, as an authentication error against Jira, with nothing pointing at the
cause.

Both are covered by tests, and so is the case that a *different* master key is detected:
every ciphertext records the fingerprint of the key that produced it, so the error can say
which key is expected rather than surfacing as an opaque decryption failure.

### A hole found while reviewing

`SettingsStore` originally built its lookup map from the whole registry, including the
bootstrap keys. A row written directly into the table as `bootstrap.master_key` was then
read as an ordinary override, which would have replaced the key used to decrypt the store
with one supplied through the database. The store now only exposes keys marked as stored;
`bootstrap.*` rows are skipped with a warning, and saving one is refused. There is a
regression test.

### Apply modes are read from the resource's lifetime

A key is marked ``live`` only when the application re-reads it **at call time**. The
distinction is not cosmetic: reporting ``applied`` for a value the running process is not
using would be a claim the health check would immediately contradict.

That audit moved twelve keys from ``live`` to ``restart``. The Jira clients and the worklog
service are constructed once in ``build_context``, so a changed base URL or token cannot
reach the process without a restart, however attractive it is to pretend otherwise. What
remains ``live`` is what genuinely is: the sync parameters, the quick-action settings, the
token lifetime and the fallback avatar URL.

The same reasoning produced ``storedValue`` in the listing: for a restart key, ``value`` is
the value still in effect and ``storedValue`` is the pending one. The UI can then say
"pending, restart required" without the API inventing a value that is not running.

### The loop had to be closed, or none of it was real

The store, the resolver, the crypto layer, the API and the tab were all implemented and
tested while **nothing called them at startup**. A value could be saved, validated,
encrypted and reported as applied, and the process would never read it. Every test passed.

The wiring lives in `app/lifespan.py`:

1. resolve the **bootstrap tier** — process environment, then the cache file, then `.env`;
2. build the process database from it and read the store;
3. apply the overrides to the settings object **the application reads**, and hand the
   resolved settings to `build_context` so resources are built from stored values;
4. record the connection that worked.

That also required the database to stop being built at import time. It is now created on
first use and resolved through the bootstrap tier, which is the only way the cache file can
do its job: the file has to be read before the connection is opened. The two production
call sites of the old module-level session factory — `dependencies.py` and
`projects/service.py` — were the whole blast radius.

### A connection change is proven before it is stored

`database.*` is handled as a unit and probed before anything is written:

* the fields only mean anything together — a new host with the old port is not a
  configuration anyone wants half of;
* this is the one change that can lock the application out of its own settings store.
  Unreachable values would leave the next start unable to read the rows that describe how to
  connect.

The bootstrap cache is updated **only after a connection has actually worked**, so a bad
value is rejected while the previous one stays usable. Without that, Option A's protection
would be decorative.

### The client tab is generated, not written

`Configuration/index.jsx` never names a setting. It asks `/settings` for the registry and
renders whatever comes back: the control from `type`, the badges from `apply` and
`isSecret`, the options from `choices`. Adding a key to `config/keys.py` makes it appear in
the tab with no client change at all, which is the property the registry existed to buy.

The rules that were easy to get wrong moved out of the component into `formState.js`, where
they are unit-tested without a DOM:

* **An untouched secret is not submitted.** The API never sends a secret back, so the box
  renders empty. Submitting that emptiness would erase the stored credential *and report
  success*. A blank secret means "leave it alone"; a blank plain value is a real edit.
* **An unparseable number is passed through.** The API explains what is wrong with
  `"abc"`; inventing a client-side failure would hide that explanation.
* **The connection probe starts from the effective values.** Testing one changed field does
  not require retyping the rest, and a stored password is included without ever having been
  rendered back to the client.

### A bug found only by deploying it

Clearing a **live** override deleted the row but left the value in memory. Applying a live
value writes it onto the settings object the rest of the application reads, so deleting the
row did not undo that: the process kept serving the cleared value while the listing reported
`isOverridden: false` beside it.

The unit tests could not catch it, because each one built its own service and settings
object; the contradiction only appears when the same process applies a value and then clears
it. Clearing now restores the field from a **freshly built** ``Settings`` — the object the
service holds is the one that was mutated, so it no longer knows what the environment said.
There is a regression test.

### Deferred as future features

Recorded here so they are not lost. Neither blocks the storage or resolution layers, only
the editing surface.

| Feature | Why it is deferred | What it unblocks |
|---|---|---|
| **Full authentication** (email/password, SSO) | Out of scope for this work, by decision | Replaces the guest-account model. The roles introduced now are the piece it will build on, not a throwaway. |
| **Master key management** (external secret manager, key rotation UI) | An environment variable is enough for now | Rotating the encryption key without a redeploy. The `key_id` column already exists so ciphertext can be attributed to a key during rotation. |

Note that the settings **API and UI tab** depend on the authorization model. Minimal roles
land first (phase C2, done); the editing surface follows once the storage and resolution
layers exist.
