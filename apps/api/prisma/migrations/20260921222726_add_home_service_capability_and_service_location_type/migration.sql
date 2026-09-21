-- CreateEnum
CREATE TYPE "ServiceLocationType" AS ENUM ('AT_BUSINESS', 'AT_CUSTOMER_HOME', 'BOTH');

-- AlterEnum
ALTER TYPE "BusinessCapabilityType" ADD VALUE 'HOME_SERVICE';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "locationType" "ServiceLocationType" NOT NULL DEFAULT 'AT_BUSINESS';
