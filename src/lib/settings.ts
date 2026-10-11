import { db } from "./db";

const NEXT_PAY_DATE = "nextPayDate";

/** The pay date admins have announced, as a YYYY-MM-DD string, or null if none is set. */
export async function getNextPayDate(): Promise<string | null> {
  const s = await db.setting.findUnique({ where: { key: NEXT_PAY_DATE } });
  return s?.value || null;
}

export async function setNextPayDate(date: string | null) {
  if (!date) {
    await db.setting.deleteMany({ where: { key: NEXT_PAY_DATE } });
    return;
  }
  await db.setting.upsert({ where: { key: NEXT_PAY_DATE }, create: { key: NEXT_PAY_DATE, value: date }, update: { value: date } });
}
