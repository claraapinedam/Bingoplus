# BINGO+ — Database Schema

Source of truth is `apps/api/prisma/schema.prisma`. This document is the human-readable index of
every table, grouped by domain, with keys/indexes and phase in which its API becomes functional.
All tables are created in Phase 1's initial migration (architecture must exist up front); the
**API surface** for each is built in the phase noted.

Conventions applied to every table unless noted: `id` = `cuid()` primary key, `createdAt`/
`updatedAt` timestamps, soft delete via nullable `deletedAt` where the row is a referential target
of historical records.

## Identity (Phase 1)

**User** — `id, email (unique), phone (unique, nullable), passwordHash (nullable — social-only
accounts), firstName, lastName, avatarUrl, isEmailVerified, isPhoneVerified, isActive, deletedAt,
createdAt, updatedAt`. Index: `email`, `phone`.

**Role** — `id, name (unique: SUPER_ADMIN | ADMIN | BUSINESS_OWNER | BUSINESS_STAFF | RIDER |
CUSTOMER), description`.

**Permission** — `id, resource, action` (e.g. `resource="orders", action="refund"`). Unique on
`(resource, action)`.

**RolePermission** — join table `(roleId, permissionId)`, composite PK.

**UserRole** — join table `(userId, roleId)`, composite PK. A user can hold multiple roles (e.g. a
`CUSTOMER` who also owns a `Business` gets `BUSINESS_OWNER` added, never loses `CUSTOMER`).

**RefreshToken** — `id, userId, tokenHash, expiresAt, revokedAt, userAgent, ipAddress,
createdAt`. Index: `userId`, `tokenHash`.

**PasswordResetToken** — `id, userId, tokenHash, expiresAt, usedAt, createdAt`.

**OtpCode** — `id, userId (nullable), destination (email/phone), purpose (LOGIN | VERIFY_PHONE |
VERIFY_EMAIL), codeHash, expiresAt, consumedAt, attempts, createdAt`.

**Address** — `id, userId, label, line1, line2, city, state, country, postalCode, latitude,
longitude, isDefault, createdAt, updatedAt`. Index: `userId`.

## Pets (Phase 1)

**Pet** — `id, ownerId, name, species, breed, sex, birthDate, weight, photoUrl, allergies (text[]),
foodPreferences (text[]), medicalNotes, veterinarian, deletedAt, createdAt, updatedAt`. Index:
`ownerId`. *(Architecture reserved, not built in Phase 1: `PetVaccine`, `PetMedication`,
`PetDocument`, `PetReminder`, `PetVetVisit` — see `09-external-integrations.md` §Future.)*

## Directory (Phase 1: onboarding + status; catalog ops in Phase 2)

**BusinessCategory** — `id, name, slug (unique), icon`. Seeded: Tiendas, Veterinarios,
Guarderías, Hospedajes, Grooming, Paseadores, Pet Friendly, Delivery.

**Business** — `id, ownerId, categoryId, tradeName, legalName, taxId, email, phone, description,
logoUrl, coverImageUrl, addressLine, city, latitude, longitude, openingHours (json),
deliveryEnabled, pickupEnabled, status (BusinessStatus), ratingAvg, reviewCount, deletedAt,
createdAt, updatedAt`. Index: `ownerId`, `categoryId`, `status`, GIST on `(latitude,longitude)`
via PostGIS `location geography(Point,4326)` generated column.

**BusinessDocument** — `id, businessId, type (RUC | ID | BANK_ACCOUNT | LICENSE | OTHER), fileUrl,
status (PENDING | APPROVED | REJECTED), reviewedBy, reviewedAt, createdAt`.

## Catalog (Phase 2)

**ProductCategory** — `id, name, slug (unique), icon`. Seeded: alimento, snacks, juguetes,
accesorios, higiene, camas, transporte, farmacia veterinaria, otros.

**Product** — `id, businessId, categoryId, name, description, price, salePrice, sku, stock,
weight, images (text[]), status (ACTIVE | INACTIVE), deletedAt, createdAt, updatedAt`. Index:
`businessId`, `categoryId`, `status`.

**ProductVariant** — `id, productId, name, sku (unique), priceDelta, stock`.

**InventoryMovement** — `id, productId, variantId (nullable), quantityChange, reason (RESTOCK |
SALE | ADJUSTMENT | RETURN), note, createdAt`. Append-only audit trail; `Product.stock` /
`ProductVariant.stock` are the live counters it explains.

## Commerce (Phase 2 cart, Phase 3 checkout/orders)

**Cart** — `id, userId (unique — one active cart per user), businessId, createdAt, updatedAt`.
Single-business cart by design (see `01-product-architecture.md` §4).

**CartItem** — `id, cartId, productId, variantId (nullable), quantity, unitPriceSnapshot`.

**Order** — `id, orderNumber (unique), userId, businessId, addressId (nullable — pickup orders),
fulfillmentType (PICKUP | DELIVERY), status (OrderStatus), subtotal, discount, deliveryFee,
serviceFee, tax, total, currency, notes, cancelReason, createdAt, updatedAt`. Index: `userId`,
`businessId`, `status`.

**OrderItem** — `id, orderId, productId, variantId (nullable), nameSnapshot, quantity, unitPrice,
subtotal`.

## Payments (Phase 3)

**PaymentMethod** — `id, userId, provider, type (CARD | WALLET | CASH), brand, last4,
providerToken, isDefault, createdAt`. **Never** stores a full card number or CVV — `providerToken`
is an opaque token from the PSP.

**Payment** — `id, orderId (unique), provider, providerPaymentId, amount, currency, status
(PaymentStatus), createdAt, updatedAt`.

**Transaction** — `id, paymentId, type (CHARGE | REFUND), amount, status, providerRef,
rawResponse (json), createdAt`.

## Riders & delivery (Phase 4)

**Rider** — `id, userId (unique), status (RiderStatus), city, currentLatitude, currentLongitude,
lastLocationAt, ratingAvg, deliveriesCompleted, createdAt, updatedAt`.

**Vehicle** — `id, riderId, type (WALK | BIKE | MOTORCYCLE | CAR), plate, brand, model, year`.

**RiderDocument** — `id, riderId, type (ID | LICENSE | INSURANCE | VEHICLE_REGISTRATION),
fileUrl, status (PENDING | APPROVED | REJECTED), reviewedBy, reviewedAt, createdAt`.

**Delivery** — `id, orderId (unique), riderId (nullable until assigned), assignedAt, pickedUpAt,
deliveredAt, distanceKm, etaMinutes, route (json), createdAt, updatedAt`.

**RiderEarning** — `id, riderId, deliveryId, amount, type (DELIVERY_FEE | TIP | BONUS),
createdAt`.

## Services & bookings (Phase 7)

**Service** — `id, businessId, type (VETERINARY | DAYCARE | BOARDING | GROOMING | DOG_WALKING),
name, description, price, durationMinutes, capacity, active, createdAt, updatedAt`.

**Booking** — `id, userId, petId, businessId, serviceId, date, startTime, endTime, status
(BookingStatus), price, notes, createdAt, updatedAt`.

## Pet-friendly directory (Phase 1 schema, Phase 7 API)

**PetFriendlyCategory** — `id, name, slug (unique)`. Seeded: Restaurantes, Cafeterías, Parques,
Hoteles, Centros comerciales, Tiendas, Otros.

**PetFriendlyPlace** — `id, name, description, categoryId, address, latitude, longitude, phone,
website, photos (text[]), ratingAvg, petRules, amenities (text[]), verified, openingHours (json),
createdAt, updatedAt`.

## Reputation & growth (Phase 8)

**Review** — `id, authorId, targetType (BUSINESS | RIDER | SERVICE), targetId, orderId
(nullable), bookingId (nullable), rating (1-5), comment, status (PUBLISHED | HIDDEN | FLAGGED),
createdAt`.

**Favorite** — `id, userId, targetType (BUSINESS | PRODUCT | SERVICE | PET_FRIENDLY_PLACE),
targetId, createdAt`. Unique on `(userId, targetType, targetId)`.

**Promotion** — `id, businessId (nullable = platform-wide), name, description, discountType
(PERCENT | FIXED), value, startAt, endAt, active, createdAt`.

**Coupon** — `id, code (unique), promotionId, usageLimit, usedCount, perUserLimit,
minOrderAmount, active, createdAt`.

**Notification** — `id, userId, channel (PUSH | EMAIL | SMS | WHATSAPP), event, title, body,
data (json), read, sentAt, createdAt`.

## Marketplace economics (Phase 1 settings, Phase 3+ usage)

**PlatformSetting** — `id, key (unique), value (json), description, updatedBy, updatedAt`. Holds
the *default* commission %, delivery-fee formula params, and service-fee % — read at
checkout/payout time, never hardcoded. Editable only via Admin.

**Commission** — `id, businessId, rate, effectiveFrom, createdBy, createdAt`. A business's
effective rate is its latest `Commission` row, or `PlatformSetting["default_commission_rate"]` if
none exists.

**Payout** — `id, payeeType (BUSINESS | RIDER), payeeId, amount, status (PENDING | PAID |
FAILED), periodStart, periodEnd, paidAt, createdAt`.

## Governance (Phase 1 audit log, Phase 8 disputes)

**Dispute** — `id, orderId (nullable), bookingId (nullable), raisedByUserId, type, description,
status (OPEN | UNDER_REVIEW | RESOLVED | REJECTED), resolution, resolvedBy, resolvedAt,
createdAt`.

**AuditLog** — `id, actorUserId (nullable — system actions), action, entityType, entityId,
metadata (json), ipAddress, createdAt`. Append-only, written by an interceptor on every mutating
admin/business action.
