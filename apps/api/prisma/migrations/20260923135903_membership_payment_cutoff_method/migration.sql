-- CreateEnum
CREATE TYPE "MembershipPaymentMethod" AS ENUM ('DEPOSIT', 'TRANSFER', 'CARD');

-- AlterTable
ALTER TABLE "MembershipPayment" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "method" "MembershipPaymentMethod",
ALTER COLUMN "receiptUrl" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "MembershipPayment_dueDate_idx" ON "MembershipPayment"("dueDate");
