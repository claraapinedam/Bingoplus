# BINGO+ — MVP Roadmap

Each phase must be functionally complete, tested, and integrated (frontend ↔ backend) before the
next one starts (per the project's development rule).

| Phase | Scope | Depends on |
|---|---|---|
| **1** | Auth (register/login/logout/refresh/forgot-password), Users/Profile, Addresses, Pets CRUD, Business onboarding + Admin approval, full DB schema + migrations + seed, base Admin API (users/businesses list & moderation) | — |
| **2** | Marketplace: product categories, products CRUD, inventory, cart | 1 |
| **3** | Checkout, Payments (sandbox), Orders (creation + business-side state machine) | 2 |
| **4** | Riders (onboarding/approval), Delivery state machine + dispatch, Maps integration, live tracking (WebSocket) | 3 |
| **5** | Business Dashboard (sales/orders/finance views) | 3, 4 |
| **6** | Admin Dashboard (KPIs, reports, full moderation surface) | 1–5 |
| **7** | Veterinarians/Grooming/Daycare/Boarding as `Service`, Bookings, Pet-Friendly directory API | 1 |
| **8** | Analytics event pipeline, Notifications (real channels), Reviews, Promotions/Coupons | 1–7 |

## Explicitly deferred beyond MVP (architecture reserved only)

Subscriptions, loyalty, premium membership, personalized recommendations, pet health records
beyond the base `Pet` entity, telemedicine, pet insurance, pharmacy, recurring orders, AI
assistant — see `09-external-integrations.md` §Future.

## Definition of done, per phase

- Prisma migration applied, seed data covering the new entities.
- NestJS module with DTO validation, guards, Swagger docs.
- Unit tests for services, e2e test for the phase's critical path.
- Frontend screens wired to real endpoints (no hardcoded data) for whichever app(s) the phase
  touches; screens for not-yet-built phases show an honest "coming soon" empty state, not fake
  content.
- Status report per `13-development-plan.md` §Reporting format.
