/** The languages offered before admins change the list. Anything else can be typed in. */
export const DEFAULT_LANGUAGES = ["Ateso", "Kinyarwanda", "Runyankole", "Karamojong"];

/** Tidies languages someone listed: known names spelled as listed, no blanks or repeats, a sensible number. */
export function cleanLanguages(raw: string[], known: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const r of raw.flatMap((x) => x.split(","))) {
    const v = r.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!v) continue;
    const match = known.find((l) => l.toLowerCase() === v.toLowerCase());
    const name = match ?? v.charAt(0).toUpperCase() + v.slice(1);
    if (!out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out.slice(0, 20);
}

/** Whether a transcriber's languages cover a job's language (a job in "Luo and English" matches Luo or English). */
export function speaks(languages: string[], jobLanguage: string | null): boolean {
  if (!jobLanguage) return false;
  const job = jobLanguage.toLowerCase();
  return languages.some((l) => job === l.toLowerCase() || job.split(/\s*(?:,|\/|&|\band\b)\s*/).includes(l.toLowerCase()));
}

