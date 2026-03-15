<h1 align="center">A simplified Jira clone built with React and Node</h1>

<div align="center">Auto formatted with Prettier, tested with Cypress 🎗</div>

<h3 align="center">
  <a href="https://jira.ivorreic.com/">Visit the live app</a> |
  <a href="https://github.com/oldboyxx/jira_clone/tree/master/client">View client</a> |
  <a href="https://github.com/oldboyxx/jira_clone/tree/master/api">View API</a>
</h3>

![Tech logos](https://i.ibb.co/DVFj8PL/tech-icons.jpg)

![App screenshot](https://i.ibb.co/W3qVvCn/jira-optimized.jpg)

## What is this and who is it for 🤷‍♀️

I do React consulting and this is a showcase product I've built in my spare time. It's a very good example of modern, real-world React codebase.

There are many showcase/example React projects out there but most of them are way too simple. I like to think that this codebase contains enough complexity to offer valuable insights to React developers of all skill levels while still being _relatively_ easy to understand.

## Features

- Proven, scalable, and easy to understand project structure
- Written in modern React, only functional components with hooks
- A variety of custom light-weight UI components such as datepicker, modal, various form elements etc
- Simple local React state management, without redux, mobx, or similar
- Custom webpack setup, without create-react-app or similar
- Client written in Babel powered JavaScript
- API written in TypeScript and using TypeORM

## Setting up development environment 🛠

- **Node.js 18+**. No database setup required if you use SQLite (recommended for local development).
- `git clone https://github.com/oldboyxx/jira_clone.git`
- Create a `.env` file in `api/` from `api/.env.example`.

**Database options:**

- **SQLite (easiest for local dev):** Set `DB_TYPE=sqlite` in `api/.env`. Optionally set `DB_PATH=./data/jira.sqlite` (default). No PostgreSQL installation needed.
- **PostgreSQL:** Set `DB_TYPE=postgres` in `api/.env` and configure `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`. Create a database named `jira` (or your `DB_DATABASE` value).

**If you use SQLite and switch Node.js versions** (e.g. with nvm), the native module `better-sqlite3` may have been built for a different Node version. If the API fails with `ERR_DLOPEN_FAILED` or "compiled against a different Node.js version", recompile it:

```bash
cd api && npm rebuild better-sqlite3
```

Or reinstall API dependencies:

```bash
cd api && rm -rf node_modules && npm install
```

Then run the API again with `cd api && npm start`.

### Install dependencies

```bash
npm run install-dependencies
```

### Build (compile)

From the repo root, build both API and client:

```bash
npm run build
```

Or build separately:

```bash
cd api && npm run build
cd client && npm run build
```

### Run locally

**Development** (API and client with hot reload; use two terminals):

```bash
# Terminal 1 – API
cd api && npm start

# Terminal 2 – Client
cd client && npm start
```

- Client: **http://localhost:8080**
- API: **http://localhost:3000**

**Production** (compiled build; run API first, then in another terminal run the client):

```bash
# Terminal 1 – API
cd api && npm run start:production

# Terminal 2 – Client (serves the built static files)
cd client && npm run start:production
```

- Client: **http://localhost:8081**
- API: **http://localhost:3000**

## Running with Docker 🐳

- From the repo root: `docker compose up --build`
- Open **http://localhost:8081** (client) and **http://localhost:3000** (API). The client build uses `API_URL=http://localhost:3000` so the browser talks to the API on your host. To override, set the `API_URL` build-arg when building the client image.

## Running cypress end-to-end tests 🚥

- Set up development environment
- Create a database named `jira_test` and start the api with `cd api && npm run start:test`
- `cd client && npm run test:cypress`

## What's missing?

There are features missing from this showcase product which should exist in a real product:

### Migrations 🗄

We're currently using TypeORM's `synchronize` feature which auto creates the database schema on every application launch. It's fine to do this in a showcase product or during early development while the product is not used by anyone, but before going live with a real product, we should [introduce migrations](https://github.com/typeorm/typeorm/blob/master/docs/migrations.md).

### Proper authentication system 🔐

We currently auto create an auth token and seed a project with issues and users for anyone who visits the API without valid credentials. In a real product we'd want to implement a proper [email and password authentication system](https://www.google.com/search?q=email+and+password+authentication+node+js&oq=email+and+password+authentication+node+js).

### Accessibility ♿

Not all components have properly defined [aria attributes](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA), visual focus indicators etc. Most early stage companies tend to ignore this aspect of their product but in many cases they shouldn't, especially once their userbase starts growing.

### Unit/Integration tests 🧪

Both Client and API are currently tested through [end-to-end Cypress tests](https://github.com/oldboyxx/jira_clone/tree/master/client/cypress/integration). That's good enough for a relatively simple application such as this, even if it was a real product. However, as the app grows in complexity, it might be wise to start writing additional unit/integration tests.

## Contributing

I will not be accepting PR's on this repository. Feel free to fork and maintain your own version.

## License

[MIT](https://opensource.org/licenses/MIT)

<hr>

<h3>
  <a href="https://jira.ivorreic.com/">Visit the live app</a> |
  <a href="https://github.com/oldboyxx/jira_clone/tree/master/client">View client</a> |
  <a href="https://github.com/oldboyxx/jira_clone/tree/master/api">View API</a>
</h3>
