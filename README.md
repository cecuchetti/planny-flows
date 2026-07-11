# Planny Flows

> A proxy for your real Jira instances: see tickets assigned to you, track time, and close issues from one place. More features coming — the goal is a single platform for work and personal activities.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Tech stack**

[![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white)](https://www.sqlalchemy.org/)
[![Webpack](https://img.shields.io/badge/Webpack-8DD6F9?style=flat-square&logo=webpack&logoColor=black)](https://webpack.js.org/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Cypress](https://img.shields.io/badge/Cypress-17202C?style=flat-square&logo=cypress&logoColor=white)](https://www.cypress.io/)

**Fork of [oldboyxx/jira_clone](https://github.com/oldboyxx/jira_clone)** — extended as a Jira proxy (worklogs, time tracking, close/update issues); i18n and Docker support.

---

## Why this exists

Planny Flows sits in front of your real Jira (one or two instances): you see your assigned tickets, log time, and close or update them without living inside Jira. It also keeps a local board for quick issues. The longer-term aim is to grow it into a platform that handles both work-related and personal activities in one place.

---

## Quick start

**Prerequisites:** Python >= 3.12, [uv](https://docs.astral.sh/uv/), Node.js >= 25, npm.

```bash
git clone https://github.com/cecuchetti/planny-flows.git  # If you forked, replace 'cecuchetti' with your GitHub username
cd planny-flows
npm run install-dependencies
```

Copy `.env.example` to `.env` (SQLite defaults work with no extra setup). Then:

```bash
# Terminal 1 — Python API
npm run start:python

# Terminal 2 — Client
npm run start:client
```

- **Client:** http://localhost:8192  
- **API:** http://localhost:3824  

---

## Features

- **Jira proxy:** Connect to one or two real Jira (Atlassian) instances. View **tickets assigned to you**, **track time** (worklogs), and **close or update** issues from the app.
- **My Jira issues:** Single view of your assignments across internal and/or external Jira.
- **Local board (optional):** Drag-and-drop board and local issues (from the original jira_clone) when you want a simple board or no Jira.
- **i18n:** English and Spanish (client).
- **Stack:** React (Babel) + Python/FastAPI backend, SQLAlchemy 2.0, Alembic, custom Webpack. Prettier; E2E with Cypress; API tests with pytest.
- **Run anywhere:** SQLite or PostgreSQL; Docker Compose for API + client + Postgres.

---

## Installation and setup

### 1. Clone and install

```bash
git clone https://github.com/cecuchetti/planny-flows.git  # If you forked, replace 'cecuchetti' with your GitHub username
cd planny-flows
npm run install-dependencies
```

### 2. Environment

Copy the example env and adjust if needed:

```bash
cp .env.example .env
```

**Database:**

| Option       | Use case              | What to do |
|-------------|------------------------|------------|
| **SQLite**  | Local dev (default)    | Set `DB_TYPE=sqlite`. Optionally `DB_PATH=data/jira.sqlite`. No DB install needed. |
| **PostgreSQL** | Shared or production | Set `DB_TYPE=postgres` and set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`. Create the DB (e.g. `jira`). |

**Alembic migrations** (first time or after model changes):

```bash
uv run alembic upgrade head
```

**Jira (optional):** See `.env.example` for `INTERNAL_*` and `EXTERNAL_*` vars. Leave them commented to run without Jira.

### 3. Run

**Development (two terminals):**

```bash
# Terminal 1 — Python API (auto-reload via uvicorn)
npm run start:python

# Terminal 2 — Client
npm run start:client
```

**Production build:**

```bash
npm run build:client
# Then serve the client build and API via Docker or your own setup (see Docker section).
```

- Dev client: http://localhost:8192 — Production client: http://localhost:8193  
- Dev API: http://localhost:3824  

---

## Docker

From the repo root:

```bash
docker compose up --build
```

- Client: http://localhost:8193  
- API: http://localhost:3824  
- Compose uses PostgreSQL; override with env or compose file if you prefer.

---

## Tests

**E2E (Cypress):**

- Create a test DB (e.g. `jira_test` for Postgres) and set `DB_DATABASE=jira_test` when starting the API.
- Run API: `npm run start:python`
- Run client tests: `cd client && npm run test:cypress`

**API (pytest):**

```bash
uv run pytest packages/ -v
# or: uv run pytest packages/planny-api/tests/test_issues.py -v  # single file
```

**Client (Jest):**

```bash
cd client && npm run test:jest
```

---

## Project layout

| Path | Description |
|------|-------------|
| `client/` | React app (Babel, Webpack, react-router, styled-components). |
| `packages/planny-api/` | FastAPI application: routers, middleware, services, schemas. |
| `packages/planny-core/` | Shared config, SQLAlchemy models, database session, errors, enums. |
| `packages/planny-jira/` | Jira HTTP client and worklog orchestration. |
| `alembic/` | Database schema migrations (Alembic). |
| `data/` | SQLite database file (gitignored). |

---

## What's missing (for a production product)

- **Auth:** Guest/auto-login is fine for demos; add proper email/password (or SSO) for real use.
- **Accessibility:** Not all components have full ARIA and focus handling yet.
- **Test coverage:** E2E (Cypress) + API (pytest) + Client (Jest) exist; more unit/integration tests would help as the app grows.

---

## Contributing

Contributions are welcome. Please open an issue or PR; see [CONTRIBUTING.md](CONTRIBUTING.md) if you have specific guidelines.

---

## License

MIT. Original [jira_clone](https://github.com/oldboyxx/jira_clone) by Ivor Reic — same license.
