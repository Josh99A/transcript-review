import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { creditAmount } from "./pay";

export type PayProblem = { userId: string; userName: string; jobId: string; jobTitle: string; problem: string };

/**
 * Pay that doesn't line up with its job. A job's pay must belong to the person on the job and only
 * exist once they've submitted it (it stays while an admin has sent it back), with the amount set by
 * the job's length and rate. Anything else is listed so it can be fixed before anyone is paid for it.
 */
export async function payProblems(client: Prisma.TransactionClient = db): Promise<PayProblem[]> {
  const earnings = await client.earning.findMany({ include: { user: { select: { name: true } }, job: true } });
  const problems: PayProblem[] = [];
  for (const e of earnings) {
    const j = e.job;
    const add = (problem: string) => problems.push({ userId: e.userId, userName: e.user.name, jobId: j.id, jobTitle: j.title, problem });
    if (j.assigneeId !== e.userId) add("Pay is credited to someone who is no longer on this job.");
    else if (j.status !== "SUBMITTED" && !(j.status === "ASSIGNED" && j.reviewNote)) add("Pay is credited but the job hasn't been submitted.");
    if (e.seconds !== j.durationSeconds || e.customRate !== (j.ratePerHour != null) || e.amount !== creditAmount(j.durationSeconds, j.ratePerHour, e.lockedRate)) {
      add("The credited amount doesn't match the job's length and rate.");
    }
  }
  return problems;
}
