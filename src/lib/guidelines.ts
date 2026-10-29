import { db } from "./db";
import { DEFAULT_JOB_INSTRUCTIONS } from "./jobInstructions";

const KEY = "guidelines";

/** The standing rules shown on every job until an admin edits them. */
export const DEFAULT_GUIDELINES = DEFAULT_JOB_INSTRUCTIONS;

export async function getGuidelines(): Promise<string> {
  return (await getGuidelinesInfo()).html;
}

/** The guidelines and when an admin last changed them (null while they are still the defaults). */
export async function getGuidelinesInfo(): Promise<{ html: string; updatedAt: Date | null }> {
  const s = await db.setting.findUnique({ where: { key: KEY } });
  return s ? { html: s.value, updatedAt: s.updatedAt } : { html: DEFAULT_GUIDELINES, updatedAt: null };
}

/** Saves new guidelines. Empty hides the panel. */
export async function setGuidelines(html: string) {
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: html }, update: { value: html } });
}
