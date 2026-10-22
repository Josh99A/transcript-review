import { db } from "./db";
import { DEFAULT_LANGUAGES } from "./jobFields";

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

const LANGUAGES = "languages";

/** The languages offered on jobs and to transcribers, as admins have set them. */
export async function getLanguages(): Promise<string[]> {
  const s = await db.setting.findUnique({ where: { key: LANGUAGES } });
  if (!s) return DEFAULT_LANGUAGES;
  try {
    const list = JSON.parse(s.value);
    return Array.isArray(list) ? list.filter((l): l is string => typeof l === "string") : DEFAULT_LANGUAGES;
  } catch {
    return DEFAULT_LANGUAGES;
  }
}

export async function setLanguages(list: string[]) {
  const value = JSON.stringify(list);
  await db.setting.upsert({ where: { key: LANGUAGES }, create: { key: LANGUAGES, value }, update: { value } });
}

/** The admins' list plus the languages of jobs on the job board, so transcribers can pick what's being posted. */
export async function languageOptions(): Promise<string[]> {
  const [list, posted] = await Promise.all([
    getLanguages(),
    db.job.findMany({ where: { posted: true, status: "UNASSIGNED", language: { not: null } }, select: { language: true }, distinct: ["language"], orderBy: { language: "asc" } }),
  ]);
  const extra = posted.map((j) => j.language!.trim()).filter((l) => l && !list.some((x) => x.toLowerCase() === l.toLowerCase()));
  return [...list, ...extra];
}
