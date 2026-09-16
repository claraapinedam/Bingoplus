# Marketplace — Store-First Ranking — Status Report

**STATUS: Completed.** The marketplace's unit of navigation is now the business, not a global
product catalog: `Tiendas → Business → Catálogo → Producto → Carrito`, ranked server-side by a
dedicated `BusinessRankingService`.

## Schema changes

- **`PetSpecies`** — admin-manageable lookup table (not a hardcoded enum), seeded with
  dog/cat/bird/fish/rabbit/rodent/reptile/other.
- **`Pet.species`** (free text) replaced by **`Pet.speciesId`** (required FK to `PetSpecies`).
  This is a breaking change to the Phase 1 Pets API (`species` → `speciesSlug` in
  create/update); existing dev `Pet` rows were cleared as part of the migration (fictitious
  data, no defensible mapping to the new lookup — see the migration's own comment).
- **`ProductSpecies`** — join table (`productId`, `speciesId`) so a product can target several
  species; exposed via `speciesSlugs` on product create/update and `species[]` on every product
  read.
- **`PlatformSetting["business_ranking_weights"]`** — `{speciesMatch, distance, availability,
  rating, delivery}`, defaults to `45/25/10/10/10`, editable only from Admin, never hardcoded
  into the score formula itself.

## Backend

- **`BusinessRankingService`** (`src/modules/ranking`) — pure, independently-tested functions
  exactly as specified: `calculateSpeciesMatch`, `calculateDistanceScore`,
  `calculateAvailabilityScore`, `calculateRatingScore`, `calculateDeliveryScore`, composed by
  `calculateBusinessRelevance` into one `relevanceScore`, with `rankBusinesses` sorting by that
  score and falling back to alphabetical (es locale) on ties — reproduces the spec's worked
  example (Pet World > Animal House/Aves & Más (tied, alphabetical) > Bingo Pet Shop > Zoo
  Market) exactly, verified by a dedicated unit test.
- Distance uses real client-supplied coordinates (haversine) — never a fabricated location; both
  missing coordinates and missing opening-hours degrade to a neutral 0.5 score rather than being
  guessed.
- **New endpoints**: `GET /public/businesses` (anonymous, optional `species`/`category`/
  `search`/`lat`/`lng`), `GET /public/businesses/:id` (detail, ACTIVE-only), `GET /me/businesses`
  (authenticated — auto-derives species relevance from the caller's own pets),
  `GET /public/pet-species`, `GET`/`PATCH /admin/settings/ranking-weights` (rejects a set that
  doesn't sum to 1).
- Product endpoints extended with `speciesSlugs` (write) / `species[]` (read); public product
  listing/detail gained a `species` filter.
- Pets endpoints migrated to `speciesSlug`.

## Frontend (apps/customer)

- **Bottom nav**: "Explorar" replaced by **"Tiendas"** as the primary discovery tab — matches the
  mandated `USER → TIENDAS → BUSINESS → CATÁLOGO` flow. Direct product search still exists at
  `/explore`, reachable via a secondary link, since the spec keeps product search as a
  capability, just not the primary view.
- **`/stores`**: ranked business cards (rating, distance when location is shared, open/closed,
  delivery/pickup, "Para tu perro"/"Para tus mascotas" badges — never a raw numeric score),
  species filter chips, real `navigator.geolocation` (graceful no-op on denial, never a fake
  location).
- **`/stores/[id]`**: business detail + that business's own catalog only (no global product
  list).
- **Home**: category chips now list *business* categories (Tiendas/Veterinarios/…) instead of
  product categories; added a "Recomendado para tus mascotas" ranked-store teaser; the search bar
  now searches stores first, per the spec's explicit UX rule.
- **Product detail**: shows "Especie recomendada" badges.
- **Profile**: pet form's free-text species input replaced with a dropdown sourced from
  `/public/pet-species`.

## Tests

- Unit: `business-ranking.service.spec.ts`, 9 tests, including the exact worked example from the
  spec.
- E2E: new `test/marketplace-ranking.e2e-spec.ts` (4 tests) — ranking order for a real
  dog+bird-owning customer, matched-species transparency data, anonymous species-filtered
  browsing, and admin weight read/update/validation. Total API suite: **29 unit + 22 e2e, all
  green**.
- Found and fixed along the way: (1) the dev seed script wasn't idempotent — re-running it
  duplicated every business/product/pet; now resets that data first. (2) Running the e2e suites
  in parallel Jest workers against one shared dev Postgres caused intermittent setup-race
  failures — `test:e2e` now runs `--runInBand` (sequential), which is the standard fix for e2e
  against a shared database and eliminated the flakiness across 5 consecutive runs.

## Known gaps

- Ranking currently fetches all `ACTIVE` businesses and ranks in-memory rather than pushing
  ranking into the SQL query — fine at MVP seed scale (~10 businesses), documented as a scale
  limitation to revisit if the catalog grows large (same category of trade-off as the rest of the
  MVP; see `docs/02-system-architecture.md` §9).
- `PetSpecies` has no Admin CRUD UI yet (seed-managed only) — consistent with the existing
  precedent for `BusinessCategory`/`ProductCategory`, which also have no Admin CRUD yet.
