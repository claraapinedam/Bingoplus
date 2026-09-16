-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "maxAgeMonths" INTEGER,
ADD COLUMN     "minAgeMonths" INTEGER,
ADD COLUMN     "requirements" TEXT;

-- CreateTable
CREATE TABLE "ServiceSpecies" (
    "serviceId" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,

    CONSTRAINT "ServiceSpecies_pkey" PRIMARY KEY ("serviceId","speciesId")
);

-- CreateIndex
CREATE INDEX "ServiceSpecies_speciesId_idx" ON "ServiceSpecies"("speciesId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "ServiceSpecies" ADD CONSTRAINT "ServiceSpecies_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSpecies" ADD CONSTRAINT "ServiceSpecies_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "PetSpecies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

