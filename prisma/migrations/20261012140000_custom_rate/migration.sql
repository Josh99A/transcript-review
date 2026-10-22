-- Special jobs are paid at their own hourly rate rather than a fixed total.
ALTER TABLE "Job" ADD COLUMN "ratePerHour" INTEGER;
UPDATE "Job" SET "ratePerHour" = GREATEST(1, ROUND("fixedPay" * 3600.0 / NULLIF("durationSeconds", 0)))::INTEGER WHERE "fixedPay" IS NOT NULL AND "durationSeconds" > 0;
ALTER TABLE "Job" DROP COLUMN "fixedPay";
ALTER TABLE "Earning" RENAME COLUMN "fixed" TO "customRate";
