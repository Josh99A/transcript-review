// Runs on every start. Clears all work (jobs, requests, pay, payments, notifications) once when
// RESET_WORK is set to a new value, keeping every account. The value is recorded so a restart never repeats it.
import { PrismaClient } from "@prisma/client";

const token = process.env.RESET_WORK?.trim();
if (!token) process.exit(0);

const db = new PrismaClient();
try {
  const done = await db.setting.findUnique({ where: { key: "reset-work" } });
  if (done?.value === token) process.exit(0);
  const counts = await db.$transaction(async (tx) => {
    const notifications = (await tx.notification.deleteMany()).count;
    const requests = (await tx.jobRequest.deleteMany()).count;
    const earnings = (await tx.earning.deleteMany()).count;
    const payouts = (await tx.payout.deleteMany()).count;
    const jobs = (await tx.job.deleteMany()).count;
    await tx.setting.upsert({ where: { key: "reset-work" }, update: { value: token }, create: { key: "reset-work", value: token } });
    return { jobs, requests, earnings, payouts, notifications };
  });
  console.log("Cleared work data, accounts kept:", JSON.stringify(counts));
} finally {
  await db.$disconnect();
}
