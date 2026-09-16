# BINGO+ — API Architecture

## Style

REST over HTTPS, JSON, versioned at the path root: `/api/v1/...`. Documented with OpenAPI/Swagger
at `/api/docs` (generated from Nest decorators, always in sync with the code).

## Surface segmentation

The same NestJS app exposes controllers grouped by audience. Segmentation is by **route prefix +
guard**, not by separate deployments (keeps the modular monolith simple):

| Prefix | Guard | Consumed by |
|---|---|---|
| `/api/v1/public/*` | none (rate-limited) | Any app, unauthenticated (browse businesses, products, pet-friendly places) |
| `/api/v1/auth/*` | none / refresh-token | All apps (register, login, refresh, forgot-password) |
| `/api/v1/me/*` | JWT, role `CUSTOMER` implied | Customer app (profile, addresses, pets, cart, orders, favorites, bookings) |
| `/api/v1/business/*` | JWT, role `BUSINESS_OWNER`/`BUSINESS_STAFF`, scoped to owned business | Business portal |
| `/api/v1/rider/*` | JWT, role `RIDER` | Rider app |
| `/api/v1/admin/*` | JWT, role `ADMIN`/`SUPER_ADMIN` | Admin dashboard |

## Request pipeline

```
Request → Helmet + CORS → Rate limiter (per-IP + per-user) → ValidationPipe (class-validator DTOs,
whitelist: true, forbidNonWhitelisted: true) → JwtAuthGuard → RolesGuard → OwnershipGuard
(business/rider scoping) → Controller → Service → Prisma → Response
→ global ClassSerializerInterceptor (strips fields like passwordHash)
→ global HttpExceptionFilter (uniform error envelope)
```

### Uniform response envelope

Success:
```json
{ "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 134 } }
```
Error:
```json
{ "error": { "code": "BUSINESS_NOT_ACTIVE", "message": "...", "details": [] } }
```

### Pagination / filtering / sorting

Query params standardized across list endpoints: `page`, `pageSize` (max 100), `sort`
(`field:asc|desc`), plus resource-specific filters (e.g. `?category=veterinarios&openNow=true
&lat=..&lng=..&radiusKm=5`).

## Error handling

Domain errors are thrown as typed exceptions (e.g. `BusinessNotActiveException extends
BadRequestException`) with a stable `code` so clients can branch without parsing message text.
Unhandled exceptions are logged with a correlation id and returned as a generic `500` without
leaking internals.

## Authentication & authorization (see `08-roles-permissions.md` for full model)

- Access token: short-lived JWT (15 min), `sub`, `roles`, `iat`, `exp`.
- Refresh token: opaque, stored hashed in `RefreshToken`, rotated on every use, revocable.
- `RolesGuard` reads `@Roles(...)` metadata; `OwnershipGuard` additionally checks that a
  `BUSINESS_OWNER`/`BUSINESS_STAFF` is acting on their own `Business`, and a `RIDER` on their own
  `Delivery`.

## Realtime endpoints (WebSocket, same JWT)

- `/ws/orders` — order status changes, scoped to `orderId` rooms the client is authorized to join.
- `/ws/delivery` — rider location + delivery offers, scoped to `riderId`/`orderId` rooms.

## Idempotency

Payment-initiating and order-creation endpoints accept an `Idempotency-Key` header; a repeated
request with the same key and body returns the original result instead of double-processing.

## API modules and their phase

| Module prefix | Phase |
|---|---|
| `auth`, `me/profile`, `me/addresses`, `me/pets`, `business` (onboarding + admin approval),
`admin/users`, `admin/businesses` | 1 |
| `public/businesses`, `public/products`, `business/products`, `business/inventory`, `me/cart` | 2 |
| `me/checkout`, `me/orders`, `payments` | 3 |
| `rider/*`, `delivery/*`, `maps/*` | 4 |
| `business/dashboard`, `business/finance` | 5 |
| `admin/dashboard`, `admin/reports` | 6 |
| `public/services`, `me/bookings`, `business/bookings`, `public/pet-friendly` | 7 |
| `me/favorites`, `me/notifications`, `admin/promotions`, `admin/reviews` | 8 |
