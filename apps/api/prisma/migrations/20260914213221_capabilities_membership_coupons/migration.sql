-- CreateEnum
CREATE TYPE "BusinessCapabilityType" AS ENUM ('SELLS_PRODUCTS', 'DIRECTORY_LISTING', 'SERVICES', 'BOOKINGS', 'PICKUP', 'DELIVERY', 'COUPONS');

-- CreateEnum
CREATE TYPE "BusinessUserRole" AS ENUM ('OWNER', 'MANAGER');

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "BusinessCouponStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdminCouponType" AS ENUM ('PERCENTAGE_DISCOUNT', 'FIXED_AMOUNT_DISCOUNT', 'FREE_MONTHS', 'FREE_TRIAL_EXTENSION');

-- CreateEnum
CREATE TYPE "AdminCouponStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "MembershipPlanStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BusinessMembershipStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'PAID', 'VOID');

-- AlterEnum
ALTER TYPE "ReviewTargetType" ADD VALUE 'PRODUCT';

-- Dev-only data fixup: BUSINESS_STAFF (seeded, never assigned to any user — the staff-invite
-- flow was never built) has no mapping in the renamed enum below. Safe to clear rather than
-- guess a value; `npm run db:seed` reseeds BUSINESS_MANAGER on the next run.
DELETE FROM "UserRole" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "name" = 'BUSINESS_STAFF');
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "name" = 'BUSINESS_STAFF');
DELETE FROM "Role" WHERE "name" = 'BUSINESS_STAFF';

-- AlterEnum
BEGIN;
CREATE TYPE "RoleName_new" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'BUSINESS_OWNER', 'BUSINESS_MANAGER', 'RIDER', 'CUSTOMER');
ALTER TABLE "Role" ALTER COLUMN "name" TYPE "RoleName_new" USING ("name"::text::"RoleName_new");
ALTER TYPE "RoleName" RENAME TO "RoleName_old";
ALTER TYPE "RoleName_new" RENAME TO "RoleName";
DROP TYPE "RoleName_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_promotionId_fkey";

-- DropForeignKey
ALTER TABLE "Promotion" DROP CONSTRAINT "Promotion_businessId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "newValue" JSONB,
ADD COLUMN     "previousValue" JSONB;

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "deliveryEnabled",
DROP COLUMN "pickupEnabled";

-- DropTable
DROP TABLE "Coupon";

-- DropTable
DROP TABLE "Promotion";

-- DropEnum
DROP TYPE "DiscountType";

-- CreateTable
CREATE TABLE "BusinessCapability" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "capability" "BusinessCapabilityType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUser" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "BusinessUserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCoupon" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "minimumPurchase" DECIMAL(12,2),
    "maximumDiscount" DECIMAL(12,2),
    "startDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "usagePerCustomer" INTEGER,
    "termsAndConditions" TEXT,
    "status" "BusinessCouponStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "petId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "purchaseAmount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "metadata" JSONB,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "AdminCouponType" NOT NULL,
    "discountValue" DECIMAL(12,2),
    "freeMonths" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "usagePerBusiness" INTEGER,
    "applicablePlans" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AdminCouponStatus" NOT NULL DEFAULT 'DRAFT',
    "termsAndConditions" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminCouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedValue" JSONB NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "AdminCouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingFrequency" "BillingFrequency" NOT NULL,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "benefits" JSONB,
    "applicableCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "MembershipPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMembership" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "BusinessMembershipStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceRankingConfig" (
    "id" TEXT NOT NULL,
    "speciesMatchWeight" DOUBLE PRECISION NOT NULL,
    "distanceWeight" DOUBLE PRECISION NOT NULL,
    "availabilityWeight" DOUBLE PRECISION NOT NULL,
    "ratingWeight" DOUBLE PRECISION NOT NULL,
    "deliveryWeight" DOUBLE PRECISION NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceRankingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessCapability_businessId_idx" ON "BusinessCapability"("businessId");

-- CreateIndex
CREATE INDEX "BusinessCapability_capability_idx" ON "BusinessCapability"("capability");

-- CreateIndex
CREATE INDEX "BusinessCapability_enabled_idx" ON "BusinessCapability"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCapability_businessId_capability_key" ON "BusinessCapability"("businessId", "capability");

-- CreateIndex
CREATE INDEX "BusinessUser_businessId_idx" ON "BusinessUser"("businessId");

-- CreateIndex
CREATE INDEX "BusinessUser_userId_idx" ON "BusinessUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUser_businessId_userId_key" ON "BusinessUser"("businessId", "userId");

-- CreateIndex
CREATE INDEX "BusinessCoupon_businessId_idx" ON "BusinessCoupon"("businessId");

-- CreateIndex
CREATE INDEX "BusinessCoupon_status_idx" ON "BusinessCoupon"("status");

-- CreateIndex
CREATE INDEX "BusinessCoupon_expirationDate_idx" ON "BusinessCoupon"("expirationDate");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCoupon_businessId_code_key" ON "BusinessCoupon"("businessId", "code");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");

-- CreateIndex
CREATE INDEX "CouponRedemption_customerId_idx" ON "CouponRedemption"("customerId");

-- CreateIndex
CREATE INDEX "CouponRedemption_businessId_idx" ON "CouponRedemption"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminCoupon_code_key" ON "AdminCoupon"("code");

-- CreateIndex
CREATE INDEX "AdminCoupon_status_idx" ON "AdminCoupon"("status");

-- CreateIndex
CREATE INDEX "AdminCoupon_expirationDate_idx" ON "AdminCoupon"("expirationDate");

-- CreateIndex
CREATE INDEX "AdminCouponRedemption_couponId_idx" ON "AdminCouponRedemption"("couponId");

-- CreateIndex
CREATE INDEX "AdminCouponRedemption_membershipId_idx" ON "AdminCouponRedemption"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMembership_businessId_key" ON "BusinessMembership"("businessId");

-- CreateIndex
CREATE INDEX "BusinessMembership_status_idx" ON "BusinessMembership"("status");

-- CreateIndex
CREATE INDEX "BusinessMembership_planId_idx" ON "BusinessMembership"("planId");

-- CreateIndex
CREATE INDEX "Subscription_membershipId_idx" ON "Subscription"("membershipId");

-- CreateIndex
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "MarketplaceRankingConfig_createdAt_idx" ON "MarketplaceRankingConfig"("createdAt");

-- AddForeignKey
ALTER TABLE "BusinessCapability" ADD CONSTRAINT "BusinessCapability_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUser" ADD CONSTRAINT "BusinessUser_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUser" ADD CONSTRAINT "BusinessUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCoupon" ADD CONSTRAINT "BusinessCoupon_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "BusinessCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCouponRedemption" ADD CONSTRAINT "AdminCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "AdminCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCouponRedemption" ADD CONSTRAINT "AdminCouponRedemption_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "BusinessMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "BusinessMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

