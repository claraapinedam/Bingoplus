-- CreateEnum
CREATE TYPE "BusinessOnlineOverride" AS ENUM ('ONLINE', 'OFFLINE');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "manualOverride" "BusinessOnlineOverride",
ADD COLUMN     "manualOverrideAt" TIMESTAMP(3);
