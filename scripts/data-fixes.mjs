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
  {
    // Jobs now go to the first transcriber who takes them, with no admin approval. Requests still waiting
    // when that changed are settled the same way: the earliest one gets the job and the rest are told.
    key: "fix:2026-10-28-first-come-requests",
    async run(tx) {
      const jobs = await tx.job.findMany({
        where: { status: "UNASSIGNED", requests: { some: { status: "PENDING" } } },
        include: { requests: { where: { status: "PENDING" }, include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: "asc" } } },
      });
      const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
      const done = [];
      for (const job of jobs) {
        const first = job.posted ? job.requests.find((r) => r.user.role === "USER") : undefined;
        const others = job.requests.filter((r) => r !== first);
        if (first) {
          await tx.job.update({
            where: { id: job.id },
            data: { assigneeId: first.userId, status: "ASSIGNED", assignedAt: new Date(), posted: false, reviewNote: null, reviewedAt: null, revisions: 0 },
          });
          await tx.jobRequest.update({ where: { id: first.id }, data: { status: "APPROVED" } });
          await tx.notification.createMany({
            data: [
              { userId: first.userId, title: `You got ${job.title}`, body: "You asked for it first. It's now in My jobs.", href: `/jobs/${job.id}`, jobId: job.id, kind: "assigned" },
              ...admins.map((a) => ({ userId: a.id, title: `${first.user.name} got ${job.title}`, body: "Their request was the earliest when jobs became first come, first served.", href: `/admin/jobs/${job.id}`, jobId: job.id })),
            ],
          });
        }
        if (others.length) {
          await tx.jobRequest.updateMany({ where: { id: { in: others.map((r) => r.id) } }, data: { status: "DECLINED" } });
          await tx.notification.createMany({
            data: others.map((r) => ({
              userId: r.userId,
              title: first ? `${job.title} went to someone else` : `Your request for ${job.title} was closed`,
              body: first ? "Someone asked for it before you. Check Find work for other jobs." : "Jobs on Find work are now first come, first served. Take one there.",
              href: "/board",
            })),
          });
        }
        done.push(`${job.title.slice(0, 20)} -> ${first ? first.user.name : "nobody"} (${others.length} closed)`);
      }
      return `settled ${jobs.length}: ` + done.join("; ");
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
