-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "billableDays" INTEGER;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "operatingDays" TEXT[] DEFAULT ARRAY[]::TEXT[];
