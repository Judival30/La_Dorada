-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "VerificationCase" ADD COLUMN     "buyerType" "BuyerType",
ADD COLUMN     "correctionNotes" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "isLegalRepresentative" BOOLEAN,
ADD COLUMN     "profile" JSONB,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

