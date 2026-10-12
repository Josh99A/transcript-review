import { BookOpenCheck } from "lucide-react";
import { formatRelative } from "@/lib/format";
import RichText from "./RichText";

/** The standing transcription rules, shown on every job. */
/** `updatedAt` after `since` (e.g. when the job was assigned) adds an "Updated" tag, so changes don't go unnoticed. */
export default function Guidelines({ html, open = true, updatedAt, since, children }: { html: string; open?: boolean; updatedAt?: Date | null; since?: Date | null; children?: React.ReactNode }) {
  const fresh = !!updatedAt && !!since && updatedAt > since;
  if (!html && !children) return null;
  return (
    <details open={open} className="group mb-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
        <BookOpenCheck className="size-4 shrink-0 text-brand-600" /> Transcription guidelines
        {fresh && <UpdatedTag at={updatedAt} />}
        <span className="ml-auto text-xs font-normal text-brand-600 group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs font-normal text-slate-500 group-open:inline">Hide</span>
      </summary>
      {html ? <RichText html={html} className="mt-2 leading-6" /> : <p className="mt-2 text-slate-400">No guidelines yet.</p>}
      {children}
    </details>
  );
}

export function UpdatedTag({ at }: { at: Date | null | undefined }) {
  return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset">Updated {formatRelative(at)}</span>;
}
