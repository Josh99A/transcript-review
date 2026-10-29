"use client";

import { Bold, Highlighter, Italic, List, ListOrdered, Underline } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Command = "bold" | "italic" | "underline" | "highlight" | "insertUnorderedList" | "insertOrderedList";

const tools: [Command, string, typeof Bold][] = [
  ["bold", "Bold", Bold],
  ["italic", "Italic", Italic],
  ["underline", "Underline", Underline],
  ["highlight", "Highlight", Highlighter],
  ["insertUnorderedList", "Bulleted list", List],
  ["insertOrderedList", "Numbered list", ListOrdered],
];

/** The highlight the selection sits in, if any. */
function markAround(root: HTMLElement) {
  let n = document.getSelection()?.anchorNode ?? null;
  while (n && n !== root) {
    if (n instanceof HTMLElement && n.tagName === "MARK") return n;
    n = n.parentNode;
  }
  return null;
}

const unwrap = (el: Element) => el.replaceWith(...Array.from(el.childNodes));

/** Highlights the selected text, or removes the highlight the cursor is in. */
function toggleHighlight(root: HTMLElement) {
  const sel = document.getSelection();
  const around = markAround(root);
  if (around) return unwrap(around);
  if (!sel || !sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;
  const mark = document.createElement("mark");
  mark.appendChild(range.extractContents());
  mark.querySelectorAll("mark").forEach(unwrap);
  range.insertNode(mark);
  // Carry on typing after the highlight, not inside it.
  sel.removeAllRanges();
  const r = document.createRange();
  r.setStartAfter(mark);
  r.collapse(true);
  sel.addRange(r);
}

/**
 * A small formatting editor for instructions: bold, italic, underline, highlight and lists.
 * The HTML goes into a hidden input named `name`; the server cleans it before storing.
 */
export default function RichTextEditor({ name, id, defaultValue = "", placeholder, minHeight = "6rem" }: { name: string; id?: string; defaultValue?: string; placeholder?: string; minHeight?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<Partial<Record<Command, boolean>>>({});
  const [empty, setEmpty] = useState(!defaultValue);

  useEffect(() => {
    if (box.current) box.current.innerHTML = defaultValue;
    if (field.current) field.current.value = defaultValue;
  }, [defaultValue]);

  const sync = () => {
    const el = box.current;
    if (!el || !field.current) return;
    field.current.value = el.innerHTML;
    setEmpty(!el.textContent?.trim() && !el.querySelector("li"));
  };

  const refresh = () => {
    const el = box.current;
    if (!el || !el.contains(document.getSelection()?.anchorNode ?? null)) return;
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      insertUnorderedList: document.queryCommandState("insertUnorderedList"),
      insertOrderedList: document.queryCommandState("insertOrderedList"),
      highlight: !!markAround(el),
    });
  };

  useEffect(() => {
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  });

  const run = (cmd: Command) => {
    box.current?.focus();
    if (cmd === "highlight") {
      if (box.current) toggleHighlight(box.current);
    } else {
      document.execCommand(cmd);
    }
    sync();
    refresh();
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
      <div className="flex flex-wrap gap-0.5 border-b border-slate-100 p-1" role="toolbar" aria-label="Formatting">
        {tools.map(([cmd, label, Icon]) => (
          <button
            key={cmd}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={!!active[cmd]}
            // Keep the selection in the text while clicking.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(cmd)}
            className={`grid size-9 place-items-center rounded-md transition sm:size-8 ${active[cmd] ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      <div className="relative">
        {empty && placeholder && <p className="pointer-events-none absolute inset-x-3 top-2 text-base text-slate-400 sm:text-sm">{placeholder}</p>}
        <div
          ref={box}
          id={id}
          role="textbox"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onBlur={sync}
          onKeyUp={refresh}
          onMouseUp={refresh}
          // Pasted text comes in plain, so stray styles from other apps don't follow it.
          onPaste={(e) => {
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          style={{ minHeight }}
          className="rich max-h-96 overflow-y-auto px-3 py-2 text-base text-slate-800 outline-none sm:text-sm"
        />
      </div>
      {/* Both fields are managed together by the effect/sync. A React defaultValue on a hidden
          input would overwrite edits when toolbar or selection state causes a rerender. */}
      <input ref={field} type="hidden" name={name} />
    </div>
  );
}
