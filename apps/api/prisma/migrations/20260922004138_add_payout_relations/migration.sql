-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "payoutId" TEXT;

-- AlterTable
ALTER TABLE "RiderEarning" ADD COLUMN     "payoutId" TEXT;

-- CreateIndex
CREATE INDEX "Order_payoutId_idx" ON "Order"("payoutId");

-- CreateIndex
CREATE INDEX "Payout_payeeType_status_idx" ON "Payout"("payeeType", "status");

-- CreateIndex
CREATE INDEX "Payout_businessId_idx" ON "Payout"("businessId");

-- CreateIndex
CREATE INDEX "Payout_riderId_idx" ON "Payout"("riderId");

-- CreateIndex
CREATE INDEX "RiderEarning_payoutId_idx" ON "RiderEarning"("payoutId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderEarning" ADD CONSTRAINT "RiderEarning_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
