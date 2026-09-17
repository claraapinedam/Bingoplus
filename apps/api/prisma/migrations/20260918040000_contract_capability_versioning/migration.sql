-- AlterEnum
ALTER TYPE "ContractStatus" ADD VALUE 'SUPERSEDED';

-- AlterTable
ALTER TABLE "BusinessContract" ADD COLUMN     "directoryListing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sellsProducts" BOOLEAN NOT NULL DEFAULT false;

