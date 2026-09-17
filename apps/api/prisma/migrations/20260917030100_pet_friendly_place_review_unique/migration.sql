-- One review per author per place. PET_FRIENDLY_PLACE reviews always have orderId/bookingId
-- both null, so the two existing @@unique constraints on Review (which include orderId or
-- bookingId) never fire for them — Postgres treats every NULL as distinct. This partial index
-- is the real guard for this target type specifically.
CREATE UNIQUE INDEX "review_pet_friendly_place_unique" ON "Review" ("authorId", "targetId") WHERE "targetType" = 'PET_FRIENDLY_PLACE';
