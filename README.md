# Planny Flows

> A proxy for your real Jira instances: see tickets assigned to you, track time, and close issues from one place. More features coming — the goal is a single platform for work and personal activities.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Tech stack**

[![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Webpack](https://img.shields.io/badge/Webpack-8DD6F9?style=flat-square&logo=webpack&logoColor=black)](https://webpack.js.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Cypress](https://img.shields.io/badge/Cypress-17202C?style=flat-square&logo=cypress&logoColor=white)](https://www.cypress.io/)

**Fork of [oldboyxx/jira_clone](https://github.com/oldboyxx/jira_clone)** — extended as a Jira proxy (worklogs, time tracking, close/update issues); i18n and Docker support.

---

## Why this exists

Planny Flows sits in front of your real Jira (one or two instances): you see your assigned tickets, log time, and close or update them without living inside Jira. It also keeps a local board for quick issues. The longer-term aim is to grow it into a platform that handles both work-related and personal activities in one place.

---

## Quick start

**Prerequisites:** Node.js 18+, npm.

```bash
git clone https://github.com/cecuchetti/planny-flows.git  # If you forked, replace 'cecuchetti' with your GitHub username
cd planny-flows
npm run install-dependencies
```

Create `api/.env` from `api/.env.example` (SQLite defaults work with no extra setup). Then:

```bash
# Terminal 1 — API
cd api && npm start

# Terminal 2 — Client
cd client && npm start
```

- **Client:** http://localhost:8192  
- **API:** http://localhost:3824  

---

## Features

- **Jira proxy:** Connect to one or two real Jira (Atlassian) instances. View **tickets assigned to you**, **track time** (worklogs), and **close or update** issues from the app.
- **My Jira issues:** Single view of your assignments across internal and/or external Jira.
- **Local board (optional):** Drag-and-drop board and local issues (from the original jira_clone) when you want a simple board or no Jira.
- **i18n:** English and Spanish (client).
- **Stack:** React (Babel) + Node/TypeScript API, TypeORM, custom Webpack. Prettier; E2E with Cypress; API tests with Vitest.
- **Run anywhere:** SQLite or PostgreSQL; Docker Compose for API + client + Postgres.

---

## Installation and setup

### 1. Clone and install

```bash
git clone https://github.com/cecuchetti/planny-flows.git  # If you forked, replace 'cecuchetti' with your GitHub username
cd planny-flows
npm run install-dependencies
```

### 2. API environment

Copy the example env and adjust if needed:

```bash
cp api/.env.example api/.env
```

**Database:**

| Option       | Use case              | What to do |
|-------------|------------------------|------------|
| **SQLite**  | Local dev (default)    | Set `DB_TYPE=sqlite`. Optionally `DB_PATH=./data/jira.sqlite`. No DB install. |
| **PostgreSQL** | Shared or production | Set `DB_TYPE=postgres` and set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`. Create the DB (e.g. `jira`). |

**Jira (optional):** See `api/.env.example` for `INTERNAL_*` and `EXTERNAL_*` vars. Leave them commented to run without Jira.

**If you switch Node versions** (e.g. nvm) and the API fails with `ERR_DLOPEN_FAILED` or “compiled against a different Node.js version”:

```bash
cd api && npm rebuild better-sqlite3
# or for a fresh build from source:
BUILD_FROM_SOURCE=1 npm install better-sqlite3
# or: rm -rf node_modules && npm install
```

### 3. Run

**Development (two terminals):**

```bash
# Terminal 1
cd api && npm start

# Terminal 2
cd client && npm start
```

**Production build:**

```bash
npm run build
# Then:
cd api && npm run start:production
cd client && npm run start:production   # other terminal
```

- Dev client: http://localhost:8192 — Production client: http://localhost:8193  
- API: http://localhost:3824  

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
- Run API: `cd api && npm run start:test`
- Run client tests: `cd client && npm run test:cypress`

**API (Vitest):**

```bash
cd api && npm test
# or: npm run test:watch   npm run test:coverage
```

---

## Project layout

| Path        | Description |
|------------|-------------|
| `client/`  | React app (Babel, Webpack, react-router, styled-components). |
| `api/`     | Express + TypeScript API, TypeORM, optional Jira integrations. |
| `api/docs/`| Backend architecture and feature-module guide. |

---

## What’s missing (for a production product)

- **Migrations:** TypeORM `synchronize` is used; replace with [migrations](https://typeorm.io/migrations) before production.
- **Auth:** Guest/auto-login is fine for demos; add proper email/password (or SSO) for real use.
- **Accessibility:** Not all components have full ARIA and focus handling yet.
- **Test coverage:** E2E (Cypress) + API (Vitest) exist; more unit/integration tests would help as the app grows.

---

## Contributing

Contributions are welcome. Please open an issue or PR; see [CONTRIBUTING.md](CONTRIBUTING.md) if you have specific guidelines.

---

## License

MIT. Original [jira_clone](https://github.com/oldboyxx/jira_clone) by Ivor Reic — same license.
