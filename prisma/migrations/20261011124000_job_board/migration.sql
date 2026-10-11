-- CreateTable
CREATE TABLE "JobRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (plain column adds keep existing jobs untouched)
ALTER TABLE "Job" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Job" ADD COLUMN "language" TEXT;
ALTER TABLE "Job" ADD COLUMN "deadline" DATETIME;
ALTER TABLE "Job" ADD COLUMN "posted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "JobRequest_jobId_userId_key" ON "JobRequest"("jobId", "userId");

