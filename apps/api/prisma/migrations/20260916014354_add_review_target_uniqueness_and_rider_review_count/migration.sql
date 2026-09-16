-- AlterTable
ALTER TABLE "Rider" ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Review_authorId_targetType_targetId_orderId_key" ON "Review"("authorId", "targetType", "targetId", "orderId");

