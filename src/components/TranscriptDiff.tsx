"use client";

import { diffWords } from "diff";
import { useMemo, useState } from "react";
import { docText } from "@/lib/docText";
import DocView from "./DocView";
import TranscriptView from "./TranscriptView";

type View = "changes" | "final" | "original";

/** Shows what the transcriber changed, word by word, plus the plain before/after texts. */
/** For formatted transcripts the comparison is of the words; the other tabs show the formatting. Their HTML must be cleaned on the server. */
export default function TranscriptDiff({ original, edited, finalLabel, format = "text" }: { original: string; edited: string; finalLabel: string; format?: string }) {
  const rich = format === "html";
  const [view, setView] = useState<View>("changes");
  const parts = useMemo(() => (rich ? diffWords(docText(original), docText(edited)) : diffWords(original, edited)), [rich, original, edited]);
  const stats = useMemo(() => {
    let added = 0,
      removed = 0;
    for (const p of parts) {
      const n = p.value.trim() ? p.value.trim().split(/\s+/).length : 0;
      if (p.added) added += n;
      else if (p.removed) removed += n;
    }
    return { added, removed };
  }, [parts]);
  const tabs: [View, string][] = [["changes", "Changes"], ["final", finalLabel], ["original", "Original"]];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1" role="tablist">
          {tabs.map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="num ml-auto flex gap-3 text-xs font-medium">
          <span className="text-emerald-700">+{stats.added} words</span>
          <span className="text-red-700">−{stats.removed} words</span>
        </div>
      </div>
      <div className="max-h-[36rem] overflow-auto px-5 py-4 font-mono text-[14px] leading-7 whitespace-pre-wrap text-slate-800">
        {view === "changes" ? (
          stats.added + stats.removed === 0 ? (
            <p className="font-sans text-sm text-slate-500">No changes from the original yet.</p>
          ) : (
            parts.map((p, i) =>
              p.added ? (
                <ins key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-900 no-underline">{p.value}</ins>
              ) : p.removed ? (
                <del key={i} className="rounded bg-red-100 px-0.5 text-red-800">{p.value}</del>
              ) : (
                <span key={i}>{p.value}</span>
              ),
            )
          )
        ) : (
          rich ? (
            <DocView html={view === "final" ? edited : original} className="font-sans whitespace-pre-wrap" />
          ) : (
            <TranscriptView text={view === "final" ? edited : original} className="text-[14px] whitespace-normal" />
          )
        )}
      </div>
    </>
  );
}
