-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('APP', 'MANUAL');

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_userId_fkey";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "source" "BookingSource" NOT NULL DEFAULT 'APP',
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Booking_serviceId_startTime_endTime_idx" ON "Booking"("serviceId", "startTime", "endTime");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
