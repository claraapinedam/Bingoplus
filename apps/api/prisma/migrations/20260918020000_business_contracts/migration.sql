-- CreateEnum
CREATE TYPE "BusinessIdType" AS ENUM ('RUC', 'CEDULA');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('PENDING_SIGNATURE', 'SIGNED');

-- AlterEnum
ALTER TYPE "BusinessDocumentType" ADD VALUE 'CONTRACT';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "idType" "BusinessIdType" NOT NULL DEFAULT 'RUC',
ADD COLUMN     "representativeName" TEXT;

-- CreateTable
CREATE TABLE "BusinessContract" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "idType" "BusinessIdType" NOT NULL,
    "legalName" TEXT NOT NULL,
    "representativeName" TEXT,
    "taxId" TEXT NOT NULL,
    "contractHtml" TEXT NOT NULL,
    "signatureDataUrl" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedIp" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessContract_businessId_idx" ON "BusinessContract"("businessId");

-- AddForeignKey
ALTER TABLE "BusinessContract" ADD CONSTRAINT "BusinessContract_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

