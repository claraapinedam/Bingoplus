# BINGO+

Pet ecosystem marketplace — monorepo. See [`docs/`](docs/) for the full architecture (product,
system, database ERD/schema, API, roles, security, roadmap, development plan).

## Stack

NestJS + Prisma + PostgreSQL/PostGIS (API) · Next.js (web apps) · Turborepo + npm workspaces.

## Prerequisites

- Node.js 20+
- Docker Desktop (for local Postgres + Redis)

## Getting started

```bash
npm install
# ^ also builds packages/types and packages/utils (postinstall) — apps/api requires their
#   compiled dist/ output, not raw TS source; re-run this (or `npm run build --workspace=packages/X`)
#   after editing either shared package.

# start Postgres (PostGIS) + Redis
docker compose up -d

# copy env vars — apps/api/.env already exists locally with generated dev-only JWT secrets;
# for a fresh clone, copy .env.example instead:
cp .env.example apps/api/.env

npm run db:migrate --workspace=apps/api   # applies prisma/migrations
npm run db:seed                            # loads fictitious dev data — see apps/api/prisma/seed.ts

npm run dev --workspace=apps/api           # API on http://localhost:3001/api/v1 (Swagger at /api/v1/docs)
npm run dev --workspace=apps/admin         # Admin dashboard on http://localhost:3004
npm run dev --workspace=apps/customer      # Customer app on http://localhost:3002

# one-time: create + migrate a separate database for e2e tests (never the dev one — see Quality gates)
docker exec bingoplus-postgres psql -U bingoplus -d bingoplus -c "CREATE DATABASE bingoplus_test;"
npm run prisma:deploy:test --workspace=apps/api
```

## Seeded dev accounts

All fictitious. Password for every seeded account: `BingoPlus2024!`

- Admin: `admin.fake@example-bingoplus.test`
- Super admin: `superadmin.fake@example-bingoplus.test`
- Customers: `maria.fake@example-bingoplus.test`, `juan.fake@example-bingoplus.test`, … (see `prisma/seed.ts`)
- Riders: `rider0.fake@example-bingoplus.test` … `rider4.fake@example-bingoplus.test`

## Repo layout

```
apps/api        NestJS backend (modular monolith)
apps/admin      Admin dashboard (Next.js)
apps/customer   Customer app (Next.js, mobile-first) — Home/Explore/Cart/Profile live; checkout in Phase 3
apps/business   Business portal — Phase 5+
apps/rider      Rider app — Phase 4+
packages/types  Shared TypeScript types/enums (mirrors the Prisma schema)
packages/utils  Shared pure helpers
packages/config Shared tsconfig
docs/           Architecture documentation
```

## Quality gates

```bash
npm run lint --workspace=apps/api      # and apps/admin, apps/customer — all clean
npm run test --workspace=apps/api      # unit tests
npm run test:e2e --workspace=apps/api  # e2e against bingoplus_test (see Getting started) — never the dev DB
```

`test:e2e` runs against `bingoplus_test`, a database separate from the one the running dev apps
read from (`apps/api/test/jest-e2e-setup.ts` points Prisma at `apps/api/.env.test`) — e2e test
rows, or leftovers from an interrupted run, can never show up in your browser. It also runs
`--runInBand` (sequential): the three e2e spec files share that one database, and running them
in parallel Jest workers caused intermittent setup-race failures.

CI (`.github/workflows/ci.yml`) runs all of the above on every push/PR, plus a build for both
web apps, using its own ephemeral Postgres service container (so it never touches
`bingoplus_test` either).

## Production build (API)

```bash
docker build -f apps/api/Dockerfile -t bingoplus-api .
```

Multi-stage, builds `packages/types`/`packages/utils` before the API (see the postinstall note
above — the same requirement applies inside the image). Run it with `DATABASE_URL` pointed at a
real Postgres, plus `JWT_SECRET`/`JWT_REFRESH_SECRET`; every other env var in `.env.example` is
optional until its owning integration is configured.

## Ports used locally

| Service | Port |
|---|---|
| API | 3001 |
| Customer | 3002 |
| Admin | 3004 |
| Postgres | 55432 (mapped to avoid clashing with other local projects on 5432) |
| Redis | 6379 |
