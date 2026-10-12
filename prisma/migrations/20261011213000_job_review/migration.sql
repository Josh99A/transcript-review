-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "revisions" INTEGER NOT NULL DEFAULT 0;
