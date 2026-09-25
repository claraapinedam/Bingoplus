-- AlterTable
ALTER TABLE "User" ADD COLUMN     "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "privacyNoticeAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

