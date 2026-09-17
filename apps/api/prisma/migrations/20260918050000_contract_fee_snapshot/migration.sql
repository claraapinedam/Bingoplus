-- AlterTable
ALTER TABLE "BusinessContract" ADD COLUMN     "commissionRatePercent" DECIMAL(5,2),
ADD COLUMN     "membershipBillingFrequency" TEXT,
ADD COLUMN     "membershipPlanName" TEXT,
ADD COLUMN     "membershipPriceUsd" DECIMAL(10,2);

