import "server-only";
import { docxToText } from "./docx";
import { docxToHtml } from "./docxImport";
import type { TranscriptFormat } from "./docText";
import { cleanDoc, textToDoc } from "./richDoc";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Reads an uploaded transcript file. Word files keep their formatting (as HTML) unless `into` says the job
 * holds plain text; a .txt going into a formatted job becomes one paragraph per line.
 */
export async function readTranscriptFile(file: File, into?: TranscriptFormat): Promise<{ text: string; format: TranscriptFormat } | { error: string }> {
  if (file.size > MAX_BYTES) return { error: "That file is over 10 MB." };
  if (/\.docx$/i.test(file.name)) {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      if (into === "text") return { text: await docxToText(buffer), format: "text" };
      return { text: cleanDoc(await docxToHtml(buffer)), format: "html" };
    } catch (err) {
      console.error("Couldn't read Word file", err);
      return { error: "Couldn't read that Word file. Save it as .docx and try again." };
    }
  }
  if (/\.txt$/i.test(file.name)) {
    const text = (await file.text()).replace(/\r\n?/g, "\n");
    return into === "html" ? { text: textToDoc(text), format: "html" } : { text, format: "text" };
  }
  return { error: "Upload a Word .docx or a .txt file." };
}
