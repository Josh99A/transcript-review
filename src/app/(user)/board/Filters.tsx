"use client";

import { SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";

type Option = { value: string; label: string };
type Field = { name: string; label: string; value: string; options: Option[] };

/** Filter and sort controls for the job board; each change reloads the list. */
export default function Filters({ fields, active }: { fields: Field[]; active: boolean }) {
  return (
    <form className="card mb-4 p-3 sm:p-4" onChange={(e) => e.currentTarget.requestSubmit()}>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
        <SlidersHorizontal className="size-4 text-slate-400" aria-hidden /> Filter jobs
        {active && (
          <Link href="/board" className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            <X className="size-3.5" aria-hidden /> Clear
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {fields.map((f) => (
          <label key={f.name} className="min-w-0">
            <span className="mb-1 block text-xs text-slate-500">{f.label}</span>
            <select name={f.name} defaultValue={f.value} className="input py-1.5 text-sm">
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <noscript><button className="btn-secondary mt-2">Apply</button></noscript>
    </form>
  );
}
