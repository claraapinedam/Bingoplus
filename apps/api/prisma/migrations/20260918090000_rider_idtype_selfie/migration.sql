-- AlterEnum
ALTER TYPE "RiderDocumentType" ADD VALUE 'SELFIE';

-- AlterTable
ALTER TABLE "Rider" ADD COLUMN     "idType" "BusinessIdType",
ADD COLUMN     "legalName" TEXT;
