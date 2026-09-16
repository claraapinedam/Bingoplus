# BINGO+ — User Journeys

## Customer — Registration → First Purchase (Delivery)

1. Register (email+password or Google) → email verification sent.
2. Complete profile → add first Address (geocoded via `MapService`) → add first Pet (optional).
3. Home → search "alimento para perros" or tap category `TIENDAS`.
4. Explore results (filtered by distance/rating) → open a `BusinessCard`.
5. Browse products → add to cart (cart is scoped to that business).
6. Cart → Checkout → choose **Delivery** → confirm address → select payment method.
7. Order created (`CREATED`) → Payment processed (`PAYMENT_PENDING` → `PAID`) → `CONFIRMED`.
8. Business accepts → `PREPARING` → `READY_FOR_PICKUP` → system searches rider
   (`SEARCHING_RIDER`) → rider accepts (`RIDER_ASSIGNED`) → `PICKED_UP` → `IN_TRANSIT`.
9. Customer watches live tracking (WebSocket) → `DELIVERED`.
10. Customer rates business and rider.

## Customer — Pickup flow

Same as above through `READY_FOR_PICKUP`, then: push notification "your order is ready" →
customer goes to the store → business marks order `COMPLETED` at handoff (no rider involved).

## Customer — Password recovery

Forgot password → enter email → `PasswordResetToken` issued and emailed (never returned in the
API response) → user opens link → sets new password → all existing `RefreshToken`s for that user
are revoked.

## Business — Onboarding → First Sale

1. Business owner registers as `CUSTOMER` first (same identity system), then applies via
   "Solicitar afiliación" → fills business form + uploads documents → `Business.status = PENDING`.
2. Admin reviews (`UNDER_REVIEW`) → checks documents/bank account → `APPROVED` or `REJECTED`.
3. On `APPROVED`, business completes catalog/hours setup → Admin (or automated checklist) flips to
   `ACTIVE`. **Only `ACTIVE` businesses appear in Explore/Home and can receive orders.**
4. Order arrives in Business Portal → `Orders / New` → Accept → `Preparing` → `Ready` →
   (pickup: hand off; delivery: rider takes over) → `Completed`.
5. Owner checks Dashboard (sales, rating) and Finance (payouts net of commission).

## Rider — Onboarding → First Delivery

1. Register (or add RIDER role to an existing account) → upload documents (ID, license,
   insurance) + register vehicle → `PENDING_APPROVAL`.
2. Admin reviews documents → `APPROVED`.
3. Rider toggles "Activarse" → `AVAILABLE` (broadcasts location periodically).
4. Dispatch offers a delivery (business, distance, destination, estimated earning, ETA) →
   rider **Accepts** (`RIDER_ASSIGNED`, rider → `BUSY`) or **Rejects** (offer goes to next
   candidate).
5. Navigate to business (`MapService` route) → mark `PICKED_UP` → navigate to customer →
   mark `DELIVERED` → rider → `AVAILABLE` again, `RiderEarning` recorded.
6. Rider checks Earnings tab (today/week/history) and rating.

## Admin — Approve a business

Businesses queue (`PENDING`/`UNDER_REVIEW`) → open detail → review documents inline → set
commission rate (or leave default) → Approve (→ `APPROVED`, notification sent to owner) or
Reject (with reason, notification sent).

## Admin — Configure marketplace economics

Settings → Commissions & Fees → edit `PlatformSetting` values (default commission %, delivery fee
formula, service fee %) → takes effect on the **next** checkout calculation (existing orders are
never recomputed).
