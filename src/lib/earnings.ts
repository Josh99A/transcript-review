import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { earningsFor, RATE_PER_HOUR_UGX, referralPayFor } from "./pay";

/** Only work an admin has approved counts as earned. */
export const APPROVED: Prisma.EarningWhereInput = { job: { status: "SUBMITTED", approvedAt: { not: null } } };
/** Submitted and waiting for an admin's review: shown on its own, never earned or payable yet. */
export const AWAITING: Prisma.EarningWhereInput = { job: { status: "SUBMITTED", approvedAt: null } };

export type Balance = {
  /** Media time from approved transcripts. */
  seconds: number;
  /** Pay for that time, computed on the cumulative total (not summed per-job roundings). */
  transcriptPay: number;
  /** Media time submitted by people this user referred. */
  referralSeconds: number;
  referralPay: number;
  earned: number;
  paid: number;
  owed: number;
  /** Submitted work waiting for approval: what it will add to Earned once approved. */
  awaiting: number;
  awaitingSeconds: number;
  awaitingJobs: number;
};

const empty = (): Balance => ({ seconds: 0, transcriptPay: 0, referralSeconds: 0, referralPay: 0, earned: 0, paid: 0, owed: 0, awaiting: 0, awaitingSeconds: 0, awaitingJobs: 0 });

/** usual: usual-rate seconds by the hourly rate they're paid at (approved work keeps the rate it was approved at). */
type Sums = { usual: Map<number, number>; custom: number; seconds: number; jobs: number };
const sums = (): Sums => ({ usual: new Map(), custom: 0, seconds: 0, jobs: 0 });
const usualSeconds = (t: Sums) => [...t.usual.values()].reduce((a, b) => a + b, 0);

/** Per person: usual-rate seconds and special-rate pay of the earnings matching `where`, as transcriber and as referrer. */
async function totals(client: Prisma.TransactionClient, where: Prisma.EarningWhereInput) {
  const [own, referred] = await Promise.all([
    client.earning.groupBy({ by: ["userId", "customRate", "lockedRate"], where, _sum: { seconds: true, amount: true }, _count: true }),
    client.earning.groupBy({ by: ["referrerId", "customRate", "lockedRate"], where: { ...where, referrerId: { not: null } }, _sum: { seconds: true, amount: true } }),
  ]);
  const mine = new Map<string, Sums>();
  const refs = new Map<string, Sums>();
  const add = (m: Map<string, Sums>, id: string, custom: boolean, rate: number | null, seconds: number, amount: number, jobs = 0) => {
    const t = m.get(id) ?? m.set(id, sums()).get(id)!;
    t.seconds += seconds;
    t.jobs += jobs;
    if (custom) t.custom += amount;
    else {
      const r = rate ?? RATE_PER_HOUR_UGX;
      t.usual.set(r, (t.usual.get(r) ?? 0) + seconds);
    }
  };
  for (const e of own) add(mine, e.userId, e.customRate, e.lockedRate, e._sum.seconds ?? 0, e._sum.amount ?? 0, e._count);
  for (const e of referred) add(refs, e.referrerId!, e.customRate, e.lockedRate, e._sum.seconds ?? 0, e._sum.amount ?? 0);
  return { mine, refs };
}

/** Earned, paid and owed totals for every user, keyed by user id. */
export async function balancesByUser(client: Prisma.TransactionClient = db): Promise<Map<string, Balance>> {
  const [approved, waiting, paid] = await Promise.all([
    totals(client, APPROVED),
    totals(client, AWAITING),
    client.payout.groupBy({ by: ["userId"], _sum: { amount: true } }),
  ]);
  const map = new Map<string, Balance>();
  const get = (id: string) => map.get(id) ?? map.set(id, empty()).get(id)!;
  // Usual-rate pay is worked out on the total of that time at each rate; jobs with their own rate add their pay as is.
  const pay = (t?: Sums) => (t ? [...t.usual].reduce((a, [rate, secs]) => a + earningsFor(secs, rate), 0) + t.custom : 0);
  const refPay = (t?: Sums) => (t ? referralPayFor(usualSeconds(t), t.custom) : 0);
  const plus = (a: Sums | undefined, b: Sums | undefined): Sums => {
    const usual = new Map(a?.usual);
    for (const [r, secs] of b?.usual ?? []) usual.set(r, (usual.get(r) ?? 0) + secs);
    return { usual, custom: (a?.custom ?? 0) + (b?.custom ?? 0), seconds: 0, jobs: 0 };
  };
  const ids = new Set([...approved.mine.keys(), ...approved.refs.keys(), ...waiting.mine.keys(), ...waiting.refs.keys()]);
  for (const id of ids) {
    const b = get(id);
    const mine = approved.mine.get(id);
    const refs = approved.refs.get(id);
    b.seconds = mine?.seconds ?? 0;
    b.transcriptPay = pay(mine);
    b.referralSeconds = refs?.seconds ?? 0;
    b.referralPay = refPay(refs);
    // What approval would add on top, so the hourly total is still worked out on the combined time.
    const w = waiting.mine.get(id);
    const wr = waiting.refs.get(id);
    b.awaitingSeconds = w?.seconds ?? 0;
    b.awaitingJobs = w?.jobs ?? 0;
    b.awaiting = pay(plus(mine, w)) - b.transcriptPay + (refPay(plus(refs, wr)) - b.referralPay);
  }
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
  /** Jobs being worked on (assigned, not submitted), including ones sent back for changes. */
  jobs: number;
  seconds: number;
  /** Pay those jobs will bring once submitted and approved. */
  transcriptPay: number;
  /** Referral share of jobs the people this user referred are holding. */
  referralPay: number;
  total: number;
};

/**
 * Pay still to come from jobs people are working on. A job moves to Awaiting approval when submitted and to
 * Earned when approved; a job sent back for changes is being worked on again, so it is counted here.
 */
export async function expectedByUser(client: Prisma.TransactionClient = db): Promise<Map<string, Expected>> {
  const jobs = await client.job.findMany({
    where: { status: "ASSIGNED", assigneeId: { not: null } },
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
