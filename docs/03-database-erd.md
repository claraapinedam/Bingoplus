# BINGO+ — Database ERD

PostgreSQL 15+ with the **PostGIS** extension enabled (needed for `nearby business` /
`distance` queries in `businesses`, `riders.currentLocation`, and `pet_friendly_places`).
Full field-level definitions live in `04-database-schema.md`; this document shows relationships.

## Core identity & pets

```mermaid
erDiagram
    User ||--o{ UserRole : has
    Role ||--o{ UserRole : "assigned to"
    Role ||--o{ RolePermission : has
    Permission ||--o{ RolePermission : "granted via"
    User ||--o{ Address : owns
    User ||--o{ Pet : owns
    User ||--o{ RefreshToken : has
    User ||--o{ PasswordResetToken : has
    User ||--o{ PaymentMethod : has
    User ||--o| Business : "owns (as BUSINESS_OWNER)"
    User ||--o| Rider : "is (as RIDER)"
```

## Businesses & catalog

```mermaid
erDiagram
    Business }o--|| BusinessCategory : "categorized as"
    Business ||--o{ BusinessDocument : has
    Business ||--o{ Product : sells
    Business ||--o{ Service : offers
    Business ||--o{ Commission : "has rate history"
    Product }o--|| ProductCategory : "categorized as"
    Product ||--o{ ProductVariant : has
    Product ||--o{ InventoryMovement : tracks
```

## Commerce & fulfillment

```mermaid
erDiagram
    User ||--o| Cart : has
    Business ||--o{ Cart : "scoped to"
    Cart ||--o{ CartItem : contains
    CartItem }o--|| Product : references
    User ||--o{ Order : places
    Business ||--o{ Order : receives
    Address }o--o| Order : "ships to"
    Order ||--o{ OrderItem : contains
    Order ||--o| Payment : "paid by"
    Payment ||--o{ Transaction : has
    Order ||--o| Delivery : "fulfilled by (if DELIVERY)"
    Rider ||--o{ Delivery : fulfills
    Vehicle }o--|| Rider : "belongs to"
    Rider ||--o{ RiderDocument : has
    Rider ||--o{ RiderEarning : earns
```

## Services, bookings & directory

```mermaid
erDiagram
    Business ||--o{ Service : offers
    User ||--o{ Booking : requests
    Pet ||--o{ Booking : "is for"
    Business ||--o{ Booking : receives
    Service ||--o{ Booking : "booked as"
    PetFriendlyPlace }o--|| PetFriendlyCategory : "categorized as"
```

## Reputation, growth & marketplace economics

```mermaid
erDiagram
    User ||--o{ Review : writes
    User ||--o{ Favorite : saves
    Business ||--o{ Promotion : creates
    Promotion ||--o{ Coupon : generates
    User ||--o{ Notification : receives
    Business ||--o{ Payout : "receives payouts"
    Rider ||--o{ Payout : "receives payouts"
    Order ||--o{ Dispute : "can raise"
    User ||--o{ AuditLog : "performs actions logged as"
```

## Notes

- **Soft delete**: `User`, `Pet`, `Business`, `Product` carry `deletedAt` — never hard-deleted
  because they're referential targets of `Order`/`Booking`/`Review` history.
- **Money fields** use `Decimal(12,2)` (Prisma `Decimal`, Postgres `numeric`), never `float`.
- **Geolocation**: `Business.location`, `Rider.currentLocation`, `PetFriendlyPlace.location` are
  PostGIS `geography(Point, 4326)` columns (plus plain `latitude`/`longitude` for easy reads),
  indexed with `GIST` for radius queries.
