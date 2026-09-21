-- CreateEnum
CREATE TYPE "ContractTemplateType" AS ENUM ('BUSINESS', 'RIDER');

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "type" "ContractTemplateType" NOT NULL,
    "content" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractTemplate_type_createdAt_idx" ON "ContractTemplate"("type", "createdAt");
