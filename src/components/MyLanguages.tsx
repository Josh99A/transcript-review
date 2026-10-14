"use client";

import { Languages, Pencil } from "lucide-react";
import { useState } from "react";
import { saveLanguages } from "@/app/actions";
import { LANGUAGES } from "@/lib/jobFields";
import { ActionForm } from "./client";

/** Card where transcribers list the languages they can work in, so admins can match them to jobs. */
export default function MyLanguages({ languages }: { languages: string[] }) {
  const [editing, setEditing] = useState(languages.length === 0);
  const extra = languages.filter((l) => !(LANGUAGES as readonly string[]).includes(l));
  return (
    <section className={`card ${languages.length ? "" : "border-amber-300"}`}>
      <div className="card-header">
        <Languages className="size-4.5 text-brand-600" />
        <h2 className="card-title">Languages you can transcribe</h2>
        {languages.length > 0 && !editing && (
          <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Change</button>
        )}
      </div>
      <div className="card-body">
        {!editing ? (
          <ul className="flex flex-wrap gap-1.5">
            {languages.map((l) => <li key={l} className="rounded-full bg-brand-50 px-2.5 py-1 text-sm font-medium text-brand-700">{l}</li>)}
          </ul>
        ) : (
          <ActionForm action={saveLanguages} onDone={() => setEditing(false)} className="space-y-3">
            <p className="text-sm text-slate-600">Tick every language you can work in. Admins see this when they give out jobs.</p>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <label key={l} className="cursor-pointer">
                  <input type="checkbox" name="languages" value={l} defaultChecked={languages.includes(l)} className="peer sr-only" />
                  <span className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 ring-inset peer-checked:bg-brand-600 peer-checked:text-white peer-checked:ring-brand-600 peer-focus-visible:outline-2 peer-focus-visible:outline-brand-500">{l}</span>
                </label>
              ))}
            </div>
            <div>
              <label className="label" htmlFor="other-languages">Others <span className="font-normal text-slate-400">(optional, separate with commas)</span></label>
              <input className="input" id="other-languages" name="other" defaultValue={extra.join(", ")} maxLength={300} placeholder="e.g. Luo, French" />
            </div>
            <div className="flex justify-end gap-2">
              {languages.length > 0 && <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>}
              <button className="btn">Save languages</button>
            </div>
          </ActionForm>
        )}
      </div>
    </section>
  );
}
