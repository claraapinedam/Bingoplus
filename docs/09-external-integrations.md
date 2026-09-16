# BINGO+ — External Integrations

**Rule enforced across the codebase**: no integration is ever mocked-and-called-real. If a
provider isn't configured (env var missing), the wrapping service throws a clear
`IntegrationNotConfiguredException` (→ HTTP 503 with a `code` the frontend can render as a real
"not available yet" state) instead of returning fabricated data.

## Google Maps Platform (`maps` module → `MapService`)

- **APIs used**: Geocoding, Places (Autocomplete + Details), Distance Matrix / Routes,
  (client-side) Maps JavaScript SDK / mobile SDKs for rendering.
- **Abstraction**: `MapService` interface (`geocode`, `reverseGeocode`, `searchPlaces`,
  `getDistanceAndEta`, `nearbyBusinesses`) — the rest of the app calls this interface, never the
  Google SDK directly, so a future provider swap (e.g. Mapbox) touches one module.
- **Config**: `GOOGLE_MAPS_API_KEY`. Built in Phase 4.
- **Fallback**: if geolocation permission is denied client-side, the UI falls back to manual
  address entry, which still goes through `MapService.geocode` — coordinates are **never**
  invented client-side.

## Payments (`payments` module → `PaymentService`)

- **Abstraction**: `PaymentService` interface (`createPaymentIntent`, `capture`, `refund`,
  `handleWebhook`) with one adapter per provider (`StripeAdapter`, `MercadoPagoAdapter`, chosen
  per business market/currency via `PlatformSetting`).
- **Config**: `PAYMENT_PROVIDER`, `PAYMENT_SECRET_KEY` (and provider-specific webhook signing
  secret). Built in Phase 3, **sandbox/test mode only** until real credentials are provisioned by
  the business.
- **Cards**: never stored — `PaymentMethod.providerToken` is an opaque token returned by the
  provider's client SDK; raw PAN/CVV never reaches the backend.
- **Explicit rule**: a `Payment` is only marked `PAID` after the provider confirms (webhook or
  synchronous capture response) — the API never marks a payment successful client-side.

## Notifications (`notifications` module → `NotificationService`)

- **Channels**: Push (FCM planned), Email (provider TBD — SendGrid/Resend/SES), SMS (provider
  TBD — Twilio/local aggregator), WhatsApp (future — via WhatsApp Business API/Twilio).
- **Config**: `EMAIL_API_KEY`, `SMS_API_KEY`, `PUSH_NOTIFICATION_KEY`.
- **Behavior when unconfigured**: events are still recorded as `Notification` rows (in-app
  notification center keeps working); the outbound channel send is skipped and logged, never
  faked as delivered.

## Storage (S3-compatible)

- **Config**: `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`, plus an endpoint var
  for non-AWS providers. Uploads go through a pre-signed URL flow (`POST
  /api/v1/.../upload-url`) — the backend never proxies file bytes.

## Social login (Google, Apple)

- **Config**: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Apple analogous, added when Apple
  developer account is available). Implemented as Passport strategies behind the same
  `/api/v1/auth/*` surface; if env vars are absent, the corresponding button is disabled in the
  UI and the endpoint returns `IntegrationNotConfiguredException` rather than a fake session.

## OTP

- Delivered via the SMS/Email provider above; codes are hashed at rest (`OtpCode.codeHash`),
  short-lived, rate-limited per destination.

## Analytics

- **Abstraction**: an `AnalyticsService.track(event, properties)` interface, backed by a no-op
  sink until `ANALYTICS_PROVIDER`/`ANALYTICS_KEY` (Google Analytics 4 / Firebase Analytics) is
  configured — see event catalog in `12-development-plan.md` §Phase 8.

## Future integrations (architecture reserved, not built)

Telemedicine video, pet insurance underwriting, pharmacy fulfillment, AI recommendation engine —
each gets its own adapter behind a service interface when scheduled; no placeholder code is added
for these until a phase requires it, per rule §60 ("no agregar funcionalidades silenciosamente").
