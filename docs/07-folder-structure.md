# BINGO+ — Folder Structure & Monorepo Decision

## Monorepo tool: Turborepo + npm workspaces

Chosen over separate repos or Nx because: (1) the four frontends and the API share a large amount
of types and UI primitives — a monorepo makes that sharing atomic instead of versioned-package
drift; (2) Turborepo's remote caching keeps CI fast as the number of apps grows; (3) it's lighter
weight than Nx for a team this size while still giving task pipelines (`build`, `lint`, `test`)
with dependency-aware caching. npm workspaces (not pnpm/yarn) is used only to minimize local
environment setup friction — swapping to pnpm later is a low-cost change if disk/install speed
becomes a problem.

## Layout

```
bingoplus/
├─ apps/
│  ├─ api/                 # NestJS backend (modular monolith)
│  │  ├─ src/
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/
│  │  │  │  ├─ users/
│  │  │  │  ├─ pets/
│  │  │  │  ├─ businesses/
│  │  │  │  ├─ catalog/          # products, categories, variants, inventory
│  │  │  │  ├─ cart/
│  │  │  │  ├─ orders/
│  │  │  │  ├─ payments/
│  │  │  │  ├─ riders/
│  │  │  │  ├─ delivery/
│  │  │  │  ├─ bookings/         # services + bookings
│  │  │  │  ├─ pet-friendly/
│  │  │  │  ├─ reviews/
│  │  │  │  ├─ favorites/
│  │  │  │  ├─ notifications/
│  │  │  │  ├─ maps/
│  │  │  │  ├─ promotions/
│  │  │  │  ├─ admin/
│  │  │  │  └─ reports/
│  │  │  ├─ common/              # guards, decorators, filters, interceptors, pipes
│  │  │  ├─ config/              # env validation / typed config
│  │  │  ├─ prisma/              # PrismaService, PrismaModule
│  │  │  ├─ app.module.ts
│  │  │  └─ main.ts
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/
│  │  │  └─ seed.ts
│  │  ├─ test/                   # e2e tests
│  │  └─ package.json
│  ├─ customer/             # Next.js (web) — mobile-first responsive; RN/Expo app added when mobile build is prioritized
│  ├─ business/             # Next.js — desktop-first
│  ├─ rider/                # Next.js (web) — mobile-first; RN/Expo app added alongside
│  └─ admin/                # Next.js — desktop-first
├─ packages/
│  ├─ ui/                   # shared React component library (design tokens applied)
│  ├─ types/                # shared TypeScript types/DTOs (mirrors API contracts)
│  ├─ config/                # shared eslint/tsconfig/tailwind config
│  └─ utils/                 # shared pure helpers (formatting, validation schemas)
├─ docs/                    # this architecture documentation
├─ docker-compose.yml
├─ .env.example
├─ turbo.json
├─ package.json
└─ tsconfig.base.json
```

## Note on React Native

The spec calls for React Native/Expo for Customer and Rider mobile apps. For the MVP build order
(Phase 1–4), we stand up **Next.js web apps first** for all four experiences — this lets the
same `packages/types` and business logic stabilize against a real backend fastest, with a
responsive/mobile-first layout that is already usable on a phone browser. The Expo apps for
Customer and Rider are added as siblings (`apps/customer-mobile`, `apps/rider-mobile`) once the
API contracts are stable, reusing `packages/types` and `packages/utils` directly and porting
`packages/ui` patterns to React Native primitives (not reusing DOM components). This order avoids
building UI twice against a moving API.
