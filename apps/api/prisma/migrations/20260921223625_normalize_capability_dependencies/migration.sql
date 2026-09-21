-- Data backfill: enforce the new dependency invariants retroactively on existing rows, not just
-- on future toggles (BusinessesService.setCapabilityAsAdmin/setOperationalCapability). Any business
-- that already had SERVICES/BOOKINGS/COUPONS/HOME_SERVICE enabled without DIRECTORY_LISTING, or
-- PICKUP/DELIVERY enabled without SELLS_PRODUCTS, gets those forced off — those combinations were
-- never meant to be reachable and the owner-facing Settings screen now hides them regardless.

UPDATE "BusinessCapability" bc
SET "enabled" = false
WHERE bc."capability" IN ('SERVICES', 'BOOKINGS', 'COUPONS', 'HOME_SERVICE')
  AND bc."enabled" = true
  AND NOT EXISTS (
    SELECT 1 FROM "BusinessCapability" dl
    WHERE dl."businessId" = bc."businessId" AND dl."capability" = 'DIRECTORY_LISTING' AND dl."enabled" = true
  );

UPDATE "BusinessCapability" bc
SET "enabled" = false
WHERE bc."capability" IN ('PICKUP', 'DELIVERY')
  AND bc."enabled" = true
  AND NOT EXISTS (
    SELECT 1 FROM "BusinessCapability" sp
    WHERE sp."businessId" = bc."businessId" AND sp."capability" = 'SELLS_PRODUCTS' AND sp."enabled" = true
  );
