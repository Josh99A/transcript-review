"use client";

import { useState } from "react";

const OTHER = "__other";

/** Language picker with common choices and an "Other" box; posts the chosen language as `name`. */
export function LanguageField({ id, languages, name = "language", defaultValue = "", required, onChange }: { id: string; languages: string[]; name?: string; defaultValue?: string; required?: boolean; onChange?: (v: string) => void }) {
  const known = languages.includes(defaultValue);
  const [choice, setChoice] = useState(defaultValue ? (known ? defaultValue : OTHER) : "");
  const [other, setOther] = useState(known ? "" : defaultValue);
  const value = choice === OTHER ? other.trim() : choice;
  const update = (c: string, o: string) => onChange?.(c === OTHER ? o.trim() : c);
  return (
    <div className="space-y-2">
      <select id={id} className="input" value={choice} required={required} onChange={(e) => { setChoice(e.target.value); update(e.target.value, other); }}>
        <option value="">{required ? "Choose a language" : "Not set"}</option>
        {languages.map((l) => <option key={l} value={l}>{l}</option>)}
        <option value={OTHER}>Other…</option>
      </select>
      {choice === OTHER && (
        <input className="input" aria-label="Other language" value={other} maxLength={60} required={required} placeholder="Type the language, e.g. Luo and English" onChange={(e) => { setOther(e.target.value); update(choice, e.target.value); }} />
      )}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

/** Free-text project with suggestions from earlier jobs. */
export function ProjectField({ id, name = "project", defaultValue = "", projects, value, onChange }: { id: string; name?: string; defaultValue?: string; projects: string[]; value?: string; onChange?: (v: string) => void }) {
  return (
    <>
      <input className="input" id={id} name={name} list={`${id}-list`} maxLength={80} autoComplete="off" placeholder="e.g. Kampala health survey" {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : { defaultValue })} />
      <datalist id={`${id}-list`}>{projects.map((p) => <option key={p} value={p} />)}</datalist>
    </>
  );
}
