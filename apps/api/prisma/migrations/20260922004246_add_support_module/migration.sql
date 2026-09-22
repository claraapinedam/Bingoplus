-- CreateEnum
CREATE TYPE "SupportSubmitterType" AS ENUM ('CUSTOMER', 'BUSINESS', 'RIDER');

-- CreateEnum
CREATE TYPE "SupportCaseStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportChatRelatedType" AS ENUM ('ORDER', 'DELIVERY', 'BOOKING');

-- CreateEnum
CREATE TYPE "SupportChatStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportChatSenderType" AS ENUM ('CUSTOMER', 'BUSINESS', 'RIDER', 'ADMIN');

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "submitterType" "SupportSubmitterType" NOT NULL,
    "submitterUserId" TEXT NOT NULL,
    "businessId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "status" "SupportCaseStatus" NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCaseResponse" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCaseResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportChat" (
    "id" TEXT NOT NULL,
    "submitterType" "SupportSubmitterType" NOT NULL,
    "submitterUserId" TEXT NOT NULL,
    "businessId" TEXT,
    "relatedType" "SupportChatRelatedType" NOT NULL,
    "relatedId" TEXT NOT NULL,
    "status" "SupportChatStatus" NOT NULL DEFAULT 'OPEN',
    "assignedAdminId" TEXT,
    "ratingScore" INTEGER,
    "ratingComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "SupportChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderType" "SupportChatSenderType" NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "SupportChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportCase_code_key" ON "SupportCase"("code");

-- CreateIndex
CREATE INDEX "SupportCase_submitterUserId_idx" ON "SupportCase"("submitterUserId");

-- CreateIndex
CREATE INDEX "SupportCase_businessId_idx" ON "SupportCase"("businessId");

-- CreateIndex
CREATE INDEX "SupportCase_status_idx" ON "SupportCase"("status");

-- CreateIndex
CREATE INDEX "SupportCaseResponse_caseId_idx" ON "SupportCaseResponse"("caseId");

-- CreateIndex
CREATE INDEX "SupportChat_submitterUserId_idx" ON "SupportChat"("submitterUserId");

-- CreateIndex
CREATE INDEX "SupportChat_businessId_idx" ON "SupportChat"("businessId");

-- CreateIndex
CREATE INDEX "SupportChat_status_idx" ON "SupportChat"("status");

-- CreateIndex
CREATE INDEX "SupportChat_relatedType_relatedId_idx" ON "SupportChat"("relatedType", "relatedId");

-- CreateIndex
CREATE INDEX "SupportChatMessage_chatId_idx" ON "SupportChatMessage"("chatId");

-- CreateIndex
CREATE INDEX "SupportChatMessage_chatId_createdAt_idx" ON "SupportChatMessage"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_submitterUserId_fkey" FOREIGN KEY ("submitterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCaseResponse" ADD CONSTRAINT "SupportCaseResponse_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCaseResponse" ADD CONSTRAINT "SupportCaseResponse_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChat" ADD CONSTRAINT "SupportChat_submitterUserId_fkey" FOREIGN KEY ("submitterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChat" ADD CONSTRAINT "SupportChat_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChat" ADD CONSTRAINT "SupportChat_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChatMessage" ADD CONSTRAINT "SupportChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "SupportChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChatMessage" ADD CONSTRAINT "SupportChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
