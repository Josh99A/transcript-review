import "server-only";
import { DOMParser, type Document as XDoc, type Element as XEl } from "@xmldom/xmldom";
import JSZip from "jszip";

/**
 * Reads a Word file into the HTML the transcript editor works with, keeping what transcripts use:
 * headings, bold, italic, underline, strike-through, colours, highlights, font sizes and faces,
 * superscript/subscript, alignment, bulleted and numbered lists, links, and tables with merged and
 * shaded cells and their column widths. Pictures, text boxes and footnotes are left out.
 */

type El = XEl;
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const kids = (el: El | null | undefined, name?: string): El[] => {
  const out: El[] = [];
  if (!el) return out;
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!name || (n as El).localName === name)) out.push(n as El);
  return out;
};
const kid = (el: El | null | undefined, name: string) => kids(el, name)[0] ?? null;
const attr = (el: El | null | undefined, name: string) => (el ? el.getAttributeNS(W, name) || el.getAttribute(`w:${name}`) || null : null);
/** Word's on/off properties: present means on unless the value says otherwise. */
const flag = (el: El | null) => (el ? !/^(false|0|off|none)$/i.test(attr(el, "val") ?? "true") : undefined);

const HIGHLIGHTS: Record<string, string> = {
  yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff", blue: "#0000ff", red: "#ff0000",
  darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000",
  darkYellow: "#808000", darkGray: "#808080", lightGray: "#c0c0c0", black: "#000000", white: "#ffffff",
};

export type RunStyle = { b?: boolean; i?: boolean; u?: boolean; s?: boolean; color?: string; bg?: string; size?: number; font?: string; vert?: "sup" | "sub" };

function readRunProps(rPr: El | null): RunStyle {
  if (!rPr) return {};
  const out: RunStyle = {};
  const b = flag(kid(rPr, "b"));
  if (b !== undefined) out.b = b;
  const i = flag(kid(rPr, "i"));
  if (i !== undefined) out.i = i;
  const u = kid(rPr, "u");
  if (u) out.u = !/^none$/i.test(attr(u, "val") ?? "single");
  const s = flag(kid(rPr, "strike")) ?? flag(kid(rPr, "dstrike"));
  if (s !== undefined) out.s = s;
  const color = attr(kid(rPr, "color"), "val");
  if (color && /^[0-9a-f]{6}$/i.test(color)) out.color = `#${color.toLowerCase()}`;
  const shd = attr(kid(rPr, "shd"), "fill");
  if (shd && /^[0-9a-f]{6}$/i.test(shd)) out.bg = `#${shd.toLowerCase()}`;
  const hl = attr(kid(rPr, "highlight"), "val");
  if (hl && HIGHLIGHTS[hl]) out.bg = HIGHLIGHTS[hl];
  else if (hl === "none") out.bg = "";
  const sz = Number(attr(kid(rPr, "sz"), "val"));
  if (sz > 0) out.size = sz / 2;
  const fonts = kid(rPr, "rFonts");
  const font = attr(fonts, "ascii") ?? attr(fonts, "hAnsi");
  const theme = attr(fonts, "asciiTheme") ?? attr(fonts, "hAnsiTheme");
  if (font) out.font = font;
  else if (theme) out.font = theme.startsWith("major") ? "@major" : "@minor";
  const va = attr(kid(rPr, "vertAlign"), "val");
  if (va === "superscript") out.vert = "sup";
  else if (va === "subscript") out.vert = "sub";
  return out;
}

type Style = { type: string; name: string; basedOn: string | null; rPr: RunStyle; numId: string | null; ilvl: number; jc: string | null; outline: number | null };

function readStyles(doc: XDoc | null) {
  const styles = new Map<string, Style>();
  let base: RunStyle = {};
  let defaultPara: string | null = null;
  const root = doc?.documentElement;
  if (!root) return { styles, base, defaultPara };
  const defaults = kid(kid(kid(root, "docDefaults"), "rPrDefault"), "rPr");
  base = readRunProps(defaults);
  for (const st of kids(root, "style")) {
    const id = attr(st, "styleId");
    if (!id) continue;
    const pPr = kid(st, "pPr");
    const numPr = kid(pPr, "numPr");
    const outline = attr(kid(pPr, "outlineLvl"), "val");
    styles.set(id, {
      type: attr(st, "type") ?? "paragraph",
      name: (attr(kid(st, "name"), "val") ?? id).toLowerCase(),
      basedOn: attr(kid(st, "basedOn"), "val"),
      rPr: readRunProps(kid(st, "rPr")),
      numId: attr(kid(numPr, "numId"), "val"),
      ilvl: Number(attr(kid(numPr, "ilvl"), "val") ?? 0),
      jc: attr(kid(pPr, "jc"), "val"),
      outline: outline != null ? Number(outline) : null,
    });
    if (attr(st, "type") === "paragraph" && /^(1|true)$/.test(attr(st, "default") ?? "")) defaultPara = id;
  }
  return { styles, base, defaultPara };
}

type ListKind = "ul" | "ol";

function readNumbering(doc: XDoc | null) {
  const abstract = new Map<string, Map<number, ListKind>>();
  const nums = new Map<string, string>();
  const root = doc?.documentElement;
  if (!root) return (numId: string, lvl: number): ListKind | null => (numId ? null : null);
  for (const a of kids(root, "abstractNum")) {
    const levels = new Map<number, ListKind>();
    for (const l of kids(a, "lvl")) levels.set(Number(attr(l, "ilvl") ?? 0), attr(kid(l, "numFmt"), "val") === "bullet" ? "ul" : "ol");
    abstract.set(attr(a, "abstractNumId") ?? "", levels);
  }
  for (const n of kids(root, "num")) nums.set(attr(n, "numId") ?? "", attr(kid(n, "abstractNumId"), "val") ?? "");
  return (numId: string, lvl: number): ListKind | null => {
    if (!numId || numId === "0") return null;
    const levels = abstract.get(nums.get(numId) ?? "");
    if (!levels) return null;
    return levels.get(lvl) ?? levels.get(0) ?? "ul";
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ALIGN: Record<string, string> = { center: "center", right: "right", end: "right", both: "justify", distribute: "justify" };

type Seg = { text: string; style: RunStyle; href?: string } | { br: true };

export async function docxToHtml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (path: string) => {
    const f = zip.file(path);
    return f ? new DOMParser().parseFromString(await f.async("string"), "text/xml") : null;
  };
  const [docXml, stylesXml, numberingXml, relsXml, themeXml] = await Promise.all([read("word/document.xml"), read("word/styles.xml"), read("word/numbering.xml"), read("word/_rels/document.xml.rels"), read("word/theme/theme1.xml")]);
  // Theme fonts ("the body font", "the headings font") resolved to real font names.
  const themeFont = (which: "majorFont" | "minorFont") => {
    const el = themeXml?.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", which)[0];
    const latin = el ? Array.from({ length: el.childNodes.length }, (_, i) => el.childNodes[i]).find((n) => (n as XEl).localName === "latin") as XEl | undefined : undefined;
    return latin?.getAttribute("typeface") || undefined;
  };
  const fontsByTheme = { "@major": themeFont("majorFont") ?? "Calibri Light", "@minor": themeFont("minorFont") ?? "Calibri" };
  const body = kid(docXml?.documentElement, "body");
  if (!body) throw new Error("Not a Word document");

  const { styles, base: docBase, defaultPara } = readStyles(stylesXml);
  const listKind = readNumbering(numberingXml);
  const links = new Map<string, string>();
  for (const r of kids(relsXml?.documentElement, "Relationship")) {
    const target = r.getAttribute("Target") ?? "";
    if (r.getAttribute("TargetMode") === "External" && /^(https?:|mailto:)/i.test(target)) links.set(r.getAttribute("Id") ?? "", target);
  }

  /** A style's run formatting, including what it inherits. */
  const styleRun = (id: string | null, seen = new Set<string>()): RunStyle => {
    const st = id ? styles.get(id) : undefined;
    if (!st || seen.has(id!)) return {};
    seen.add(id!);
    return { ...styleRun(st.basedOn, seen), ...st.rPr };
  };
  const styleProp = <K extends "numId" | "jc" | "outline">(id: string | null, key: K, seen = new Set<string>()): Style[K] | null => {
    const st = id ? styles.get(id) : undefined;
    if (!st || seen.has(id!)) return null;
    seen.add(id!);
    return st[key] ?? styleProp(st.basedOn, key, seen);
  };
  // Formatting that matches what a downloaded Word file uses anyway (Calibri 11, black) is left out.
  const plain: RunStyle = { font: "Calibri", size: 11 };
  const baseRun: RunStyle = { size: 10, ...docBase, ...styleRun(defaultPara) };

  const headingLevel = (styleId: string | null): number | null => {
    if (!styleId) return null;
    const name = styles.get(styleId)?.name ?? styleId.toLowerCase();
    const m = /^heading\s*([1-6])$/.exec(name);
    if (m) return Number(m[1]);
    if (name === "title") return 1;
    if (name === "subtitle") return 2;
    const outline = styleProp(styleId, "outline");
    return outline != null && outline < 6 ? outline + 1 : null;
  };

  function runSegs(el: El, paraRun: RunStyle, href: string | undefined, out: Seg[]) {
    for (const n of kids(el)) {
      switch (n.localName) {
        case "r": {
          const rPr = kid(n, "rPr");
          const style = { ...paraRun, ...styleRun(attr(kid(rPr, "rStyle"), "val")), ...readRunProps(rPr) };
          for (const c of kids(n)) {
            if (c.localName === "t") out.push({ text: c.textContent ?? "", style, href });
            else if (c.localName === "tab" || c.localName === "ptab") out.push({ text: "\t", style, href });
            else if (c.localName === "br" || c.localName === "cr") out.push({ br: true });
            else if (c.localName === "noBreakHyphen" || c.localName === "softHyphen") out.push({ text: c.localName === "noBreakHyphen" ? "-" : "", style, href });
          }
          break;
        }
        case "hyperlink": {
          const id = n.getAttributeNS(R, "id") || n.getAttribute("r:id");
          runSegs(n, paraRun, (id && links.get(id)) || href, out);
          break;
        }
        case "ins": case "smartTag": case "fldSimple": case "customXml": case "bdo": case "dir":
          runSegs(n, paraRun, href, out);
          break;
        case "sdt":
          runSegs(kid(n, "sdtContent") ?? n, paraRun, href, out);
          break;
        // w:del (deleted text in tracked changes), proofing marks and bookmarks add nothing.
      }
    }
  }

  function segHtml(segs: Seg[]) {
    // Runs are grouped by their colour, size and font so neighbours share one span.
    const groups: { css: string; html: string }[] = [];
    for (const seg of segs) {
      let css = "";
      let piece: string;
      if ("br" in seg) piece = "<br>";
      else {
        if (!seg.text) continue;
        const st = { ...seg.style, font: seg.style.font?.startsWith("@") ? fontsByTheme[seg.style.font as "@major" | "@minor"] : seg.style.font };
        const rules: string[] = [];
        if (st.color && st.color !== plain.color && st.color !== "#000000") rules.push(`color: ${st.color}`);
        if (st.bg && st.bg !== "#ffffff") rules.push(`background-color: ${st.bg}`);
        if (st.size && st.size !== plain.size) rules.push(`font-size: ${st.size}pt`);
        if (st.font && st.font !== plain.font) rules.push(`font-family: ${st.font.replace(/[^\w \-]/g, "")}`);
        css = rules.join("; ");
        piece = esc(seg.text);
        if (st.vert) piece = `<${st.vert}>${piece}</${st.vert}>`;
        if (st.s) piece = `<s>${piece}</s>`;
        if (st.u) piece = `<u>${piece}</u>`;
        if (st.i) piece = `<em>${piece}</em>`;
        if (st.b) piece = `<strong>${piece}</strong>`;
        if (seg.href) piece = `<a href="${esc(seg.href)}">${piece}</a>`;
      }
      const last = groups.at(-1);
      if (last && (last.css === css || piece === "<br>")) last.html += piece;
      else groups.push({ css, html: piece });
    }
    let html = groups.map((g) => (g.css ? `<span style="${g.css}">${g.html}</span>` : g.html)).join("");
    // Neighbouring runs with the same formatting become one, which keeps the HTML small.
    let prev;
    do {
      prev = html;
      html = html.replace(/<\/(strong|em|u|s|sup|sub)><\1>/g, "");
    } while (html !== prev);
    return html;
  }

  type Para = { html: string; list: { kind: ListKind; level: number; numId: string } | null };

  function paragraph(p: El): Para {
    const pPr = kid(p, "pPr");
    const styleId = attr(kid(pPr, "pStyle"), "val");
    const paraRun = { ...baseRun, ...styleRun(styleId) };
    const segs: Seg[] = [];
    runSegs(p, paraRun, undefined, segs);
    const level = headingLevel(styleId);
    const numPr = kid(pPr, "numPr");
    const numId = attr(kid(numPr, "numId"), "val") ?? styleProp(styleId, "numId");
    const ilvl = Number(attr(kid(numPr, "ilvl"), "val") ?? styles.get(styleId ?? "")?.ilvl ?? 0);
    const kind = numId ? listKind(numId, ilvl) : null;
    const align = ALIGN[attr(kid(pPr, "jc"), "val") ?? styleProp(styleId, "jc") ?? ""];
    const tag = level && !kind ? `h${level}` : "p";
    const inner = segHtml(segs);
    return { html: `<${tag}${align ? ` style="text-align: ${align}"` : ""}>${inner}</${tag}>`, list: kind ? { kind, level: Math.min(ilvl, 8), numId: numId! } : null };
  }

  function table(tbl: El): string {
    const twips = kids(kid(tbl, "tblGrid"), "gridCol").map((g) => Number(attr(g, "w") ?? 0));
    type Cell = { html: string; col: number; span: number; rowspan: number; header: boolean; bg: string | null };
    const rows: Cell[][] = [];
    const open = new Map<number, Cell>(); // the cell a vertical merge continues, by starting column
    for (const tr of kids(tbl, "tr")) {
      const header = flag(kid(kid(tr, "trPr"), "tblHeader")) === true;
      const row: Cell[] = [];
      let col = Number(attr(kid(kid(tr, "trPr"), "gridBefore"), "val") ?? 0);
      for (const tc of kids(tr).flatMap((c) => (c.localName === "sdt" ? kids(kid(c, "sdtContent"), "tc") : c.localName === "tc" ? [c] : []))) {
        const tcPr = kid(tc, "tcPr");
        const span = Math.max(1, Number(attr(kid(tcPr, "gridSpan"), "val") ?? 1));
        const vm = kid(tcPr, "vMerge");
        const fill = attr(kid(tcPr, "shd"), "fill");
        if (vm && (attr(vm, "val") ?? "continue") === "continue" && open.has(col)) {
          open.get(col)!.rowspan++;
        } else {
          const cell: Cell = { html: blocks(kids(tc)) || "<p></p>", col, span, rowspan: 1, header, bg: fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toLowerCase() !== "ffffff" ? `#${fill.toLowerCase()}` : null };
          row.push(cell);
          if (vm) open.set(col, cell);
          else open.delete(col);
        }
        col += span;
      }
      rows.push(row);
    }
    const px = (c: Cell) => {
      const w = twips.slice(c.col, c.col + c.span);
      return w.length === c.span && w.every((x) => x > 0) ? ` colwidth="${w.map((x) => Math.round(x / 15)).join(",")}"` : "";
    };
    const body = rows
      .filter((r) => r.length)
      .map((r) => `<tr>${r.map((c) => {
        const tag = c.header ? "th" : "td";
        return `<${tag}${c.span > 1 ? ` colspan="${c.span}"` : ""}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ""}${px(c)}${c.bg ? ` style="background-color: ${c.bg}"` : ""}>${c.html}</${tag}>`;
      }).join("")}</tr>`)
      .join("");
    return `<table><tbody>${body}</tbody></table>`;
  }

  /** Paragraphs and tables, with list paragraphs gathered into (nested) lists. */
  function blocks(nodes: El[]): string {
    let html = "";
    const stack: { kind: ListKind; level: number }[] = [];
    const closeTo = (level: number) => {
      while (stack.length && stack[stack.length - 1].level > level) html += `</li></${stack.pop()!.kind}>`;
    };
    const endLists = () => closeTo(-1);
    const flat = nodes.flatMap((n) => (n.localName === "sdt" ? kids(kid(n, "sdtContent")) : [n]));
    for (const n of flat) {
      if (n.localName === "p") {
        const p = paragraph(n);
        if (!p.list) {
          endLists();
          html += p.html;
          continue;
        }
        const { kind, level } = p.list;
        closeTo(level);
        const top = stack[stack.length - 1];
        if (top && top.level === level && top.kind === kind) html += `</li><li>${p.html}`;
        else if (top && top.level === level) {
          html += `</li></${stack.pop()!.kind}><${kind}><li>${p.html}`;
          stack.push({ kind, level });
        } else {
          html += `<${kind}><li>${p.html}`;
          stack.push({ kind, level });
        }
      } else if (n.localName === "tbl") {
        endLists();
        html += table(n);
      }
    }
    endLists();
    return html;
  }

  return blocks(kids(body));
}
