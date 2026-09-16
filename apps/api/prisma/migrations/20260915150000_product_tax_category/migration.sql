-- CreateEnum
CREATE TYPE "ProductTaxCategory" AS ENUM ('STANDARD', 'ZERO');

-- AlterTable: per-product IVA classification
ALTER TABLE "Product" ADD COLUMN "taxCategory" "ProductTaxCategory" NOT NULL DEFAULT 'STANDARD';

-- AlterTable: snapshot of the category + actual tax charged, at purchase time
ALTER TABLE "OrderItem" ADD COLUMN "taxCategory" "ProductTaxCategory" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "OrderItem" ADD COLUMN "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable: order-level split between the general-rate and zero-rate subtotals (subtotalIva / subtotalIva0)
ALTER TABLE "Order" ADD COLUMN "taxableSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "zeroTaxSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
