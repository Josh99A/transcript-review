import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { earningsFor, referralPayFor } from "./pay";

export type Balance = {
  /** Media time credited from submitted transcripts. */
  seconds: number;
  /** Pay for that time, computed on the cumulative total (not summed per-job roundings). */
  transcriptPay: number;
  /** Media time submitted by people this user referred. */
  referralSeconds: number;
  referralPay: number;
  earned: number;
  paid: number;
  owed: number;
};

const empty = (): Balance => ({ seconds: 0, transcriptPay: 0, referralSeconds: 0, referralPay: 0, earned: 0, paid: 0, owed: 0 });

/** Earned, paid and owed totals for every user, keyed by user id. */
export async function balancesByUser(client: Prisma.TransactionClient = db): Promise<Map<string, Balance>> {
  const [earned, referred, paid] = await Promise.all([
    client.earning.groupBy({ by: ["userId", "customRate"], _sum: { seconds: true, amount: true } }),
    client.earning.groupBy({ by: ["referrerId", "customRate"], where: { referrerId: { not: null } }, _sum: { seconds: true, amount: true } }),
    client.payout.groupBy({ by: ["userId"], _sum: { amount: true } }),
  ]);
  const map = new Map<string, Balance>();
  const get = (id: string) => map.get(id) ?? map.set(id, empty()).get(id)!;
  // Usual-rate pay is worked out on the total of that time; jobs with their own rate add their pay as is.
  const hourlySeconds = new Map<string, number>();
  const customPay = new Map<string, number>();
  for (const e of earned) {
    const b = get(e.userId);
    b.seconds += e._sum.seconds ?? 0;
    if (e.customRate) customPay.set(e.userId, (customPay.get(e.userId) ?? 0) + (e._sum.amount ?? 0));
    else hourlySeconds.set(e.userId, (hourlySeconds.get(e.userId) ?? 0) + (e._sum.seconds ?? 0));
  }
  for (const [id, b] of map) b.transcriptPay = earningsFor(hourlySeconds.get(id) ?? 0) + (customPay.get(id) ?? 0);
  const referredUsual = new Map<string, number>();
  const referredCustom = new Map<string, number>();
  for (const r of referred) {
    const id = r.referrerId!;
    get(id).referralSeconds += r._sum.seconds ?? 0;
    if (r.customRate) referredCustom.set(id, (referredCustom.get(id) ?? 0) + (r._sum.amount ?? 0));
    else referredUsual.set(id, (referredUsual.get(id) ?? 0) + (r._sum.seconds ?? 0));
  }
  for (const id of new Set([...referredUsual.keys(), ...referredCustom.keys()])) get(id).referralPay = referralPayFor(referredUsual.get(id) ?? 0, referredCustom.get(id) ?? 0);
  for (const p of paid) get(p.userId).paid = p._sum.amount ?? 0;
  for (const b of map.values()) {
    b.earned = b.transcriptPay + b.referralPay;
    b.owed = b.earned - b.paid;
  }
  return map;
}

export async function balanceFor(userId: string): Promise<Balance> {
  return (await balancesByUser()).get(userId) ?? empty();
}

export type Expected = {
  /** Jobs held that haven't been credited yet (assigned, not yet submitted). */
  jobs: number;
  seconds: number;
  /** Pay those jobs will bring once submitted. */
  transcriptPay: number;
  /** Referral share of jobs the people this user referred are holding. */
  referralPay: number;
  total: number;
};

/**
 * Pay still to come from jobs people are working on. Only work not yet credited counts, so this never
 * overlaps Earned: a job adds to Earned when it is submitted, and stays there if it is sent back.
 */
export async function expectedByUser(client: Prisma.TransactionClient = db): Promise<Map<string, Expected>> {
  const jobs = await client.job.findMany({
    where: { status: "ASSIGNED", assigneeId: { not: null }, earnings: { none: {} } },
    select: { assigneeId: true, durationSeconds: true, ratePerHour: true, assignee: { select: { referredById: true } } },
  });
  const map = new Map<string, Expected>();
  const get = (id: string) => map.get(id) ?? map.set(id, { jobs: 0, seconds: 0, transcriptPay: 0, referralPay: 0, total: 0 }).get(id)!;
  const usual = new Map<string, number>();
  const custom = new Map<string, number>();
  const refUsual = new Map<string, number>();
  const refCustom = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) ?? 0) + n);
  for (const j of jobs) {
    const id = j.assigneeId!;
    const e = get(id);
    e.jobs += 1;
    e.seconds += j.durationSeconds;
    const ref = j.assignee?.referredById;
    if (j.ratePerHour != null) {
      const pay = earningsFor(j.durationSeconds, j.ratePerHour);
      add(custom, id, pay);
      if (ref) add(refCustom, ref, pay);
    } else {
      add(usual, id, j.durationSeconds);
      if (ref) add(refUsual, ref, j.durationSeconds);
    }
  }
  for (const [id, e] of map) e.transcriptPay = earningsFor(usual.get(id) ?? 0) + (custom.get(id) ?? 0);
  for (const id of new Set([...refUsual.keys(), ...refCustom.keys()])) get(id).referralPay = referralPayFor(refUsual.get(id) ?? 0, refCustom.get(id) ?? 0);
  for (const e of map.values()) e.total = e.transcriptPay + e.referralPay;
  return map;
}

export async function expectedFor(userId: string): Promise<Expected> {
  return (await expectedByUser()).get(userId) ?? { jobs: 0, seconds: 0, transcriptPay: 0, referralPay: 0, total: 0 };
}
