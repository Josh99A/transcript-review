import "server-only";
import sanitizeHtml from "sanitize-html";

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i];
const options: sanitizeHtml.IOptions = {
  allowedTags: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "br", "strong", "em", "u", "s", "sub", "sup", "span", "a", "mark", "ul", "ol", "li", "table", "tbody", "thead", "tr", "th", "td", "colgroup", "col", "blockquote"],
  allowedAttributes: {
    "*": ["style"],
    a: ["href"],
    th: ["colspan", "rowspan", "colwidth", "style"],
    td: ["colspan", "rowspan", "colwidth", "style"],
    ol: ["start"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedStyles: {
    "*": {
      color: COLOR,
      "background-color": COLOR,
      "font-size": [/^\d+(\.\d+)?(pt|px|em|rem|%)$/],
      "font-family": [/^[\w \-,"']+$/],
      "text-align": [/^(left|right|center|justify)$/],
    },
  },
  transformTags: { b: "strong", i: "em", strike: "s", del: "s", div: "p" },
};

/** Cleans a formatted transcript (HTML) before it is stored or shown. */
export function cleanDoc(html: string): string {
  return sanitizeHtml(html, options).trim();
}

/** A plain-text transcript as formatted-transcript HTML, one paragraph per line. */
export function textToDoc(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => `<p>${esc(l)}</p>`).join("");
}
