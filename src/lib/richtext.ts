import sanitizeHtml from "sanitize-html";

// Instructions are stored as a small, safe subset of HTML: paragraphs, line breaks, bold, italic,
// underline, highlight and lists. Anything else is stripped on save and again on display.
const options: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "u", "mark", "ul", "ol", "li"],
  allowedAttributes: {},
  transformTags: {
    b: "strong",
    i: "em",
    div: "p",
    h1: "p",
    h2: "p",
    h3: "p",
    // The editor highlights with a background colour; keep that as a highlight and drop other spans.
    span: (_tag, attribs) => {
      const bg = /background(?:-color)?\s*:\s*([^;]+)/i.exec(attribs.style ?? "")?.[1]?.trim().toLowerCase();
      return { tagName: bg && !/^(transparent|initial|inherit|none|rgba\(0, 0, 0, 0\))$/.test(bg) ? "mark" : "span", attribs: {} };
    },
  },
  exclusiveFilter: (frame) => frame.tag === "p" && !frame.text.trim() && !frame.mediaChildren.length && !/<br/i.test(frame.text),
};

const looksLikeHtml = (s: string) => /<\/?(p|br|strong|em|u|mark|ul|ol|li|b|i|div|span)\b/i.test(s);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Cleans what an admin typed in a rich-text field, ready to store. */
export function cleanRich(input: string): string {
  const raw = input.trim();
  let html = looksLikeHtml(raw) ? sanitizeHtml(raw, options).trim() : escape(raw).replace(/\r?\n/g, "<br>");
  // Always store with a tag, so it's never mistaken for older plain text.
  if (html && !looksLikeHtml(html)) html = `<p>${html}</p>`;
  return richText(html) ? html : "";
}

/** Safe HTML to show. Older plain-text values keep their line breaks. */
export function richHtml(stored: string | null | undefined): string {
  if (!stored) return "";
  return looksLikeHtml(stored) ? sanitizeHtml(stored, options) : escape(stored).replace(/\r?\n/g, "<br>");
}

/** The words alone, for previews and notifications. */
export function richText(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!looksLikeHtml(stored)) return stored.trim();
  const spaced = stored.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li)>/gi, "\n");
  const text = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} });
  return text
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
