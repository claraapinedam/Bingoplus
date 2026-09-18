-- AlterEnum
ALTER TYPE "RiderAccountStatus" ADD VALUE 'APPROVED';

-- CreateTable
CREATE TABLE "RiderContract" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "idType" "BusinessIdType" NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "bingoCommissionPercent" DECIMAL(5,2) NOT NULL,
    "riderTaxWithholdingPercent" DECIMAL(5,2) NOT NULL,
    "contractText" TEXT NOT NULL,
    "signatureDataUrl" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedIp" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiderContract_riderId_idx" ON "RiderContract"("riderId");

-- AddForeignKey
ALTER TABLE "RiderContract" ADD CONSTRAINT "RiderContract_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
