import { db } from "./db";

const KEY = "guidelines";

/** The standing rules shown on every job until an admin edits them. */
export const DEFAULT_GUIDELINES = [
  "<ol>",
  "<li><strong>Grammar and spelling:</strong> Correct all spelling and grammar mistakes <u>without changing what the speaker meant</u>.</li>",
  "<li><strong>Timestamps:</strong> Every <strong>Interviewer</strong> and <strong>Respondent</strong> timestamp must <mark>match the audio</mark>, at the moment that person starts speaking.</li>",
  "<li><strong>Numbers:</strong> Write every number you hear as <mark>figures</mark>, for example <strong>25</strong>, not “twenty-five”.</li>",
  "<li><strong>Translator:</strong> When you hear a translator, add a third tag, <strong>Translator</strong>, with its own timestamp.</li>",
  "<li><strong>Speakers:</strong> Make sure every line belongs to the <mark>right person</mark>. Move any dialogue that is under the wrong speaker.</li>",
  "<li><strong>Fillers:</strong> You may remove irrelevant statements and exclamations (such as “uhm”, “eh” or false starts) when they add nothing to the meaning.</li>",
  "<li><strong>Language:</strong> Keep each speaker’s words <mark>in the language they spoke</mark>. <u>Do not translate</u> them.</li>",
  "</ol>",
].join("");

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
