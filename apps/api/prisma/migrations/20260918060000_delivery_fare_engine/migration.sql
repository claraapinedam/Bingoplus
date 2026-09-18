-- AlterTable
ALTER TABLE "Business" DROP COLUMN "deliveryEstimateMinutes",
DROP COLUMN "deliveryFeeUsd";

-- AlterTable
ALTER TABLE "PricingConfiguration" DROP COLUMN "defaultDeliveryFee",
DROP COLUMN "platformFeePercent";

-- AlterTable
ALTER TABLE "RiderEarning" ADD COLUMN     "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxWithheldAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DeliveryFareConfig" (
    "id" TEXT NOT NULL,
    "minFareDay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "minFareNight" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "nightStartHour" INTEGER NOT NULL DEFAULT 20,
    "nightEndHour" INTEGER NOT NULL DEFAULT 6,
    "perKmRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "perMinuteRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "surgeThreshold" DECIMAL(6,2) NOT NULL DEFAULT 2,
    "surgeMultiplier" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "bingoCommissionPercent" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "riderTaxWithholdingPercent" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryFareConfig_pkey" PRIMARY KEY ("id")
);

