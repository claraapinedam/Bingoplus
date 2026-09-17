-- CreateTable
CREATE TABLE "BusinessSpecies" (
    "businessId" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,

    CONSTRAINT "BusinessSpecies_pkey" PRIMARY KEY ("businessId","speciesId")
);

-- CreateIndex
CREATE INDEX "BusinessSpecies_speciesId_idx" ON "BusinessSpecies"("speciesId");

-- AddForeignKey
ALTER TABLE "BusinessSpecies" ADD CONSTRAINT "BusinessSpecies_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSpecies" ADD CONSTRAINT "BusinessSpecies_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "PetSpecies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

