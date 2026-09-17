-- CreateEnum
CREATE TYPE "PetFriendlyPlaceCategory" AS ENUM ('RESTAURANT', 'OUTDOOR_SPACE', 'OTHER');

-- CreateEnum
CREATE TYPE "PetFriendlyPlaceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "ReviewTargetType" ADD VALUE 'PET_FRIENDLY_PLACE';

-- All existing rows are fabricated seed data (never read by any API, per audit) — safe to
-- discard rather than backfill, since the shape is being redesigned wholesale below.
DELETE FROM "PetFriendlyPlace";

-- DropForeignKey
ALTER TABLE "PetFriendlyPlace" DROP CONSTRAINT "PetFriendlyPlace_categoryId_fkey";

-- DropIndex
DROP INDEX "PetFriendlyPlace_categoryId_idx";

-- AlterTable
ALTER TABLE "PetFriendlyPlace" DROP COLUMN "amenities",
DROP COLUMN "categoryId",
DROP COLUMN "openingHours",
DROP COLUMN "petRules",
DROP COLUMN "phone",
DROP COLUMN "photos",
DROP COLUMN "verified",
DROP COLUMN "website",
ADD COLUMN     "category" "PetFriendlyPlaceCategory" NOT NULL,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "PetFriendlyPlaceStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "submittedById" TEXT NOT NULL;

-- DropTable
DROP TABLE "PetFriendlyCategory";

-- CreateIndex
CREATE INDEX "PetFriendlyPlace_status_idx" ON "PetFriendlyPlace"("status");

-- CreateIndex
CREATE INDEX "PetFriendlyPlace_category_idx" ON "PetFriendlyPlace"("category");

-- AddForeignKey
ALTER TABLE "PetFriendlyPlace" ADD CONSTRAINT "PetFriendlyPlace_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetFriendlyPlace" ADD CONSTRAINT "PetFriendlyPlace_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

