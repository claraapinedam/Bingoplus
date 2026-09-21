-- CreateTable
CREATE TABLE "BusinessCategoryLink" (
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "BusinessCategoryLink_pkey" PRIMARY KEY ("businessId","categoryId")
);

-- CreateIndex
CREATE INDEX "BusinessCategoryLink_categoryId_idx" ON "BusinessCategoryLink"("categoryId");

-- AddForeignKey
ALTER TABLE "BusinessCategoryLink" ADD CONSTRAINT "BusinessCategoryLink_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCategoryLink" ADD CONSTRAINT "BusinessCategoryLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BusinessCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every business's existing single categoryId becomes its first row in the new
-- many-to-many join table, before the old column is dropped below — no business loses its
-- category assignment in this migration.
INSERT INTO "BusinessCategoryLink" ("businessId", "categoryId")
SELECT "id", "categoryId" FROM "Business";

-- DropForeignKey
ALTER TABLE "Business" DROP CONSTRAINT "Business_categoryId_fkey";

-- DropIndex
DROP INDEX "Business_categoryId_idx";

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "categoryId";
