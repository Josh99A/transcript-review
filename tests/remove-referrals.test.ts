import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { balancesByUser, expectedByUser } from "../src/lib/earnings";
import { payProblems } from "../src/lib/payCheck";

// Explicit opt-in: creates and drops only its own isolated schema on a test database.
test("removing referrals preserves payments and reconciles transcription balances", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = `test_remove_referrals_${Date.now()}`;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.searchParams.set("schema", schema);
  const client = new PrismaClient({ datasourceUrl: url.toString() });
  const sql = (input: string) => execFileSync("node", ["node_modules/prisma/build/index.js", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"], {
    input, env: { ...process.env, DATABASE_URL: url.toString() }, stdio: ["pipe", "pipe", "pipe"],
  });
  const migration = "20261104150000_remove_referrals";
  try {
    await client.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    sql(readdirSync("prisma/migrations").filter((p) => p < migration && /^\d/.test(p)).sort()
      .map((p) => readFileSync(`prisma/migrations/${p}/migration.sql`, "utf8")).join("\n"));
    sql(`
      INSERT INTO "User" (id, name, email, "passwordHash", role, "payPhone") VALUES
        ('admin', 'Admin', 'admin@example.test', 'hash', 'ADMIN', NULL),
        ('ref', 'Former referrer', 'ref@example.test', 'hash', 'REFERRER', '+256 772 123 456'),
        ('mixed', 'Mixed earnings', 'mixed@example.test', 'hash', 'USER', NULL),
        ('worker', 'Worker', 'worker@example.test', 'hash', 'USER', NULL),
        ('unpaid', 'Unpaid referrer', 'unpaid@example.test', 'hash', 'REFERRER', NULL);
      UPDATE "User" SET "referredById" = 'mixed' WHERE id = 'worker';
      UPDATE "User" SET "referredById" = 'ref' WHERE id = 'mixed';
      INSERT INTO "Job" (id, title, "mediaPath", "mediaType", "durationSeconds", "originalTranscript", "editedTranscript", status, "assigneeId", "approvedAt", "updatedAt", "fixedPay") VALUES
        ('usual', 'Usual', 'unused', 'audio', 3600, '', '', 'SUBMITTED', 'worker', NOW(), NOW(), NULL),
        ('custom', 'Custom', 'unused', 'audio', 1200, '', '', 'SUBMITTED', 'worker', NOW(), NOW(), 12001),
        ('old', 'Earlier rate', 'unused', 'audio', 1800, '', '', 'SUBMITTED', 'mixed', NOW(), NOW(), NULL),
        ('pending', 'Pending', 'unused', 'audio', 1800, '', '', 'SUBMITTED', 'worker', NULL, NOW(), NULL),
        ('progress', 'In progress', 'unused', 'audio', 3600, '', '', 'ASSIGNED', 'worker', NULL, NOW(), NULL);
      INSERT INTO "Earning" (id, "jobId", "userId", amount, seconds, "customRate", "lockedRate", "referrerId") VALUES
        ('usual-e', 'usual', 'worker', 30000, 3600, false, 30000, 'mixed'),
        ('custom-e', 'custom', 'worker', 12001, 1200, true, NULL, 'mixed'),
        ('old-e', 'old', 'mixed', 10000, 1800, false, 20000, 'ref'),
        ('pending-e', 'pending', 'worker', 15000, 1800, false, NULL, 'unpaid');
      INSERT INTO "Payout" (id, "userId", amount, note) VALUES
        ('p-ref', 'ref', 3000, 'Actual transfer'),
        ('p-mixed', 'mixed', 20000, 'Actual transfer'),
        ('p-worker', 'worker', 5000, 'Actual transfer');
      INSERT INTO "Notification" (id, "userId", title, href) VALUES
        ('ref-notice', 'mixed', 'You earned UGX 10,000 in referral pay', '/earnings'),
        ('payment-notice', 'mixed', 'You were paid UGX 20,000', '/earnings');
    `);
    const paymentsBefore = await client.payout.findMany({ orderBy: { id: "asc" } });
    const creditsBefore = await client.earning.findMany({ orderBy: { id: "asc" } });
    sql(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    assert.deepEqual(await client.payout.findMany({ orderBy: { id: "asc" } }), paymentsBefore);
    assert.deepEqual(await client.earning.findMany({ orderBy: { id: "asc" } }), creditsBefore);
    assert.equal((await client.user.findUniqueOrThrow({ where: { id: "ref" } })).role, "USER");
    assert.equal((await client.user.findUniqueOrThrow({ where: { id: "ref" } })).payPhone, "+256 772 123 456");
    assert.equal((await client.user.findUniqueOrThrow({ where: { id: "admin" } })).role, "ADMIN");
    assert.equal(await client.notification.count({ where: { id: "ref-notice" } }), 0);
    assert.equal(await client.notification.count({ where: { id: "payment-notice" } }), 1);
    const audit = JSON.parse((await client.setting.findUniqueOrThrow({ where: { key: "audit:2026-11-04-remove-referrals" } })).value);
    assert.equal(audit.attribution.length, 4);
    const mixedAudit = audit.balances.find((b: { userId: string }) => b.userId === "mixed");
    assert.equal(mixedAudit.removedReferralEarned, 16001);
    assert.equal(mixedAudit.previousBalance, 6001);
    assert.equal(mixedAudit.overpaid, 10000);
    const balances = await balancesByUser(client);
    assert.equal(balances.get("ref")!.earned, 0);
    assert.equal(balances.get("ref")!.owed, 0);
    assert.equal(balances.get("ref")!.overpaid, 3000);
    assert.equal(balances.get("mixed")!.earned, 10000);
    assert.equal(balances.get("mixed")!.owed, 0);
    assert.equal(balances.get("mixed")!.overpaid, 10000);
    assert.equal(balances.get("worker")!.earned, 42001);
    assert.equal(balances.get("worker")!.owed, 37001);
    assert.equal(balances.get("worker")!.awaiting, 15000);
    assert.equal(balances.get("unpaid")?.earned ?? 0, 0);
    for (const row of audit.balances) {
      assert.equal(row.amountOwed, balances.get(row.userId)?.owed ?? 0);
      assert.equal(row.overpaid, balances.get(row.userId)?.overpaid ?? 0);
    }
    const expected = await expectedByUser(client);
    assert.equal(expected.get("worker")!.total, 30000);
    assert.equal(expected.has("mixed"), false);
    assert.deepEqual(await payProblems(client), []);
    // New approved work consumes the overpayment before any more money is due.
    await client.job.update({ where: { id: "progress" }, data: { assigneeId: "mixed", status: "SUBMITTED", approvedAt: new Date() } });
    await client.earning.create({ data: { jobId: "progress", userId: "mixed", amount: 30000, seconds: 3600, lockedRate: 30000 } });
    const afterWork = (await balancesByUser(client)).get("mixed")!;
    assert.equal(afterWork.earned, 40000);
    assert.equal(afterWork.paid, 20000);
    assert.equal(afterWork.overpaid, 0);
    assert.equal(afterWork.owed, 20000);
    // Usual pay still rounds cumulative time rather than adding per-job roundings.
    for (const id of ["round-a", "round-b"]) {
      await client.job.create({ data: { id, title: id, mediaPath: "unused", mediaType: "audio", durationSeconds: 1, originalTranscript: "", editedTranscript: "", status: "SUBMITTED", assigneeId: "worker", approvedAt: new Date() } });
      await client.earning.create({ data: { jobId: id, userId: "worker", amount: 8, seconds: 1, lockedRate: 30000 } });
    }
    assert.equal((await balancesByUser(client)).get("worker")!.earned, 42018);
    const columns = await client.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND column_name IN ('referrerId', 'referredById')`;
    assert.deepEqual(columns, []);
    const roles = await client.$queryRaw<{ enumlabel: string }[]>`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = ${schema} AND t.typname = 'Role' ORDER BY e.enumsortorder`;
    assert.deepEqual(roles.map((r) => r.enumlabel), ["ADMIN", "USER"]);
  } finally {
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.$disconnect();
  }
});
