-- Null any decidedById that does not reference a real user before adding the FK.
UPDATE "VerificationCase" SET "decidedById" = NULL WHERE "decidedById" IS NOT NULL AND "decidedById" NOT IN (SELECT "id" FROM "User");

-- CreateEnum
CREATE TYPE "ReviewSubject" AS ENUM ('USER', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "ReviewDecisionKind" AS ENUM ('APPROVE', 'REQUEST_CORRECTIONS', 'REJECT', 'BLOCK', 'UNBLOCK', 'SUSPEND', 'REINSTATE');

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "subjectType" "ReviewSubject" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" "ReviewDecisionKind" NOT NULL,
    "text" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewDecision_subjectType_subjectId_createdAt_idx" ON "ReviewDecision"("subjectType", "subjectId", "createdAt");

-- AddForeignKey
ALTER TABLE "VerificationCase" ADD CONSTRAINT "VerificationCase_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
