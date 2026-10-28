/*
  Warnings:

  - You are about to drop the column `customerDependency` on the `Evaluation` table. All the data in the column will be lost.
  - You are about to drop the column `financialConsistency` on the `Evaluation` table. All the data in the column will be lost.
  - You are about to drop the column `legalContingencies` on the `Evaluation` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "EvaluationItemStatus" ADD VALUE 'HIGH_RISK';

-- AlterTable
ALTER TABLE "DataRoomFolder" ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Evaluation" DROP COLUMN "customerDependency",
DROP COLUMN "financialConsistency",
DROP COLUMN "legalContingencies";

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "teaserImageKey" TEXT;
