# FASE 2 — Arquitectura del Sistema — Status Report

**STATUS: Completed** (architectural scope only — Checkout/Payments/Orders/Riders/Delivery
Tracking are explicitly out of scope, per the spec, and were not started). Full detail in
`docs/13-fase2-arquitectura-sistema.md` (deliverables A–N, RULE 1–20, RBAC matrix, readiness
checklist). Not to be confused with the earlier, unrelated "Phase 2" in
`docs/status/phase-2-status.md` (product catalog/cart MVP milestone from the original roadmap).

## What changed

- `BusinessCapability` (7 types) replacing the flat `deliveryEnabled`/`pickupEnabled` columns and
  decoupled from `BusinessCategory`.
- `BusinessUser` (OWNER/MANAGER) as the real access-control source; `Business.ownerId` kept only
  as a denormalized legal-owner pointer.
- Marketplace (`SELLS_PRODUCTS`) and Directory (`DIRECTORY_LISTING`) as two separate discovery
  surfaces sharing one `Business` record, with verified Hybrid support.
- `MarketplaceRankingConfig` (append-only, admin-editable, never hardcoded) replacing the ranking
  weights that used to live in `PlatformSetting`.
- `BusinessMembership → Subscription → Invoice` as a financial domain separate from Marketplace
  orders.
- `BusinessCoupon`/`CouponRedemption` (presential, token-based) and `AdminCoupon`/
  `AdminCouponRedemption` (membership-billing-only) replacing the unused `Promotion`/`Coupon`
  models.
- `RoleName.BUSINESS_STAFF` renamed to `BUSINESS_MANAGER` across schema, guards, seed and docs.
- `AuditLog.previousValue`/`newValue` actually populated (were columns without a writer).

## Verified

```
Unit  69/69 passed · E2E 22/22 passed · Lint clean · Typecheck clean · Build emits dist/main.js
```

Live-verified via curl + a direct `AuditLog` query: Marketplace lists only `SELLS_PRODUCTS`
businesses, Directory lists only `DIRECTORY_LISTING` businesses in good membership standing,
Hybrid businesses appear in both, capability/membership/coupon endpoints return real seeded data,
and `business.approve`/`business.activate`/`product.*` audit rows now carry full before/after
snapshots.

## Known gaps (documented, not blocking FASE 3)

1. `BusinessOwnershipGuard` doesn't yet distinguish OWNER-only actions from MANAGER-allowed ones.
2. No real billing/invoicing engine — `Invoice`/`Subscription` model state only.
3. Geolocation distance is Haversine-in-app, not PostGIS `ST_Distance` with a GiST index (carried
   over from Phase 1, not introduced here).

See `docs/13-fase2-arquitectura-sistema.md` §N for the full architectural-decisions/risks summary.
