# CRMP Backend (ASTU)

Backend service for the ASTU University Research Management System. Built with NestJS and TypeScript, using PostgreSQL with Drizzle ORM and JWT-based authentication.

## Tech Stack

- NestJS 11 + TypeScript
- PostgreSQL 16 (Docker)
- Drizzle ORM + Drizzle Kit migrations
- JWT auth with Passport

## Requirements

- Node.js 20+
- pnpm
- Docker + Docker Compose (for database and full stack)

## Environment

Create a `.env` for local dev and a `.env.docker` for Docker. Common variables:

```bash
DB_USER=
DB_PASSWORD=
DB_NAME=crmp
DATABASE_URL=postgresql://<username>:<password>@postgres:5432/crmp
JWT_SECRET=
JWT_EXPIRATION_MS=3600000
BCRYPT_ROUNDS=
PORT=3000
NODE_ENV=development
```

## Install

```bash
pnpm install
```

## Run (local)

```bash
# dev mode (watch)
pnpm run start:dev

# prod mode
pnpm run build
pnpm run start:prod
```

## Run with Docker Compose

```bash
docker compose --env-file .env.docker up --build
```

This starts:

- PostgreSQL on port 5434
- Migration container (runs once)
- Backend service on port 3000

## Scripts

```bash
pnpm run build
pnpm run start
pnpm run start:dev
pnpm run start:prod
pnpm run lint
pnpm run test
pnpm run test:e2e
```

## Project Structure

```
src/
  app/              # App entry controller
  auth/             # Auth module, JWT strategy, guards, DTOs
  db/               # Drizzle DB module and schema
  users/            # Users module and services
  main.ts           # NestJS bootstrap
drizzle/            # SQL migrations + snapshots
```

## Notes

- Database migrations are handled via Drizzle in the `migrate` container.
- Update `.env.docker` when running via Docker Compose.
