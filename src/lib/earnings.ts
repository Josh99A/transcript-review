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
