-- CreateEnum
CREATE TYPE "BusinessBankAccountType" AS ENUM ('SAVINGS', 'CHECKING');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "bankAccountHolderName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankAccountType" "BusinessBankAccountType",
ADD COLUMN     "bankName" TEXT;

-- AlterTable
ALTER TABLE "BusinessContract" ADD COLUMN     "bankAccountHolderName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankAccountType" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bingoPlusAddress" TEXT,
ADD COLUMN     "bingoPlusLegalName" TEXT,
ADD COLUMN     "bingoPlusRepresentativeName" TEXT,
ADD COLUMN     "bingoPlusTaxId" TEXT,
ADD COLUMN     "businessAddressLine" TEXT,
ADD COLUMN     "businessTradeName" TEXT;

-- CreateTable
CREATE TABLE "PlatformLegalInfo" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "legalRepresentativeName" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformLegalInfo_pkey" PRIMARY KEY ("id")
);

