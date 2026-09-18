-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('CUSTOMER', 'BUSINESS', 'RIDER', 'ADMIN');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "audience" "NotificationAudience";

-- Backfill existing rows from their event name (best-effort — this app's own call sites are
-- fixed to always pass an explicit audience going forward, this only covers historical/seed data).
UPDATE "Notification" SET "audience" = 'BUSINESS' WHERE "event" IN ('order.new', 'booking.new', 'review.created');
UPDATE "Notification" SET "audience" = 'CUSTOMER' WHERE "audience" IS NULL;

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "audience" SET NOT NULL;

-- DropIndex
DROP INDEX "Notification_userId_read_idx";

-- DropIndex
DROP INDEX "Notification_userId_createdAt_idx";

-- CreateIndex
CREATE INDEX "Notification_userId_audience_read_idx" ON "Notification"("userId", "audience", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_audience_createdAt_idx" ON "Notification"("userId", "audience", "createdAt");
