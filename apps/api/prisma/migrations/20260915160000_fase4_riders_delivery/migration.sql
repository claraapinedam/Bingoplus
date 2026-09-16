-- FASE 4: Riders + Delivery + Maps + Tracking — schema foundation.

-- CreateEnum
CREATE TYPE "RiderAccountStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RiderAvailabilityStatus" AS ENUM ('OFFLINE', 'AVAILABLE', 'BUSY');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RiderDocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SEARCHING_RIDER', 'RIDER_ASSIGNED', 'RIDER_ACCEPTED', 'GOING_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_CUSTOMER', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryAssignmentSource" AS ENUM ('AUTO', 'ADMIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "DeliveryAssignmentAction" AS ENUM ('ASSIGNED', 'ACCEPTED', 'REJECTED', 'TIMED_OUT', 'REASSIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryProofType" AS ENUM ('OTP', 'PHOTO', 'SIGNATURE', 'CUSTOMER_CONFIRMATION');

-- CreateEnum
CREATE TYPE "DeliveryIncidentType" AS ENUM ('RIDER_NO_SHOW', 'CUSTOMER_UNAVAILABLE', 'BUSINESS_DELAY', 'VEHICLE_ISSUE', 'WRONG_ADDRESS', 'DAMAGED_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliveryIncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "RiderEarningStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PAID');

-- AlterEnum: §16/§67 — remove the never-used delivery-substates from OrderStatus (verified no
-- code path and no existing row ever set them; Delivery.status now owns this granularity).
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('CREATED', 'PAYMENT_PENDING', 'PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'CREATED';
COMMIT;

-- AlterEnum
ALTER TYPE "VehicleType" ADD VALUE 'OTHER';

-- DropIndex
DROP INDEX "Rider_status_idx";

-- AlterTable: Delivery — table is empty in every environment so far (never written to), safe to
-- add NOT NULL columns without a default.
ALTER TABLE "Delivery" DROP COLUMN "distanceKm",
DROP COLUMN "etaMinutes",
ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "actualDistanceKm" DOUBLE PRECISION,
ADD COLUMN     "actualDurationMinutes" INTEGER,
ADD COLUMN     "assignmentSource" "DeliveryAssignmentSource",
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "deliveryAddressSnapshot" JSONB NOT NULL,
ADD COLUMN     "deliveryFee" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "estimatedDistanceKm" DOUBLE PRECISION,
ADD COLUMN     "estimatedDurationMinutes" INTEGER,
ADD COLUMN     "pickupAddressSnapshot" JSONB NOT NULL,
ADD COLUMN     "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable: Rider — add the split columns, backfill from the old single `status` column so
-- existing riders (seed data) keep their real account state, then drop the old column.
ALTER TABLE "Rider" ADD COLUMN "accountStatus" "RiderAccountStatus" NOT NULL DEFAULT 'PENDING_APPROVAL';
ALTER TABLE "Rider" ADD COLUMN "availabilityStatus" "RiderAvailabilityStatus" NOT NULL DEFAULT 'OFFLINE';

UPDATE "Rider" SET
  "accountStatus" = (CASE "status"
    WHEN 'PENDING_APPROVAL' THEN 'PENDING_APPROVAL'
    WHEN 'SUSPENDED' THEN 'SUSPENDED'
    ELSE 'ACTIVE'
  END)::"RiderAccountStatus",
  "availabilityStatus" = (CASE "status"
    WHEN 'AVAILABLE' THEN 'AVAILABLE'
    WHEN 'BUSY' THEN 'BUSY'
    ELSE 'OFFLINE'
  END)::"RiderAvailabilityStatus";

ALTER TABLE "Rider" DROP COLUMN "status";

-- AlterTable: RiderDocument is empty in every environment so far — safe to reset `status` to the
-- new enum with a plain default rather than a USING cast (old DocumentStatus had no EXPIRED and
-- used APPROVED instead of VERIFIED, so the two enums aren't directly castable anyway).
ALTER TABLE "RiderDocument" ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "expirationDate" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" "RiderDocumentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable: RiderEarning is empty in every environment so far.
ALTER TABLE "RiderEarning" DROP COLUMN "amount",
ADD COLUMN     "adjustments" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "grossAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "netAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "status" "RiderEarningStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "color" TEXT,
ADD COLUMN     "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE';

-- DropEnum
DROP TYPE "RiderStatus";

-- CreateTable
CREATE TABLE "DeliveryAssignmentHistory" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "riderId" TEXT,
    "action" "DeliveryAssignmentAction" NOT NULL,
    "reason" TEXT,
    "source" "DeliveryAssignmentSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderLocation" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryProof" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "type" "DeliveryProofType" NOT NULL,
    "codeHash" TEXT,
    "photoUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryIncident" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "type" "DeliveryIncidentType" NOT NULL,
    "description" TEXT,
    "status" "DeliveryIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderDispatchConfig" (
    "id" TEXT NOT NULL,
    "distanceWeight" DECIMAL(5,4) NOT NULL DEFAULT 0.5,
    "ratingWeight" DECIMAL(5,4) NOT NULL DEFAULT 0.3,
    "availabilityWeight" DECIMAL(5,4) NOT NULL DEFAULT 0.2,
    "maxSearchRadiusKm" DECIMAL(6,2) NOT NULL DEFAULT 10,
    "assignmentTimeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderDispatchConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryAssignmentHistory_deliveryId_idx" ON "DeliveryAssignmentHistory"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryAssignmentHistory_riderId_idx" ON "DeliveryAssignmentHistory"("riderId");

-- CreateIndex
CREATE INDEX "DeliveryAssignmentHistory_createdAt_idx" ON "DeliveryAssignmentHistory"("createdAt");

-- CreateIndex
CREATE INDEX "RiderLocation_riderId_idx" ON "RiderLocation"("riderId");

-- CreateIndex
CREATE INDEX "RiderLocation_deliveryId_idx" ON "RiderLocation"("deliveryId");

-- CreateIndex
CREATE INDEX "RiderLocation_createdAt_idx" ON "RiderLocation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryProof_deliveryId_key" ON "DeliveryProof"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryIncident_deliveryId_idx" ON "DeliveryIncident"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryIncident_status_idx" ON "DeliveryIncident"("status");

-- CreateIndex
CREATE INDEX "Delivery_status_idx" ON "Delivery"("status");

-- CreateIndex
CREATE INDEX "Delivery_createdAt_idx" ON "Delivery"("createdAt");

-- CreateIndex
CREATE INDEX "Rider_accountStatus_idx" ON "Rider"("accountStatus");

-- CreateIndex
CREATE INDEX "Rider_availabilityStatus_idx" ON "Rider"("availabilityStatus");

-- CreateIndex
CREATE INDEX "RiderEarning_deliveryId_idx" ON "RiderEarning"("deliveryId");

-- CreateIndex
CREATE INDEX "RiderEarning_status_idx" ON "RiderEarning"("status");

-- AddForeignKey
ALTER TABLE "DeliveryAssignmentHistory" ADD CONSTRAINT "DeliveryAssignmentHistory_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignmentHistory" ADD CONSTRAINT "DeliveryAssignmentHistory_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderLocation" ADD CONSTRAINT "RiderLocation_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderLocation" ADD CONSTRAINT "RiderLocation_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIncident" ADD CONSTRAINT "DeliveryIncident_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderEarning" ADD CONSTRAINT "RiderEarning_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
