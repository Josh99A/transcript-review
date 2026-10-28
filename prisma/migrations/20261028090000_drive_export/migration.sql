ALTER TABLE "Job" ADD COLUMN "driveFolderId" TEXT,
ADD COLUMN "driveMediaId" TEXT,
ADD COLUMN "driveTranscriptId" TEXT,
ADD COLUMN "driveExportedAt" TIMESTAMP(3),
ADD COLUMN "driveExportError" TEXT;
