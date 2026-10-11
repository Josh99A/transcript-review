-- DropIndex
DROP INDEX "ReferralBonus_transcriberId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ReferralBonus";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Earning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "referrerId" TEXT,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Earning_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Earning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Earning_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Credit existing earnings to the transcriber's current referrer.
INSERT INTO "new_Earning" ("amount", "createdAt", "id", "jobId", "seconds", "userId", "referrerId") SELECT e."amount", e."createdAt", e."id", e."jobId", e."seconds", e."userId", u."referredById" FROM "Earning" e LEFT JOIN "User" u ON u."id" = e."userId";
DROP TABLE "Earning";
ALTER TABLE "new_Earning" RENAME TO "Earning";
CREATE UNIQUE INDEX "Earning_jobId_userId_key" ON "Earning"("jobId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

