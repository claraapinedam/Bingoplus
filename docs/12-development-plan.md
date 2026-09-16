# BINGO+ — Development Plan

## Working method

1. Implement a phase's backend module(s) fully (schema already exists from Phase 1's complete
   migration) — service, controller, DTOs, guards, Swagger.
2. Write tests (unit for services, e2e for the critical path) and run them.
3. Wire the relevant frontend app(s) to the real endpoints.
4. Verify frontend ↔ backend integration manually (dev server).
5. Report status using the format below before starting the next phase.

## Status reporting format (used at the end of every phase)

```
STATUS: Completed | In Progress | Blocked | Requires Configuration | Mock | Production Ready

Files created / changed:
Functionalities implemented:
APIs created:
Database changes:
Pending integrations:
Required environment variables:
Tests run (and result):
Known issues:
Next steps:
```

## Phase 1 plan (this delivery)

**Backend**
- Monorepo scaffold (Turborepo + npm workspaces), `packages/types`, `packages/config`,
  `packages/utils` skeletons.
- `apps/api`: NestJS project — `common` (guards, filters, interceptors, decorators), `config`
  (env validation), `prisma` (PrismaService), and modules: `auth`, `users`, `pets`, `businesses`,
  `admin`.
- Full Prisma schema (all Phase 1–8 entities, per `04-database-schema.md`) + initial migration.
- Seed script: business/product/pet-friendly categories, 10 users, 5 riders (rider profiles
  only — Rider module ships Phase 4), 10 pets, 10 businesses (mixed status), 10 services,
  10 pet-friendly places, default `PlatformSetting` rows. Clearly fictitious names/emails.
- Docker Compose: Postgres+PostGIS, Redis.
- `.env.example` with every variable from spec §55.
- Auth: register, login, logout (refresh revocation), refresh, forgot/reset password. Google
  OAuth strategy wired but **inert** until `GOOGLE_CLIENT_ID/SECRET` are set (documented, not
  faked).
- Users: get/update own profile, addresses CRUD.
- Pets: CRUD scoped to owner.
- Businesses: customer-facing "apply for affiliation" endpoint; admin list/approve/reject/
  suspend; owner can view/edit their own business while pending or active.
- Admin: users list/search/activate/suspend; businesses moderation (same as above, under
  `/admin` prefix with `AuditLog` writes).
- RBAC guards (`RolesGuard`, `OwnershipGuard`) applied everywhere above.
- Swagger at `/api/docs`.

**Frontend (Phase 1 scope)**
- `apps/admin` (Next.js): login, businesses moderation queue (approve/reject), users list. This
  is the only frontend app built in Phase 1 — Customer/Business/Rider apps start in Phase 2–4
  when there's a marketplace/orders surface worth showing; building empty shells before there's
  real functionality would violate the "no interfaces disconnected from the backend" rule.

**Tests**
- Unit: auth service (hashing, token issuance/rotation), businesses service (status transitions).
- E2E: register → login → refresh → get profile; create pet → list → update → delete; business
  onboarding → admin approve → business becomes ACTIVE (and cannot before).

**Explicitly not in Phase 1**: catalog, cart, checkout, payments, riders/delivery, maps, bookings,
notifications, reviews, promotions, admin dashboard KPIs — all scaffolded only at the DB-schema
level, per the roadmap.
