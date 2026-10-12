import { BookOpenCheck } from "lucide-react";
import RichText from "./RichText";

/** The standing transcription rules, shown on every job. */
export default function Guidelines({ html, open = true, children }: { html: string; open?: boolean; children?: React.ReactNode }) {
  if (!html && !children) return null;
  return (
    <details open={open} className="group mb-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
        <BookOpenCheck className="size-4 shrink-0 text-brand-600" /> Transcription guidelines
        <span className="ml-auto text-xs font-normal text-brand-600 group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs font-normal text-slate-500 group-open:inline">Hide</span>
      </summary>
      {html ? <RichText html={html} className="mt-2 leading-6" /> : <p className="mt-2 text-slate-400">No guidelines yet.</p>}
      {children}
    </details>
  );
}
