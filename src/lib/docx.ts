import "server-only";
import { Document, Packer, Paragraph, TextRun } from "docx";
import mammoth from "mammoth";

/** Plain text of a Word (.docx) file, one line per paragraph. */
export async function docxToText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  // mammoth separates paragraphs with a blank line; keep one line per paragraph.
  return value.replace(/\r/g, "").replace(/\n\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** A Word document with one paragraph per line of the transcript. */
export async function textToDocx(title: string, text: string): Promise<Buffer> {
  const doc = new Document({
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
    sections: [{ children: text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] })) }],
  });
  return Packer.toBuffer(doc);
}
