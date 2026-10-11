import { db } from "./db";

export type Balance = { earned: number; paid: number; owed: number };

/** Earned, paid and owed totals for every user, keyed by user id. */
export async function balancesByUser(): Promise<Map<string, Balance>> {
  const [earned, paid] = await Promise.all([
    db.earning.groupBy({ by: ["userId"], _sum: { amount: true } }),
    db.payout.groupBy({ by: ["userId"], _sum: { amount: true } }),
  ]);
  const map = new Map<string, Balance>();
  const get = (id: string) => map.get(id) ?? map.set(id, { earned: 0, paid: 0, owed: 0 }).get(id)!;
  for (const e of earned) get(e.userId).earned = e._sum.amount ?? 0;
  for (const p of paid) get(p.userId).paid = p._sum.amount ?? 0;
  for (const b of map.values()) b.owed = b.earned - b.paid;
  return map;
}

export async function balanceFor(userId: string): Promise<Balance> {
  return (await balancesByUser()).get(userId) ?? { earned: 0, paid: 0, owed: 0 };
}
