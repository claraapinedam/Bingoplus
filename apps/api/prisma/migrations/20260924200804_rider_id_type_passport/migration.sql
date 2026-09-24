-- CreateEnum
CREATE TYPE "RiderIdType" AS ENUM ('RUC', 'CEDULA', 'PASAPORTE');

-- AlterTable: cast existing values across (RUC/CEDULA exist identically in both enums) instead of
-- drop+recreate, which would either null out every rider's idType (nullable column) or fail
-- outright on RiderContract (NOT NULL, no default, existing rows).
ALTER TABLE "Rider" ALTER COLUMN "idType" TYPE "RiderIdType" USING ("idType"::text::"RiderIdType");

ALTER TABLE "RiderContract" ALTER COLUMN "idType" TYPE "RiderIdType" USING ("idType"::text::"RiderIdType");
