import { toBlocks } from "@/lib/transcriptTables";

/** A transcript to read: its text as written, with its pipe tables drawn as tables. */
export default function TranscriptView({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-3 font-mono text-[15px] leading-7 text-slate-800 ${className}`}>
      {toBlocks(text).map((b, i) =>
        b.kind === "text" ? (
          b.text !== null && <div key={i} className="whitespace-pre-wrap">{b.text}</div>
        ) : (
          <div key={i} className="overflow-x-auto rounded-lg font-sans text-sm leading-6 ring-1 ring-slate-200">
            <table className="w-full border-collapse">
              <tbody>
                {b.rows.map((row, ri) => (
                  <tr key={ri} className={ri === 0 ? "bg-slate-50 font-semibold" : "border-t border-slate-200"}>
                    {Array.from({ length: Math.max(...b.rows.map((r) => r.length)) }, (_, ci) => (
                      <td key={ci} className="min-w-24 border-l border-slate-200 px-2.5 py-2 align-top whitespace-pre-wrap first:border-l-0">{row[ci] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}
