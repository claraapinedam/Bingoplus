-- Dev-only data reset: Pet.species (free text) is replaced by a required speciesId FK.
-- Existing Pet rows are fictitious seed data with no defensible mapping to the new lookup table,
-- so they're cleared here rather than guessed at; `npm run db:seed` repopulates them correctly.
DELETE FROM "Pet";

-- CreateTable
CREATE TABLE "PetSpecies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,

    CONSTRAINT "PetSpecies_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Pet" DROP COLUMN "species",
ADD COLUMN     "speciesId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ProductSpecies" (
    "productId" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,

    CONSTRAINT "ProductSpecies_pkey" PRIMARY KEY ("productId","speciesId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PetSpecies_slug_key" ON "PetSpecies"("slug");

-- CreateIndex
CREATE INDEX "ProductSpecies_speciesId_idx" ON "ProductSpecies"("speciesId");

-- CreateIndex
CREATE INDEX "Pet_speciesId_idx" ON "Pet"("speciesId");

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "PetSpecies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecies" ADD CONSTRAINT "ProductSpecies_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecies" ADD CONSTRAINT "ProductSpecies_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "PetSpecies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
