ALTER TABLE "Notification" ADD COLUMN "jobId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "kind" TEXT;
CREATE INDEX "Notification_jobId_idx" ON "Notification"("jobId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Link existing notifications to their job and event, from their link and title.
UPDATE "Notification" n SET "jobId" = m[1]
FROM (SELECT id, regexp_match(href, '^/(?:admin/)?jobs/([^/#?]+)') AS m FROM "Notification") x
WHERE x.id = n.id AND x.m IS NOT NULL AND EXISTS (SELECT 1 FROM "Job" j WHERE j.id = x.m[1]);
UPDATE "Notification" SET "kind" = CASE
  WHEN title ~ ' (re)?submitted ' THEN 'submitted'
  WHEN title ~ ' unsubmitted ' THEN 'unsubmitted'
  WHEN title LIKE 'Approved: %' THEN 'approved'
  WHEN title LIKE 'Changes needed: %' THEN 'sent-back'
  WHEN title LIKE 'New job assigned: %' OR title LIKE 'Your request was approved: %' THEN 'assigned'
  ELSE NULL END
WHERE "jobId" IS NOT NULL;
-- Request notices link to the Requests page; match them to the job by its title.
UPDATE "Notification" n SET "jobId" = j.id, "kind" = 'requested'
FROM "Job" j
WHERE n.href = '/admin/requests' AND n."jobId" IS NULL AND n.title LIKE '% requested ' || j.title;
-- Unread notices that events have already overtaken are marked read, as new ones will be from now on.
UPDATE "Notification" n SET "readAt" = now()
FROM "Job" j
WHERE n."jobId" = j.id AND n."readAt" IS NULL AND (
  (n.kind = 'submitted' AND NOT (j.status = 'SUBMITTED' AND j."approvedAt" IS NULL)) OR
  (n.kind = 'approved' AND NOT (j.status = 'SUBMITTED' AND j."approvedAt" IS NOT NULL)) OR
  (n.kind = 'sent-back' AND NOT (j.status = 'ASSIGNED' AND j."reviewNote" IS NOT NULL AND j."assigneeId" = n."userId")) OR
  (n.kind = 'assigned' AND j."assigneeId" IS DISTINCT FROM n."userId") OR
  (n.kind = 'requested' AND j.status <> 'UNASSIGNED')
);
