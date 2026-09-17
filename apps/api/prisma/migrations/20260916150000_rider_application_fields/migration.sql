-- CreateEnum
CREATE TYPE "RiderDocumentSide" AS ENUM ('FRONT', 'BACK');

-- CreateEnum
CREATE TYPE "RiderPayoutMethodType" AS ENUM ('BANK_ACCOUNT', 'MOBILE_WALLET');

-- CreateEnum
CREATE TYPE "RiderBankAccountType" AS ENUM ('SAVINGS', 'CHECKING');

-- AlterTable
ALTER TABLE "Rider" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "dataConsentAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "nationalIdNumber" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RiderDocument" ADD COLUMN     "side" "RiderDocumentSide";

-- CreateTable
CREATE TABLE "RiderPayoutMethod" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "method" "RiderPayoutMethodType" NOT NULL,
    "bankName" TEXT,
    "accountType" "RiderBankAccountType",
    "accountNumber" TEXT,
    "walletProvider" TEXT,
    "walletNumber" TEXT,
    "accountHolderName" TEXT NOT NULL,
    "holderDocumentNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderPayoutMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiderPayoutMethod_riderId_key" ON "RiderPayoutMethod"("riderId");

-- CreateIndex
CREATE UNIQUE INDEX "RiderDocument_riderId_type_side_key" ON "RiderDocument"("riderId", "type", "side");

-- AddForeignKey
ALTER TABLE "RiderPayoutMethod" ADD CONSTRAINT "RiderPayoutMethod_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

