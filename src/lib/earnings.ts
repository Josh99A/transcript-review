import { db } from "./db";
import { earningsFor, REFERRAL_BONUS_UGX } from "./pay";

export type Balance = {
  /** Media time credited from submitted transcripts. */
  seconds: number;
  /** Pay for that time, computed on the cumulative total (not summed per-job roundings). */
  transcriptPay: number;
  referralPay: number;
  earned: number;
  paid: number;
  owed: number;
};

const empty = (): Balance => ({ seconds: 0, transcriptPay: 0, referralPay: 0, earned: 0, paid: 0, owed: 0 });

/** Earned, paid and owed totals for every user, keyed by user id. */
export async function balancesByUser(): Promise<Map<string, Balance>> {
  const [earned, bonuses, paid] = await Promise.all([
    db.earning.groupBy({ by: ["userId"], _sum: { seconds: true } }),
    db.referralBonus.groupBy({ by: ["referrerId"], _sum: { amount: true } }),
    db.payout.groupBy({ by: ["userId"], _sum: { amount: true } }),
  ]);
  const map = new Map<string, Balance>();
  const get = (id: string) => map.get(id) ?? map.set(id, empty()).get(id)!;
  for (const e of earned) {
    const b = get(e.userId);
    b.seconds = e._sum.seconds ?? 0;
    b.transcriptPay = earningsFor(b.seconds);
  }
  for (const r of bonuses) get(r.referrerId).referralPay = r._sum.amount ?? 0;
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

/**
 * Credits the referrer's one-off bonus once the transcriber has submitted at least one transcript.
 * Safe to call repeatedly: the bonus is unique per transcriber.
 */
export async function creditReferralIfDue(transcriberId: string) {
  const t = await db.user.findUnique({
    where: { id: transcriberId },
    select: { referredById: true, bonusTriggeredBy: { select: { id: true } }, _count: { select: { earnings: true } } },
  });
  if (!t?.referredById || t.bonusTriggeredBy || t._count.earnings === 0) return;
  await db.referralBonus.upsert({
    where: { transcriberId },
    create: { transcriberId, referrerId: t.referredById, amount: REFERRAL_BONUS_UGX },
    update: {},
  });
}
