-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "payoutId" TEXT,
ADD COLUMN     "serviceFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Booking_payoutId_idx" ON "Booking"("payoutId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data backfill: every Booking created before this feature existed was priced/charged as exactly
-- `price` (see BookingsService.createBookingPayment's old behavior) — tax/serviceFee were never
-- part of the deal for those rows, so `total` must equal `price` for them, never 0. Only bookings
-- created from here on (BookingsService.create) get a real tax/serviceFee/total computed from the
-- live PricingConfiguration at creation time.
UPDATE "Booking" SET "total" = "price" WHERE "total" = 0;
