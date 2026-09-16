# Phase 1 & 2 — Gap Closure Report

Triggered by the question "are Phase 1 and Phase 2 100% done?" — the honest answer at the time was
no. This is the record of what was closed, verified live, not just claimed.

## 1. ESLint

Added `.eslintrc.js` (API — `@typescript-eslint`, non-type-aware to avoid tsconfig-inclusion
friction with excluded test files) and `.eslintrc.json` (`next/core-web-vitals`) for
`apps/admin`/`apps/customer`, plus the missing `eslint` devDependencies in all three. Result:
`npm run lint` is clean (0 errors, 0 warnings) in `apps/api`, `apps/admin`, `apps/customer`.

## 2. Health check

`GET /api/v1/health` (public) — pings the database with `SELECT 1`; returns `503` if it can't
reach Postgres instead of a fake `200`. Verified live via curl.

## 3. Production Dockerfile for the API

`apps/api/Dockerfile`, multi-stage. Building and running it surfaced **two real packaging bugs**
that only show up in a from-scratch production build (dev mode never hits them because
`ts-node`/`nest start --watch` resolve TypeScript source directly):

- The generated Prisma client is hoisted to the **repo-root** `node_modules` under npm
  workspaces, not `apps/api/node_modules` — the first Dockerfile draft copied from the wrong
  stage/path and crashed with `Cannot find module '.prisma/client'`-style errors. Fixed by
  copying `node_modules` from the stage that ran `prisma generate`.
- `@bingoplus/types`/`@bingoplus/utils` shipped raw `.ts` source with `"main": "src/index.ts"`.
  That works in dev (ts-node/tsc-watch compile on the fly) but a plain `node` runtime — what a
  production image actually runs — cannot execute `.ts` syntax, so the container crashed with
  `SyntaxError: Unexpected token ':'`. Fixed by giving both packages a real `build` script
  (`tsc -p tsconfig.json`) and pointing `main`/`types` at `dist/`, and adding a root
  **`postinstall`** script (`npm run build --workspace=packages/utils && ...types`) so this is
  never a manual step in any environment (fresh clone, CI, Docker's `npm ci`).

Verified by actually building the image, running it attached to the docker-compose Postgres
network, and hitting `/health` through the container — confirmed `200 {"status":"ok"}`.

## 4. CI

`.github/workflows/ci.yml` — a `postgis/postgis` service container, `npm ci`, lint, `prisma
generate`, `prisma migrate deploy`, unit tests, e2e tests for the API; lint + build (matrix) for
`apps/admin` and `apps/customer`. Not yet run on GitHub itself (no remote configured in this
session), but every command in it was run locally and passes.

## 5. Phase 2 e2e test

`test/catalog-and-cart.e2e-spec.ts` — the gap identified when auditing "is this 100% done":
Phase 1 had an e2e test for its critical path, Phase 2 only had unit tests + manual curl checks.
Added the missing automated e2e coverage (8 tests, listed in `docs/status/phase-2-status.md`).

Fixing this exposed a **real test-isolation bug**: both e2e spec files' `afterAll` cleanup used a
broad `email contains 'e2e.'` filter, which raced when Jest ran the two files in parallel workers
— one file's cleanup deleted a user the other file's business still referenced, failing on the FK
constraint. Fixed by scoping each file's cleanup to its own unique run suffix.

## 6. Product variant CRUD

The other Phase 2 gap: `ProductVariant` existed in the schema with no API. Added full CRUD
(`business-products.controller.ts` `/variants*` routes) with a unique-SKU conflict check, and
`variants[]` now included in the public product detail response.

## Net result

`npm run lint` × 3 apps, `npm run test` (20), `npm run test:e2e` (18), `npm run build` × 2 web
apps, and a full Docker image build-and-run — all green, all verified in this session, not
assumed.
