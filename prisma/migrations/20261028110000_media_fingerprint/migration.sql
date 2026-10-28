-- AlterTable
ALTER TABLE "Job" ADD COLUMN "mediaFingerprint" TEXT,
ADD COLUMN "uploadKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Job_uploadKey_key" ON "Job"("uploadKey");

-- CreateIndex
CREATE INDEX "Job_mediaFingerprint_idx" ON "Job"("mediaFingerprint");
