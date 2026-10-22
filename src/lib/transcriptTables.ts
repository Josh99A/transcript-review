/**
 * Transcripts are stored as plain text. Tables live in them as Markdown-style pipe tables:
 *
 *   | Time | Speaker | Words |
 *   | --- | --- | --- |
 *   | 00:01 | Ann | Hello<br>there |
 *
 * A cell's line breaks are written as <br> and a | inside a cell as \|. These helpers split a transcript
 * into text and table blocks and put it back together exactly, so showing a table never changes the text.
 */

export type TextBlock = { kind: "text"; text: string | null };
export type TableBlock = { kind: "table"; rows: string[][]; raw: string };
export type Block = TextBlock | TableBlock;

const ROW = /^\s*\|.*\|\s*$/;
const SEPARATOR = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/;

/** The cells of one `| a | b |` line, unescaped for display (<br> becomes a line break). */
export function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\" && inner[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (inner[i] === "|") {
      cells.push(cell);
      cell = "";
    } else cell += inner[i];
  }
  cells.push(cell);
  return cells.map((c) => c.trim().replace(/<br\s*\/?>/gi, "\n"));
}

/** One cell's text written for a pipe table. */
export function escapeCell(value: string) {
  return value.replace(/\r/g, "").replace(/\|/g, "\\|").trim().replace(/[ \t]*\n[ \t]*/g, "<br>");
}

export function tableToText(rows: string[][]) {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => escapeCell(r[i] ?? "")).join(" | ")} |`;
  const [head = [], ...body] = rows;
  return [line(head), `| ${Array(width).fill("---").join(" | ")} |`, ...body.map(line)].join("\n");
}

export function hasTable(text: string) {
  const lines = text.split("\n");
  return lines.some((l, i) => ROW.test(l) && SEPARATOR.test(lines[i + 1] ?? ""));
}

/**
 * Text and table blocks, always alternating and starting and ending with text so there is somewhere to type
 * around each table. A text block of null didn't exist in the transcript and adds nothing when joined.
 */
export function toBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let buf: string[] | null = null;
  const flush = () => {
    blocks.push({ kind: "text", text: buf ? buf.join("\n") : null });
    buf = null;
  };
  for (let i = 0; i < lines.length; ) {
    if (ROW.test(lines[i]) && SEPARATOR.test(lines[i + 1] ?? "")) {
      const start = i;
      i += 2;
      while (i < lines.length && ROW.test(lines[i])) i++;
      flush();
      const raw = lines.slice(start, i);
      blocks.push({ kind: "table", raw: raw.join("\n"), rows: [splitRow(raw[0]), ...raw.slice(2).map(splitRow)] });
    } else {
      (buf ??= []).push(lines[i]);
      i++;
    }
  }
  flush();
  return blocks;
}

export function fromBlocks(blocks: Block[]) {
  return blocks
    .map((b) => (b.kind === "table" ? b.raw : b.text))
    .filter((t): t is string => t !== null)
    .join("\n");
}

/** Word count that ignores table borders. */
export function countWords(text: string) {
  return text.split(/\s+/).filter((w) => w && !/^[|:\-]+$/.test(w)).length;
}
