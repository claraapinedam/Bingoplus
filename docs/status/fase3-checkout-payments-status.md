# FASE 3 — Marketplace Checkout + Payments + Orders + Directory Coupons — Status Report

**STATUS: Completed** (backend + tests scope; frontend explicitly out of scope per spec §72 —
contracts defined, no UI built). Full detail in
`docs/14-fase3-marketplace-checkout-payments.md`.

## What changed

- New modules: `AddressesModule`, `PricingModule` (config + price/tax/discount/stock services),
  `PaymentsModule` (`PaymentProvider` abstraction + `SandboxPaymentProvider`), `OrdersModule`
  (`OrderStateMachine`, cancellation, refund), `CheckoutModule` (orchestration + webhook).
- `CartService.addItem` now validates `SELLS_PRODUCTS` (RULE 4) — a real gap closed.
- `CouponsService.redeem` fixed for a real concurrency bug: `FOR UPDATE` row lock now prevents
  double redemption under concurrent requests (verified with a real concurrent e2e test).
- Directory coupon flow extended: public detail, QR image download, validate/redeem split, named
  error codes, redemption history, `couponSummary` (3-state visibility rule) on business detail.
- Schema: `Refund`, `WebhookEvent`, `PricingConfiguration` (new); `Order`/`OrderItem`/`Payment`/
  `PaymentMethod` extended. No entity duplicated.

## Verified

```
Unit 123/123 passed · E2E 52/52 passed (30 new: full Marketplace + Directory critical paths,
stock race condition, payment idempotency, cancellation+auto-refund, ownership, price-tamper
resistance, concurrent coupon redemption) · Lint clean · Typecheck clean · Build emits dist/main.js
```

## Known gaps (documented, not hidden)

1. Only Sandbox payment provider exists — no real Stripe/MercadoPago integration.
2. Tax is a flat global rate — no per-category/location rules yet.
3. Refund never talks to a real processor — Sandbox always succeeds.
4. No frontend UI for Checkout/Payment/Order/Coupon-QR — contracts only, per explicit scope.

See `docs/14-fase3-marketplace-checkout-payments.md` §13 for the full risk summary and §14 for
FASE 4 scope.
