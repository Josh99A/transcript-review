// Runs on every start. Applies one-off data corrections the admins approved, each exactly once
// (recorded in Setting), and only while the data is still in the state the fix was written for.
import { PrismaClient } from "@prisma/client";

const FIXES = [
  {
    // Unsubmitted before unsubmitting took back the pay, so its credit stayed in Earned.
    key: "fix:2026-10-12-deo-u002-credit",
    async run(tx) {
      const job = await tx.job.findUnique({ where: { id: "cmv5bf21l0003gr405hjnxti3" } });
      if (!job || job.status !== "ASSIGNED" || job.submittedAt || job.assigneeId !== "cmv4wowap0004lt3mg2bvuuer") return "skipped: job no longer in progress";
      const { count } = await tx.earning.deleteMany({ where: { jobId: job.id, userId: job.assigneeId } });
      return `removed ${count} credit`;
    },
  },
  {
    // The usual rate rose to 30,000 per hour and the admins asked for already-approved jobs to be paid at it too.
    // No payments had been recorded. The old amounts are kept in the result for the record.
    key: "fix:2026-10-13-approved-at-30000",
    async run(tx) {
      const old = await tx.earning.findMany({ where: { customRate: false, lockedRate: 20000 }, include: { job: { select: { title: true } } } });
      for (const e of old) await tx.earning.update({ where: { id: e.id }, data: { lockedRate: 30000, amount: Math.round((e.seconds * 30000) / 3600) } });
      return `re-priced ${old.length}: ` + old.map((e) => `${e.job.title.slice(0, 20)} was ${e.amount}`).join("; ");
    },
  },
];

const db = new PrismaClient();
try {
  for (const fix of FIXES) {
    if (await db.setting.findUnique({ where: { key: fix.key } })) continue;
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242)`;
      const r = await fix.run(tx);
      await tx.setting.create({ data: { key: fix.key, value: r } });
      return r;
    });
    console.log(`Data fix ${fix.key}: ${result}`);
  }
} finally {
  await db.$disconnect();
}
