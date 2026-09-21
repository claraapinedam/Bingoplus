-- CreateEnum
CREATE TYPE "CommissionCouponTargetType" AS ENUM ('BUSINESS', 'RIDER');

-- DropIndex
DROP INDEX "Commission_businessId_idx";

-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CommissionCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetType" "CommissionCouponTargetType" NOT NULL,
    "commissionPercent" DECIMAL(5,4) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "status" "AdminCouponStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionCouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "businessId" TEXT,
    "riderId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionCouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderCommissionOverride" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "bingoCommissionPercent" DECIMAL(5,4) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderCommissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionCoupon_code_key" ON "CommissionCoupon"("code");

-- CreateIndex
CREATE INDEX "CommissionCoupon_status_idx" ON "CommissionCoupon"("status");

-- CreateIndex
CREATE INDEX "CommissionCoupon_expirationDate_idx" ON "CommissionCoupon"("expirationDate");

-- CreateIndex
CREATE INDEX "CommissionCouponRedemption_businessId_idx" ON "CommissionCouponRedemption"("businessId");

-- CreateIndex
CREATE INDEX "CommissionCouponRedemption_riderId_idx" ON "CommissionCouponRedemption"("riderId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionCouponRedemption_couponId_businessId_key" ON "CommissionCouponRedemption"("couponId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionCouponRedemption_couponId_riderId_key" ON "CommissionCouponRedemption"("couponId", "riderId");

-- CreateIndex
CREATE INDEX "RiderCommissionOverride_riderId_effectiveFrom_idx" ON "RiderCommissionOverride"("riderId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Commission_businessId_effectiveFrom_idx" ON "Commission"("businessId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "CommissionCouponRedemption" ADD CONSTRAINT "CommissionCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "CommissionCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCouponRedemption" ADD CONSTRAINT "CommissionCouponRedemption_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCouponRedemption" ADD CONSTRAINT "CommissionCouponRedemption_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderCommissionOverride" ADD CONSTRAINT "RiderCommissionOverride_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
