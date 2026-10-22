"use client";

import { Plus, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { fromBlocks, tableToText, toBlocks, type Block } from "@/lib/transcriptTables";

/** A textarea that grows with its text, so the page scrolls rather than each box. */
function Grow({ value, onChange, className, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} onChange={(e) => onChange(e.target.value)} className={`block w-full resize-none overflow-hidden ${className ?? ""}`} spellCheck {...rest} />;
}

/** The transcript as text with editable tables in between. Every edit is written back into the one transcript text. */
export default function BlockEditor({ text, onChange }: { text: string; onChange: (next: string, typing: boolean) => void }) {
  const blocks = useMemo(() => toBlocks(text), [text]);
  const update = (i: number, block: Block, typing = true) => onChange(fromBlocks(blocks.map((b, j) => (j === i ? block : b))), typing);
  const setRows = (i: number, rows: string[][], typing = true) => update(i, { kind: "table", rows, raw: tableToText(rows) }, typing);
  let tableNo = 0;

  return (
    <div className="min-h-[55vh] space-y-3 bg-white px-5 py-4">
      {blocks.map((b, i) => {
        if (b.kind === "text") {
          const edge = i === 0 || i === blocks.length - 1;
          return (
            <Grow
              key={i}
              value={b.text ?? ""}
              // An empty box that wasn't in the transcript stays out of it.
              onChange={(v) => update(i, { kind: "text", text: v === "" && b.text === null ? null : v })}
              placeholder={b.text === null ? (edge ? "Type here…" : "Type between the tables…") : undefined}
              aria-label="Transcript text"
              className={`border-0 bg-transparent p-0 font-mono text-base leading-7 text-slate-800 placeholder:text-slate-300 focus:ring-0 focus:outline-none sm:text-[15px] ${b.text === null ? "text-sm" : ""}`}
            />
          );
        }
        const n = ++tableNo;
        const width = Math.max(1, ...b.rows.map((r) => r.length));
        return (
          <div key={i} className="rounded-lg ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" aria-label={`Table ${n}`}>
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri} className={ri === 0 ? "bg-slate-50" : "border-t border-slate-200"}>
                      {Array.from({ length: width }, (_, ci) => (
                        <td key={ci} className="min-w-32 border-l border-slate-200 align-top first:border-l-0">
                          <Grow
                            value={row[ci] ?? ""}
                            onChange={(v) => setRows(i, b.rows.map((r, x) => (x === ri ? Array.from({ length: width }, (_, y) => (y === ci ? v : (r[y] ?? ""))) : r)))}
                            aria-label={`Table ${n}, row ${ri + 1}, column ${ci + 1}`}
                            className={`border-0 bg-transparent px-2.5 py-2 leading-6 text-slate-800 focus:bg-brand-50/40 focus:ring-0 focus:outline-none ${ri === 0 ? "font-semibold" : ""}`}
                          />
                        </td>
                      ))}
                      <td className="w-8 border-l border-slate-200 align-top">
                        {ri > 0 && (
                          <button type="button" className="btn-ghost size-8 px-0 text-slate-400 hover:text-red-700" onClick={() => setRows(i, b.rows.filter((_, x) => x !== ri), false)} aria-label={`Delete row ${ri + 1} of table ${n}`} title="Delete row">
                            <X className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 px-2 py-1.5">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setRows(i, [...b.rows, Array(width).fill("")], false)}>
                <Plus className="size-3.5" /> Add row
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
