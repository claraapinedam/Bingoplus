-- AlterTable
ALTER TABLE "SupportChatMessage" ADD COLUMN     "imageUrl" TEXT,
ALTER COLUMN "text" DROP NOT NULL;
