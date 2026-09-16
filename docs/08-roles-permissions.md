# BINGO+ — Role / Permission Model (RBAC)

> Updated in FASE 2 (see `docs/13-fase2-arquitectura-sistema.md`): `BUSINESS_STAFF` was renamed to
> `BUSINESS_MANAGER`, business access control moved from `Business.ownerId` to the `BusinessUser`
> membership table, and `OwnershipGuard` was renamed to `BusinessOwnershipGuard`.

## Roles

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Full platform access, including Settings and role management itself. |
| `ADMIN` | Operational access to Admin dashboard (users, businesses, riders, memberships, coupons) minus platform-critical settings. |
| `BUSINESS_OWNER` | Full control of the `Business` records they're the `OWNER` `BusinessUser` of (staff, catalog, capabilities, coupons, finance). |
| `BUSINESS_MANAGER` | Scoped to businesses where they're a `MANAGER` `BusinessUser` — operational actions only today; OWNER-only actions (staff management, finance) are not yet distinguished from MANAGER (documented gap, see FASE 2 doc §K). |
| `RIDER` | Own `Rider` profile, delivery offers, active delivery, earnings. |
| `CUSTOMER` | Own profile, pets, cart, orders, bookings, reviews, favorites. Default role on registration. |

A `User` can hold multiple roles simultaneously (e.g. `CUSTOMER` + `BUSINESS_OWNER`). Roles are
additive; there is no "downgrade" — approving a business onboarding *adds* `BUSINESS_OWNER`, it
never removes `CUSTOMER`. A `User` can likewise belong to more than one `Business` (as `OWNER` of
one and `MANAGER` of another) via multiple `BusinessUser` rows — this is what lets FASE 2 support
a business having several staff accounts without duplicating the `User` identity.

## Permissions

Modeled as `(resource, action)` pairs (e.g. `orders:refund`, `businesses:approve`,
`settings:write`) attached to roles via `RolePermission`, so Admin can eventually grant
fine-grained permissions without shipping code — for the MVP, permissions are seeded statically
per role (see `apps/api/prisma/seed.ts`) and the `RolesGuard` checks role membership directly;
the `Permission`/`RolePermission` tables exist so this can move to per-permission checks later
without a schema change.

## Enforcement

1. **`JwtAuthGuard`** — validates the access token, attaches `req.user = { id, roles[] }`.
2. **`RolesGuard`** — reads `@Roles('ADMIN','SUPER_ADMIN')` metadata on the route, checks
   intersection with `req.user.roles`.
3. **`BusinessOwnershipGuard`** — for business-scoped routes, resolves `:businessId`/`:id` and
   checks a `BusinessUser` row exists for `(businessId, req.user.id)` — i.e. the caller is
   actually `OWNER` or `MANAGER` of *that* business, not just holding a `BUSINESS_OWNER` role in
   the abstract (`ADMIN`/`SUPER_ADMIN` bypass this check entirely). `Business.ownerId` is kept
   only as a denormalized legal-owner pointer and is never read for access control.
4. Every route decorated `@Audit(action, entityType)` is recorded to `AuditLog` by
   `AuditLogInterceptor` — actor, action, entity, and a best-effort `previousValue`/`newValue`
   diff (fetched before the handler runs / taken from its return value).

## Admin panel data boundaries

The Admin dashboard's "Usuarios" section is scoped to accounts that can actually sign into that
panel (`ADMIN`/`SUPER_ADMIN`), not every `User` row. Two sibling sections cover everyone else who
isn't admin staff: "Clientes" (`CUSTOMER`-role accounts — marketplace buyers, including business
owners, who keep their `CUSTOMER` role after onboarding) and "Riders" (accounts with a `Rider`
record). See `UsersService` §Admin-facing for the query that keeps these three lists
non-overlapping.

## Route-level examples

- `PATCH /api/v1/admin/businesses/:id/approve` → `@Roles('ADMIN','SUPER_ADMIN')`.
- `PATCH /api/v1/business/:businessId/products/:id` → `@Roles('BUSINESS_OWNER','BUSINESS_MANAGER')`
  + `BusinessOwnershipGuard` on `:businessId`.
- `PATCH /api/v1/business/:businessId/capabilities` → same guard combination; only the
  operational capabilities (`SERVICES`, `BOOKINGS`, `COUPONS`, `PICKUP`, `DELIVERY`) can be set
  this way — `SELLS_PRODUCTS`/`DIRECTORY_LISTING` are admin-only (`BusinessesService.setCapabilityAsAdmin`).
- `PATCH /api/v1/rider/deliveries/:id/pickup` → `@Roles('RIDER')` + ownership on the delivery's
  `riderId`.
- `GET /api/v1/me/pets` → `@Roles('CUSTOMER')`, implicitly scoped to `req.user.id` (no separate
  ownership check needed — the query is always `WHERE ownerId = req.user.id`).

## Full RBAC matrix (FASE 2)

See `docs/13-fase2-arquitectura-sistema.md` §E for the complete per-module, per-role permission
matrix covering the modules added in FASE 2 (capabilities, membership, business coupons, admin
coupons, directory).
