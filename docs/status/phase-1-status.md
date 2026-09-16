# Phase 1 — Status Report

**STATUS: Completed** (for the scope defined in `docs/11-mvp-roadmap.md` Phase 1). Verified end
to end against a real PostgreSQL/PostGIS database — not mocked, not hardcoded.

## Files created

- Full architecture docs: `docs/01`–`docs/12` (product, system, ERD, schema, journeys, API,
  folder structure, roles, integrations, security, roadmap, dev plan).
- Monorepo scaffold: root `package.json`/`turbo.json`/`tsconfig.base.json`, `packages/types`,
  `packages/utils`, `packages/config`.
- `apps/api`: full NestJS project — `auth`, `users`, `pets`, `businesses`, `admin` modules;
  `common/` (guards, decorators, filters, interceptors); `config/env.validation.ts`;
  `prisma/schema.prisma` (all ~40 entities from the architecture, not just Phase 1's); one
  applied migration (`prisma/migrations/20260914191821_init`); `prisma/seed.ts`.
- `apps/admin`: Next.js app — login, business moderation queue, user management, styled with the
  BINGO+ design tokens (teal/navy/coral, Plus Jakarta Sans, rounded cards).
- Tests: `auth.service.spec.ts`, `businesses.service.spec.ts` (unit), `test/auth-and-onboarding.e2e-spec.ts` (e2e, full critical path).

## Functionalities implemented

- Register, login, logout, refresh (rotating, hashed at rest), forgot/reset password.
- Google OAuth wired (strategy + guard) but inert until `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  are set — hitting it today returns a real `503 INTEGRATION_NOT_CONFIGURED`, never a fake login.
- Profile get/update, address CRUD.
- Pet CRUD, strictly scoped to the authenticated owner.
- Business onboarding (`apply`), owner view/edit of own business(es), document attachment.
- Admin: list/search users, activate/suspend; list/filter businesses, approve (creates a
  `Commission` row, default rate read from `PlatformSetting`), activate, reject, suspend.
- RBAC enforced server-side (`JwtAuthGuard`, `RolesGuard`, `BusinessOwnershipGuard`) — verified
  a non-admin gets `403` on admin routes, and a business only becomes orderable after explicit
  `ACTIVE` activation (re-approving an already-active business correctly `400`s).
- `AuditLog` rows are written automatically on every `@Audit()`-decorated admin mutation —
  confirmed populated after live `approve`/`activate` calls.
- Global response envelope (`{ data, meta? }` / `{ error }`), Swagger at `/api/v1/docs`, Helmet,
  CORS allow-list, rate limiting, boot-time env validation.

## APIs created

`POST /auth/{register,login,refresh,logout,forgot-password,reset-password}`, `GET/PATCH /auth/google*`,
`GET/PATCH /me`, `GET/POST/PATCH/DELETE /me/addresses*`, `GET/POST/PATCH/DELETE /me/pets*`,
`POST/GET/PATCH /me/business*`, `GET /public/business-categories`,
`GET/PATCH /admin/users*`, `GET/PATCH /admin/businesses*`.

## Database

Full schema (Identity, Pets, Directory, Catalog, Commerce, Payments, Riders/Delivery,
Services/Bookings, Pet-Friendly, Reputation/Growth, Marketplace Economics, Governance) migrated
in one initial migration, including PostGIS extension + `geography(Point,4326)` columns on
`Business`, `Rider`, `PetFriendlyPlace` (unused by queries until Phase 4's `MapService`, but
present so no later migration has to retrofit geo indexing). Seed data: roles/permissions,
business/product/pet-friendly categories, platform settings, 8 customers, 1 admin, 1 super admin,
5 riders, 10 pets, 10 businesses (mixed statuses), ~48 demo products, 10 services, 10 pet-friendly
places — all fictitious.

## Integrations pending configuration (by design — see `docs/09-external-integrations.md`)

Google/Apple social login, Google Maps Platform, payment provider, email/SMS/push, S3-compatible
storage. Every one of these fails loudly with `IntegrationNotConfiguredException` rather than
faking success; none is used by any Phase 1 endpoint's happy path.

## Environment variables required to run Phase 1

`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (hard-required, validated at boot). Everything
else in `.env.example` is optional until its owning phase.

## Tests run

- `npm run test --workspace=apps/api` → 2 suites, 9 tests, **all passing**.
- `npm run test:e2e --workspace=apps/api` → 1 suite, 10 tests, **all passing** (register →
  duplicate-rejected → login → refresh-rotation → unauthenticated-401 → profile → pet CRUD →
  business apply → non-admin-403 → admin approve+activate), run against the live dockerized
  PostgreSQL, not a mock.
- Manual smoke test via curl against the running dev server: login, profile, pets, admin
  businesses list+filter, public categories, RBAC 403, approve→activate→re-approve-400,
  AuditLog rows confirmed in the database.
- `npm run build --workspace=apps/admin` → compiles and type-checks clean.

## Known issues / gaps — closed out

All gaps flagged in this report's first version are now closed (see `docs/status/gap-closure.md`
for the details): ESLint is configured and clean across all three apps, a `/health` endpoint and
a validated production `Dockerfile` exist for the API, and CI (`.github/workflows/ci.yml`) runs
lint + unit + e2e on every push. Remaining, and correctly *not* closeable without real
credentials: business document upload still assumes the client already has a `fileUrl` — the
pre-signed S3 upload endpoint needs real `STORAGE_*` values, which weren't provided (per project
rule: never invent credentials). `npm audit` still reports vulnerabilities in transitive dev
tooling (not runtime-critical); deferred.

## Next steps

Phase 3: checkout, payments (sandbox), orders — per `docs/11-mvp-roadmap.md`.
