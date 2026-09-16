# BINGO+ — Product Architecture

## 1. Vision

BINGO+ is a pet-ecosystem marketplace that connects pet owners with businesses (stores, vets,
daycares, boarding, grooming, dog walkers) and pet-friendly places, through a single app that
combines marketplace shopping, delivery/pickup fulfillment, service bookings, and geolocation —
with the UX simplicity of Uber Eats/Rappi, but its own visual identity, UX and architecture.

## 2. The four experiences (four apps, one platform)

| App | Primary user | Device priority | Core job |
|---|---|---|---|
| **Customer** | Pet owner | Mobile first | Discover, buy, book, track |
| **Business** | Store/vet/groomer/etc. owner or staff | Desktop first, responsive | Manage catalog, orders, bookings, finance |
| **Rider** | Delivery courier | Mobile first | Accept and fulfill deliveries |
| **Admin** | BINGO+ operations team | Desktop first, responsive | Govern the marketplace |

All four consume the **same backend API** and the **same database** — this is one product with
four front doors, not four separate products.

## 3. Core domains (bounded contexts)

1. **Identity** — users, roles, permissions, auth, sessions.
2. **Pets** — pet profiles, and the foundation for future health records.
3. **Directory** — businesses, business categories, documents, onboarding/approval.
4. **Catalog** — products, product categories, variants, inventory.
5. **Commerce** — cart, checkout, orders, order items.
6. **Payments** — payment methods, transactions, refunds (provider-abstracted).
7. **Fulfillment** — pickup and delivery state machines, rider assignment, live tracking.
8. **Riders** — rider onboarding, vehicles, availability, earnings.
9. **Services & Bookings** — vets, daycare, boarding, grooming, dog walking, appointments.
10. **Pet-Friendly Directory** — non-transactional places (parks, cafés, etc.).
11. **Reputation** — reviews and ratings (business, rider, service).
12. **Growth** — favorites, promotions, coupons, notifications.
13. **Marketplace Economics** — commissions, platform fees, payouts, rider earnings.
14. **Admin & Governance** — moderation, disputes, audit logs, reporting.

These domains map directly to NestJS modules in the modular monolith (see
`02-system-architecture.md`) and are the seam along which modules could later be extracted into
microservices, if/when scale demands it.

## 4. Product principles

- **One order can contain one business only** (a cart belongs to a single business at checkout
  time) — this keeps delivery assignment, payouts and commissions simple for the MVP. Multi-vendor
  carts are a documented future extension, not an MVP feature.
- **A business cannot sell until `ACTIVE`.** Onboarding approval is a hard gate enforced in the
  backend, not just hidden in the UI.
- **Pickup and delivery share one order state machine**, they diverge only after
  `READY_FOR_PICKUP` (see `05-user-journeys.md`).
- **Money is never trusted from the client.** Prices, fees, commissions and totals are always
  recomputed server-side at checkout.
- **No screen is allowed to lie about integration status.** If a feature depends on an
  unconfigured external service (Maps, Payments, Push), the UI must surface a real "not
  configured" state instead of faking success.

## 5. What BINGO+ is not (guardrails)

- Not a general food-delivery app — every business belongs to a pet-related category.
- Not a children's app — illustration of "Bingo" (the Shih Tzu mascot) is used sparingly, as
  brand moments (empty states, onboarding), never as the primary UI metaphor.
- Not a photo-realistic pet app — the mascot is always the stylized illustration from the design
  system, never a real photo, inside the product UI.
