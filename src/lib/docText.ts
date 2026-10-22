/** Formatted transcripts are stored as HTML (see docxImport); plain ones as text. */
export type TranscriptFormat = "text" | "html";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/** The words of a formatted transcript, one line per paragraph and a tab between table cells. Safe to use in the browser. */
export function docText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\t\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain words of a transcript in either format, for counts and comparisons. */
export function transcriptWords(text: string, format: TranscriptFormat | string) {
  return format === "html" ? docText(text) : text;
}
