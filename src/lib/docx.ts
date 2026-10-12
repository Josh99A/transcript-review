import "server-only";
import { BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import mammoth from "mammoth";
import { tableToText, toBlocks } from "./transcriptTables";

type DocNode = { type: string; value?: string; children?: DocNode[]; colSpan?: number; rowSpan?: number };

/** Plain text of a document node, the way mammoth's raw text works: each paragraph ends with a blank line. */
function nodeText(node: DocNode): string {
  if (node.type === "text") return node.value ?? "";
  if (node.type === "tab") return "\t";
  if (node.type === "table") return tableToText(tableRows(node)).split("\n").map((l) => l + "\n\n").join("");
  return (node.children ?? []).map(nodeText).join("") + (node.type === "paragraph" ? "\n\n" : "");
}

/** A Word table as rows of cell text. Merged cells keep their text in the first cell and leave the rest empty. */
function tableRows(table: DocNode): string[][] {
  const rows: string[][] = [];
  const spanning: number[] = []; // rows still covered by a cell above, per column
  for (const row of table.children ?? []) {
    if (row.type !== "tableRow") continue;
    const out: string[] = [];
    let col = 0;
    const fill = () => {
      while (spanning[col] > 0) {
        spanning[col]--;
        out[col++] = "";
      }
    };
    for (const cell of row.children ?? []) {
      fill();
      const text = (cell.children ?? []).map(nodeText).join("").replace(/\t/g, " ").split(/\n+/).map((l) => l.trim()).filter(Boolean).join("\n");
      const span = cell.colSpan ?? 1;
      for (let i = 0; i < span; i++) {
        out[col] = i === 0 ? text : "";
        if ((cell.rowSpan ?? 1) > 1) spanning[col] = (cell.rowSpan ?? 1) - 1;
        col++;
      }
    }
    fill();
    rows.push(out);
  }
  return rows;
}

/** Text of a Word (.docx) file, one line per paragraph. Tables come through as pipe tables (see transcriptTables). */
export async function docxToText(buffer: Buffer): Promise<string> {
  let doc: DocNode | null = null;
  await mammoth.convertToHtml({ buffer }, { transformDocument: (d: DocNode) => (doc = d) });
  const value = doc ? nodeText(doc) : (await mammoth.extractRawText({ buffer })).value;
  // Paragraphs are separated by a blank line; keep one line per paragraph.
  return value.replace(/\r/g, "").replace(/\n\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "A0A0A0" };

function wordTable(rows: string[][]) {
  const width = Math.max(1, ...rows.map((r) => r.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER },
    rows: rows.map(
      (r, ri) =>
        new TableRow({
          tableHeader: ri === 0,
          children: Array.from({ length: width }, (_, ci) =>
            new TableCell({
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: (r[ci] ?? "").split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, bold: ri === 0 })] })),
            }),
          ),
        }),
    ),
  });
}

/** A Word document with one paragraph per line of the transcript, and real tables for its pipe tables. */
export async function textToDocx(title: string, text: string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  for (const block of toBlocks(text.replace(/\r/g, "").replace(/\n+$/, ""))) {
    if (block.kind === "table") {
      children.push(wordTable(block.rows));
    } else if (block.text !== null) {
      for (const line of block.text.split("\n")) children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }
  // Word needs a paragraph after a table that ends the document.
  if (children.at(-1) instanceof Table) children.push(new Paragraph({}));
  const doc = new Document({
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
