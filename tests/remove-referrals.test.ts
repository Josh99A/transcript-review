import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { balancesByUser, expectedByUser } from "../src/lib/earnings";
import { payProblems } from "../src/lib/payCheck";
import { historyDownloadResponse, personalHistoryCsv, personalHistoryFor } from "../src/lib/personalHistory";
import { SignJWT } from "jose";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";

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
    const history = await personalHistoryFor("mixed", client);
    assert.equal(history.account.id, "mixed");
    assert.equal(history.summary.overpaid, 10000);
    assert.equal(history.reconciliation!.removedReferralEarnings, 16001);
    assert.equal(history.reconciliation!.balanceBeforeAdjustment, 6001);
    assert.equal(history.earnings.length, 1);
    assert.equal(history.payments.length, 1);
    assert.equal(history.payments[0].id, "p-mixed");
    const serialized = JSON.stringify(history);
    for (const forbidden of ["passwordHash", "referrerId", "previousReferrerId", "worker@example.test", "ref@example.test", "p-worker", "usual-e"]) assert.equal(serialized.includes(forbidden), false, forbidden);
    const emptyHistory = await personalHistoryFor("unpaid", client);
    assert.equal(emptyHistory.earnings.length, 0);
    assert.equal(emptyHistory.payments.length, 0);
    assert.equal(emptyHistory.summary.owed, 0);
    const unsafeText = structuredClone(history);
    unsafeText.earnings[0].job.title = '  =HYPERLINK("bad")';
    unsafeText.payments[0].note = '@SUM(1,2)\nquoted "note"';
    const csv = personalHistoryCsv(unsafeText);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes('\'  =HYPERLINK(""bad"")'));
    assert.ok(csv.includes('\'@SUM(1,2)'));
    const response = historyDownloadResponse(history, "json");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.match(response.headers.get("Content-Disposition")!, /^attachment;/);
    assert.deepEqual((await response.json()).summary, history.summary);
    if (process.env.TEST_HISTORY_HTTP === "1") await checkHistoryHttp(url.toString());
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
    await client.setting.delete({ where: { key: "audit:2026-11-04-remove-referrals" } });
    assert.equal((await personalHistoryFor("mixed", client)).reconciliation, null);
    const columns = await client.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND column_name IN ('referrerId', 'referredById')`;
    assert.deepEqual(columns, []);
    const roles = await client.$queryRaw<{ enumlabel: string }[]>`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = ${schema} AND t.typname = 'Role' ORDER BY e.enumsortorder`;
    assert.deepEqual(roles.map((r) => r.enumlabel), ["ADMIN", "USER"]);
  } finally {
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.$disconnect();
  }
});


async function checkHistoryHttp(databaseUrl: string) {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  const secret = randomUUID();
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, DATABASE_URL: databaseUrl, SESSION_SECRET: secret }, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", (chunk) => { logs += String(chunk); });
  server.stderr.on("data", (chunk) => { logs += String(chunk); });
  const origin = `http://127.0.0.1:${port}`;
  const cookie = async (id: string) => `session=${await new SignJWT({ sub: id }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(new TextEncoder().encode(secret))}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${origin}/api/account/history`)).status === 401) { ready = true; break; } } catch { /* Server still starting. */ }
      if (server.exitCode != null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Next.js did not start: ${logs}`);
    const userCookie = await cookie("mixed");
    const adminCookie = await cookie("admin");
    const get = (path: string, session?: string) => fetch(`${origin}${path}`, { headers: session ? { cookie: session } : {}, redirect: "manual" });
    assert.equal((await get("/api/admin/users/worker/history")).status, 401);
    assert.equal((await get("/api/admin/users/worker/history", userCookie)).status, 403);
    const own = await get("/api/account/history?userId=worker", userCookie);
    assert.equal(own.status, 200);
    assert.equal((await own.json()).account.id, "mixed");
    const other = await get("/api/admin/users/worker/history", adminCookie);
    assert.equal(other.status, 200);
    assert.equal((await other.json()).account.id, "worker");
    assert.equal((await get("/api/admin/users/missing/history", adminCookie)).status, 404);
    assert.equal((await get("/api/account/history?format=pdf", userCookie)).status, 400);
    const csv = await get("/api/account/history?format=csv", userCookie);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("Content-Type")!, /text\/csv/);
    assert.equal(csv.headers.get("Cache-Control"), "private, no-store");
    const earnings = await get("/earnings", userCookie);
    assert.equal(earnings.status, 200);
    assert.match(await earnings.text(), /Download your history/);
    const adminPage = await get("/admin/users/mixed/history", adminCookie);
    assert.equal(adminPage.status, 200);
    const html = await adminPage.text();
    assert.match(html, /Reconciliation history/);
    assert.match(html, /Earnings and payment ledger/);
    assert.doesNotMatch(logs, /Error:/);
  } finally {
    server.kill("SIGTERM");
    await new Promise<void>((resolve) => { if (server.exitCode != null) resolve(); else server.once("exit", () => resolve()); });
  }
}
