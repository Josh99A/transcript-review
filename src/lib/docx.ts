import "server-only";
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, LevelFormat, Packer, Paragraph, type ParagraphChild, ShadingType, Tab, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { type ChildNode, Element, type Text } from "domhandler";
import { parseDocument } from "htmlparser2";
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

// ---------- Formatted transcripts (HTML) to Word ----------

type Inline = { b?: boolean; i?: boolean; u?: boolean; s?: boolean; sup?: boolean; sub?: boolean; color?: string; bg?: string; size?: number; font?: string };
type Node = ChildNode;

function hex(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (short) return short.slice(1).map((c) => c + c).join("");
  if (/^#[0-9a-f]{6}/.test(s)) return s.slice(1, 7);
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s);
  if (rgb) return rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("");
  return undefined;
}

function css(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (el.attribs.style ?? "").split(";")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

function withStyle(el: Element, st: Inline): Inline {
  const next = { ...st };
  switch (el.name) {
    case "strong": case "b": next.b = true; break;
    case "em": case "i": next.i = true; break;
    case "u": next.u = true; break;
    case "s": case "strike": case "del": next.s = true; break;
    case "sup": next.sup = true; break;
    case "sub": next.sub = true; break;
    case "mark": next.bg = next.bg ?? "ffff00"; break;
  }
  const c = css(el);
  if (hex(c.color)) next.color = hex(c.color);
  if (hex(c["background-color"])) next.bg = hex(c["background-color"]);
  const size = /^([\d.]+)(pt|px)$/.exec(c["font-size"] ?? "");
  if (size) next.size = Number(size[1]) * (size[2] === "px" ? 0.75 : 1);
  if (c["font-family"]) next.font = c["font-family"].split(",")[0].replace(/["']/g, "").trim();
  return next;
}

type HighlightName = NonNullable<ConstructorParameters<typeof TextRun>[0] extends infer O ? (O extends { highlight?: infer H } ? H : never) : never>;
const HIGHLIGHT_NAMES: Record<string, HighlightName> = {
  ffff00: "yellow", "00ff00": "green", "00ffff": "cyan", ff00ff: "magenta", "0000ff": "blue", ff0000: "red", "000080": "darkBlue",
  "008080": "darkCyan", "008000": "darkGreen", "800080": "darkMagenta", "800000": "darkRed", "808000": "darkYellow", "808080": "darkGray", c0c0c0: "lightGray",
};

function textRun(text: string, st: Inline) {
  const parts = text.split("\t");
  const children = parts.flatMap((p, i) => (i ? [new Tab(), p] : [p])).filter((c) => c !== "");
  return new TextRun({
    children,
    bold: st.b,
    italics: st.i,
    underline: st.u ? {} : undefined,
    strike: st.s,
    superScript: st.sup,
    subScript: st.sub,
    color: st.color,
    size: st.size ? Math.round(st.size * 2) : undefined,
    font: st.font,
    ...(st.bg ? (HIGHLIGHT_NAMES[st.bg] ? { highlight: HIGHLIGHT_NAMES[st.bg] } : { shading: { type: ShadingType.CLEAR, color: "auto", fill: st.bg } }) : {}),
  });
}

function decode(s: string) {
  return s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
}

function inlines(nodes: Node[], st: Inline): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes) {
    if (n.type === "text") {
      const t = decode((n as Text).data);
      if (t) out.push(textRun(t, st));
    } else if (n instanceof Element) {
      if (n.name === "br") out.push(new TextRun({ break: 1 }));
      else if (n.name === "a" && n.attribs.href) out.push(new ExternalHyperlink({ link: n.attribs.href, children: inlines(n.children, { ...st, u: true, color: st.color ?? "0563c1" }) as TextRun[] }));
      else out.push(...inlines(n.children, withStyle(n, st)));
    }
  }
  return out;
}

const HEADINGS = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4, h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6 } as const;
const ALIGNMENT = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED, left: AlignmentType.LEFT } as const;
const BLOCK = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "blockquote", "li", "div"]);

type ListCtx = { ref: "ul" | "ol"; level: number; instance: number } | null;

function htmlBlocks(nodes: Node[], list: ListCtx, counter: { n: number }): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let loose: Node[] = [];
  const para = (children: Node[], el?: Element) => {
    const align = el ? ALIGNMENT[css(el)["text-align"] as keyof typeof ALIGNMENT] : undefined;
    const heading = el ? HEADINGS[el.name as keyof typeof HEADINGS] : undefined;
    out.push(new Paragraph({
      children: inlines(children, heading ? { b: true } : {}),
      heading,
      alignment: align && align !== AlignmentType.LEFT ? align : undefined,
      numbering: list ? { reference: list.ref, level: list.level, instance: list.instance } : undefined,
    }));
  };
  const flush = () => {
    if (loose.some((n) => n.type !== "text" || (n as Text).data.trim())) para(loose);
    loose = [];
  };
  for (const n of nodes) {
    if (!(n instanceof Element) || !BLOCK.has(n.name)) {
      loose.push(n);
      continue;
    }
    flush();
    if (n.name === "ul" || n.name === "ol") {
      const ctx: ListCtx = { ref: n.name, level: list ? Math.min(list.level + 1, 8) : 0, instance: ++counter.n };
      for (const li of n.children) if (li instanceof Element && li.name === "li") out.push(...htmlBlocks(li.children, ctx, counter));
    } else if (n.name === "table") {
      out.push(htmlTable(n, counter));
    } else if (n.name === "blockquote" || n.name === "div" || n.name === "li") {
      out.push(...htmlBlocks(n.children, list, counter));
    } else {
      para(n.children, n);
    }
  }
  flush();
  return out;
}

const elements = (n: { children: Node[] }, names: string[]) => n.children.filter((c): c is Element => c instanceof Element && names.includes(c.name));

function htmlTable(table: Element, counter: { n: number }): Table {
  const rows = elements(table, ["tbody", "thead", "tfoot"]).flatMap((g) => elements(g, ["tr"])).concat(elements(table, ["tr"]));
  // Column widths come from the first row's cells (the editor stores them in pixels).
  const widths: number[] = [];
  for (const c of elements(rows[0] ?? { children: [] }, ["td", "th"])) {
    const span = Number(c.attribs.colspan ?? 1) || 1;
    const px = (c.attribs.colwidth ?? "").split(",").map(Number);
    for (let i = 0; i < span; i++) widths.push(px[i] > 0 ? px[i] * 15 : 0);
  }
  const known = widths.length && widths.every((w) => w > 0);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    ...(known ? { columnWidths: widths } : {}),
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER },
    rows: rows.map((tr) => {
      const cells = elements(tr, ["td", "th"]);
      return new TableRow({
        tableHeader: cells.length > 0 && cells.every((c) => c.name === "th"),
        children: cells.map((c) => {
          const blocks = htmlBlocks(c.children, null, counter);
          const bg = hex(css(c)["background-color"]);
          return new TableCell({
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            columnSpan: Number(c.attribs.colspan ?? 1) > 1 ? Number(c.attribs.colspan) : undefined,
            rowSpan: Number(c.attribs.rowspan ?? 1) > 1 ? Number(c.attribs.rowspan) : undefined,
            shading: bg ? { type: ShadingType.CLEAR, color: "auto", fill: bg } : undefined,
            children: blocks.length ? blocks : [new Paragraph({})],
          });
        }),
      });
    }),
  });
}

const listLevels = (kind: "ul" | "ol") =>
  Array.from({ length: 9 }, (_, level) => ({
    level,
    format: kind === "ul" ? LevelFormat.BULLET : [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
    text: kind === "ul" ? ["•", "◦", "▪"][level % 3] : `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));

/** A Word document from a formatted transcript, keeping its headings, lists, tables and text formatting. */
export async function htmlToDocx(title: string, html: string): Promise<Buffer> {
  const children = htmlBlocks(parseDocument(html).children, null, { n: 0 });
  if (!children.length || children.at(-1) instanceof Table) children.push(new Paragraph({}));
  const doc = new Document({
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: { config: [{ reference: "ul", levels: listLevels("ul") }, { reference: "ol", levels: listLevels("ol") }] },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
