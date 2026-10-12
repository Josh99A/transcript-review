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
