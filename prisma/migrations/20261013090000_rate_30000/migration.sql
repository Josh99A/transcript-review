-- The usual rate goes from UGX 20,000 to 30,000 per hour. Approved credits keep the rate they were approved at;
-- usual-rate credits not yet approved are re-priced at the new rate.
ALTER TABLE "Earning" ADD COLUMN "lockedRate" INTEGER;

UPDATE "Earning" e SET "lockedRate" = 20000
FROM "Job" j
WHERE e."jobId" = j."id" AND e."customRate" = false AND j."status" = 'SUBMITTED' AND j."approvedAt" IS NOT NULL;

UPDATE "Earning" SET "amount" = ROUND("seconds" * 30000 / 3600.0)
WHERE "customRate" = false AND "lockedRate" IS NULL;
