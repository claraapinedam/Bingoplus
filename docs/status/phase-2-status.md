# Phase 2 — Status Report

**STATUS: Completed** (backend scope per `docs/11-mvp-roadmap.md` Phase 2: product categories,
products CRUD, inventory, cart). Verified against the live database, not mocked.

## Files created

- `apps/api/src/modules/catalog/` — `catalog.service.ts`, `public-catalog.controller.ts`
  (`/public/product-categories`, `/public/products`), `business-products.controller.ts`
  (`/business/:businessId/products*`), DTOs, `catalog.service.spec.ts`.
- `apps/api/src/modules/cart/` — `cart.service.ts`, `cart.controller.ts` (`/me/cart*`), DTOs,
  `cart.service.spec.ts`.
- `apps/api/src/modules/admin/admin-customers.controller.ts` (new "Clientes" admin section).
- `apps/admin/src/app/customers/page.tsx` (new page); `apps/admin/src/app/users/page.tsx`
  simplified to admin-staff only.

## Functionalities implemented

- **Catalog (customer-facing)**: browse product categories; search/filter products by category,
  price range, business, free text; sort by price or newest; product detail — all restricted to
  products whose business is `ACTIVE` (a pending/suspended business is never visible, per the
  platform's core rule).
- **Catalog (business-owner-facing)**: create/edit/soft-delete products; activate/deactivate;
  update stock (creates an `InventoryMovement` audit row, refuses to go negative); low-stock flag
  (`stock < 5`) and filter; all scoped to the caller's own business via `BusinessOwnershipGuard`.
- **Cart**: single-business cart (add/update/remove items, clear); real stock validation on every
  mutation; price snapshot taken at add-time (uses `salePrice` when set); a cart holding another
  business's items requires an explicit `replaceCart: true` to switch — never silently merges two
  businesses into one cart.
- **Admin "Usuarios" vs "Clientes" split**: `/admin/users` now lists only `ADMIN`/`SUPER_ADMIN`
  accounts (who can sign into the admin panel); a new `/admin/customers` lists `CUSTOMER`-role
  accounts (buyers) with the rating/purchases columns; `/admin/riders` unchanged. See
  `docs/08-roles-permissions.md` §Admin panel data boundaries.

## APIs created

`GET /public/product-categories`, `GET/GET-one /public/products`,
`GET/POST/PATCH/DELETE /business/:businessId/products*` (+ `/activate`, `/deactivate`, `/stock`,
`/stock-movements`), `GET/POST/PATCH/DELETE /me/cart*`, `GET/PATCH /admin/customers*`.

## Tests run

- Unit: 5 suites / **20 passing** (`auth`, `businesses`, `riders`, `catalog`, `cart`).
- E2E: 2 suites / **18 passing** — Phase 1 critical path, plus a new
  `test/catalog-and-cart.e2e-spec.ts` covering Phase 2's own critical path (create product →
  visible in public catalog → filter/sort by price → deactivate drops it from public listing →
  stock update reflected in low-stock filter → add to cart → stock-limit 400 → cross-business
  409 → `replaceCart` → update quantity → clear cart) against the live dockerized PostgreSQL.
- Manual smoke tests via curl (category browse, admin users/customers non-overlap, etc.) — see
  the original entries below, now backed by the automated e2e suite above too.
- `npm run build --workspace=apps/admin` → compiles and type-checks clean (5 pages).

## Known gaps — closed out

- **Product variants**: full CRUD now exists (`POST/GET/PATCH/DELETE
  /business/:businessId/products/:id/variants`), including a unique-SKU conflict check; the
  public product detail endpoint now returns `variants[]`. Verified live: create → duplicate SKU
  rejected (409) → list → update stock → delete.
- **Customer-facing web app**: built — see the Update below.
- **Phase 2 e2e test**: added (see Tests run above) — this was a real gap identified when asked
  "is Phase 1/2 100% done", not something silently skipped.

## Update — Customer web app added

**STATUS: Completed** (browsing + cart; checkout intentionally not wired — see below).

`apps/customer` (Next.js, mobile-first, port 3002): register/login, Home (categories, popular
products, an "Ofertas" section that only renders when a real `salePrice` exists), Explore (search,
category chips, sort, pagination), product detail (add to cart, handles the cross-business
cart conflict with an explicit "vaciar y agregar" confirmation, handles out-of-stock), Cart
(quantity controls, remove, clear, subtotal), Profile (account info + full Pets CRUD, reusing the
Phase 1 pets endpoints that had no frontend yet). Bottom nav: Inicio / Explorar / Carrito (with
item-count badge) / Perfil — Orders and Favorites are deliberately not in the nav since those
backends don't exist until Phase 3/8; adding dead nav items would violate the project's "no
buttons that do nothing" rule.

The Checkout button on the Cart page is present but disabled with a explicit label
("Checkout — próximamente") rather than hidden or faked — Phase 3 replaces it with the real flow.

**Files**: `apps/customer/**` (new workspace) — `src/app/{page,login,register,explore,
products/[id],cart,profile}`, `src/components/{CustomerShell,ProductCard,EmptyState}.tsx`,
`src/lib/api.ts`.

**Verified**: `npm run build --workspace=apps/customer` compiles/type-checks clean (8 routes);
all routes return 200 against the running dev server; CORS preflight confirmed for
`http://localhost:3002` against the API; manual data-flow checks reuse the same catalog/cart
endpoints already curl-tested above.

## Next steps

Phase 3 — checkout, payments (sandbox), orders — the natural next step now that a customer can
browse and build a cart end to end.
