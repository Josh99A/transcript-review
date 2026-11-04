BEGIN;

-- Serialize with payment recording and prevent work changing during the audit snapshot.
SELECT pg_advisory_xact_lock(4242);
LOCK TABLE "User", "Job", "Earning", "Payout", "Notification" IN ACCESS EXCLUSIVE MODE;

-- Keep the removed attribution and before/after balances for financial audit. Payments are
-- actual money already sent: never delete, reduce, or fabricate a payout to balance the books.
WITH approved AS (
  SELECT e.* FROM "Earning" e JOIN "Job" j ON j.id = e."jobId"
  WHERE j.status = 'SUBMITTED' AND j."approvedAt" IS NOT NULL
), usual AS (
  SELECT "userId", COALESCE("lockedRate", 30000) AS rate, SUM(seconds) AS seconds
  FROM approved WHERE NOT "customRate" GROUP BY "userId", COALESCE("lockedRate", 30000)
), own AS (
  SELECT "userId", SUM(amount) AS earned FROM (
    SELECT "userId", ROUND(seconds * rate / 3600.0) AS amount FROM usual
    UNION ALL SELECT "userId", amount FROM approved WHERE "customRate"
  ) amounts GROUP BY "userId"
), refs AS (
  SELECT "referrerId", ROUND(COALESCE(SUM(seconds) FILTER (WHERE NOT "customRate"), 0) * 10000 / 3600.0)
    + ROUND(COALESCE(SUM(amount) FILTER (WHERE "customRate"), 0) / 2.0) AS earned
  FROM approved WHERE "referrerId" IS NOT NULL GROUP BY "referrerId"
), paid AS (
  SELECT "userId", SUM(amount) AS amount FROM "Payout" GROUP BY "userId"
), balances AS (
  SELECT u.id AS "userId", u.role AS "previousRole", u."referredById" AS "previousReferrerId",
    COALESCE(o.earned, 0) AS "transcriptionEarned", COALESCE(r.earned, 0) AS "removedReferralEarned",
    COALESCE(p.amount, 0) AS paid,
    COALESCE(o.earned, 0) + COALESCE(r.earned, 0) - COALESCE(p.amount, 0) AS "previousBalance",
    GREATEST(0, COALESCE(o.earned, 0) - COALESCE(p.amount, 0)) AS "amountOwed",
    GREATEST(0, COALESCE(p.amount, 0) - COALESCE(o.earned, 0)) AS overpaid
  FROM "User" u LEFT JOIN own o ON o."userId" = u.id
    LEFT JOIN refs r ON r."referrerId" = u.id LEFT JOIN paid p ON p."userId" = u.id
)
INSERT INTO "Setting" (key, value, "updatedAt")
SELECT 'audit:2026-11-04-remove-referrals', jsonb_build_object(
  'createdAt', CURRENT_TIMESTAMP,
  'balances', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b."userId") FROM balances b), '[]'::jsonb),
  'attribution', COALESCE((SELECT jsonb_agg(jsonb_build_object('earningId', id, 'referrerId', "referrerId") ORDER BY id)
    FROM "Earning" WHERE "referrerId" IS NOT NULL), '[]'::jsonb)
)::text, CURRENT_TIMESTAMP;

-- Remove obsolete referral notices, retaining actual payment notices and payment history.
DELETE FROM "Notification" WHERE href = '/referrals' OR href LIKE '/referrals#%'
  OR title LIKE 'You earned % in referral pay';

ALTER TABLE "User" DROP CONSTRAINT "User_referredById_fkey";
ALTER TABLE "Earning" DROP CONSTRAINT "Earning_referrerId_fkey";
ALTER TABLE "User" DROP COLUMN "referredById";
ALTER TABLE "Earning" DROP COLUMN "referrerId";

-- Former referrers retain their accounts and payment details and have the same access as all users.
ALTER TABLE "User" ALTER COLUMN role DROP DEFAULT;
ALTER TYPE "Role" RENAME TO "Role_with_referrals";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');
ALTER TABLE "User" ALTER COLUMN role TYPE "Role"
  USING (CASE WHEN role::text = 'REFERRER' THEN 'USER' ELSE role::text END)::"Role";
ALTER TABLE "User" ALTER COLUMN role SET DEFAULT 'USER';
DROP TYPE "Role_with_referrals";

COMMIT;
