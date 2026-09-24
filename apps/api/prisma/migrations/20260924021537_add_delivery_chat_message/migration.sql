-- CreateEnum
CREATE TYPE "DeliveryChatSenderType" AS ENUM ('CUSTOMER', 'RIDER');

-- CreateTable
CREATE TABLE "DeliveryChatMessage" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "senderType" "DeliveryChatSenderType" NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryChatMessage_deliveryId_idx" ON "DeliveryChatMessage"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryChatMessage_deliveryId_createdAt_idx" ON "DeliveryChatMessage"("deliveryId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeliveryChatMessage" ADD CONSTRAINT "DeliveryChatMessage_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChatMessage" ADD CONSTRAINT "DeliveryChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

