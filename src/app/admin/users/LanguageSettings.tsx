import { Languages, X } from "lucide-react";
import { addLanguage, removeLanguage } from "@/app/actions";
import { ActionForm } from "@/components/client";

/** The languages offered on jobs and to transcribers, which admins can add to or trim. */
export default function LanguageSettings({ languages }: { languages: string[] }) {
  return (
    <section className="card mt-6">
      <div className="card-header">
        <Languages className="size-4.5 text-brand-600" />
        <h2 className="card-title">Languages</h2>
        <span className="text-xs text-slate-500">Offered when uploading jobs and for transcribers to tick</span>
      </div>
      <div className="card-body space-y-4">
        <ul className="flex flex-wrap gap-2">
          {languages.map((l) => (
            <li key={l} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-sm text-slate-800">
              {l}
              <ActionForm action={removeLanguage} confirm={{ title: `Remove ${l} from the list?`, description: "People who already listed it keep it, and jobs in it keep their language.", label: "Remove", danger: true }}>
                <input type="hidden" name="language" value={l} />
                <button className="inline-flex size-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-red-700" aria-label={`Remove ${l}`}><X className="size-3.5" /></button>
              </ActionForm>
            </li>
          ))}
          {languages.length === 0 && <li className="text-sm text-slate-500">No languages on the list. Transcribers can still type their own.</li>}
        </ul>
        <ActionForm action={addLanguage} className="flex max-w-md gap-2">
          <label className="sr-only" htmlFor="new-language">Language to add</label>
          <input className="input" id="new-language" name="language" maxLength={40} placeholder="e.g. Luganda" required />
          <button className="btn shrink-0">Add</button>
        </ActionForm>
      </div>
    </section>
  );
}
