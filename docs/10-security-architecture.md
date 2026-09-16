# BINGO+ — Security Architecture

## Authentication

- Passwords hashed with **argon2id** (via `argon2` package), never a reversible scheme.
- Access JWT: 15 min TTL, signed with `JWT_SECRET` (HS256 for MVP; RS256 documented as the
  upgrade path once multiple services need to verify tokens independently).
- Refresh token: opaque random value, stored **hashed** (`sha256`) in `RefreshToken`, 30-day TTL,
  **rotated on every use** (old one revoked, new one issued) — detects token theft (reuse of a
  revoked token revokes the whole family and forces re-login).
- Signed with a separate secret (`JWT_REFRESH_SECRET`) from the access token.

## Authorization

RBAC as detailed in `08-roles-permissions.md`, enforced server-side on every route — the frontend
hiding a button is UX, not a security boundary.

## Transport & headers

- HTTPS enforced at the edge/load balancer in staging/production.
- `helmet()` for standard secure headers (HSTS, X-Content-Type-Options, etc.).
- CORS allow-list via `CORS_ORIGIN` env var (comma-separated), not `*`, in staging/production.

## Rate limiting

`@nestjs/throttler` global default (e.g. 100 req/min/IP) plus tighter route-specific limits on
`auth/login`, `auth/forgot-password`, `auth/otp` to blunt credential-stuffing/brute force.

## Input validation

Every controller input is a `class-validator` DTO with `whitelist: true,
forbidNonWhitelisted: true, transform: true` globally — unknown/extra fields are rejected, not
silently dropped-and-trusted.

## Secrets management

- All secrets via environment variables (`.env`, never committed — see `.gitignore`).
- `.env.example` documents every variable name with **no real values**.
- Local config is validated at boot (`class-validator`-based `EnvironmentVariables` class) — the
  app fails fast with a clear message if a required var is missing, rather than starting in a
  half-configured state.
- Production secrets belong in the platform's secret manager (Railway/Render/AWS Secrets Manager),
  never in source control or CI logs.

## Data protection

- No plaintext card data ever touches the backend (see `09-external-integrations.md`).
- PII (email, phone, address) is only exposed to roles that need it (customer sees their own;
  business sees only customer data tied to their orders/bookings; admin sees all, logged via
  `AuditLog`).
- Soft-deleted users are excluded from all customer-facing queries but retained for financial/
  legal record-keeping.

## Audit logging

Global interceptor records every mutating `ADMIN` and `BUSINESS_OWNER`/`BUSINESS_STAFF` action to
`AuditLog` (actor, action, entity type/id, IP, timestamp, metadata). Read-only by design —
`AuditLog` rows are never updated or deleted through the API.

## OWASP-aligned checklist applied

| Risk | Mitigation |
|---|---|
| Broken access control | RBAC + OwnershipGuard on every scoped route |
| Cryptographic failures | argon2id hashing, HTTPS-only transport, hashed refresh tokens |
| Injection | Prisma parameterized queries only, no raw SQL string concatenation |
| Insecure design | Server-recomputed pricing/totals, business-must-be-ACTIVE gate |
| Security misconfiguration | Boot-time env validation, `helmet`, restrictive CORS |
| Vulnerable components | Dependabot/`npm audit` in CI (see `11-mvp-roadmap.md` DevOps) |
| Auth failures | Rate-limited auth routes, refresh-token rotation/reuse detection |
| Data integrity failures | DTO validation, DB constraints (FKs, uniques, enums) |
| Logging/monitoring failures | Structured logs with correlation id, `AuditLog`, health checks |
| SSRF | `MapService`/webhook handlers validate/allow-list outbound targets |
