-- Jobs uploaded before the job board existed were never posted. Put unassigned ones on the board,
-- matching the new upload default. Admins can take any of them off from the job page.
UPDATE "Job" SET "posted" = true WHERE "status" = 'UNASSIGNED' AND "assigneeId" IS NULL;
