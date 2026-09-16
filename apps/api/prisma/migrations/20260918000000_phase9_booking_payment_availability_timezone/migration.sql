-- CreateEnum
CREATE TYPE "AvailabilityBlockStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Guayaquil';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bookingId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AvailabilityBlock" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "serviceId" TEXT,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "AvailabilityBlockStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityBlock_businessId_idx" ON "AvailabilityBlock"("businessId");

-- CreateIndex
CREATE INDEX "AvailabilityBlock_serviceId_idx" ON "AvailabilityBlock"("serviceId");

-- CreateIndex
CREATE INDEX "AvailabilityBlock_startDateTime_endDateTime_idx" ON "AvailabilityBlock"("startDateTime", "endDateTime");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "Payment"("bookingId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FASE 9 §1: the real DB-level guard that a Payment can never belong to both an Order and a
-- Booking at once, and never to neither.
ALTER TABLE "Payment" ADD CONSTRAINT "payment_exactly_one_target" CHECK (
  ("orderId" IS NOT NULL AND "bookingId" IS NULL) OR ("orderId" IS NULL AND "bookingId" IS NOT NULL)
);

