"use client";

import { useEffect, useState, useTransition } from "react";
import { saveDraft, submitJob } from "@/app/actions";

export default function Editor({ jobId, initial, original }: { jobId: string; initial: string; original: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = text !== saved;

  // Autosave 5 seconds after the last keystroke.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(async () => {
      const res = await saveDraft(jobId, text);
      if (!res?.error) setSaved(text);
    }, 5_000);
    return () => clearTimeout(t);
  }, [dirty, text, jobId]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function save() {
    startTransition(async () => {
      const res = await saveDraft(jobId, text);
      setMessage(res ?? null);
      if (!res?.error) setSaved(text);
    });
  }

  function submit() {
    if (!confirm("Submit this transcript? You won't be able to edit it afterwards.")) return;
    startTransition(async () => {
      const res = await submitJob(jobId, text);
      if (res) setMessage(res);
    });
  }

  return (
    <div className="card space-y-3">
      <textarea
        className="input h-[60vh] font-mono leading-relaxed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck
        aria-label="Transcript"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary" onClick={save} disabled={pending || !dirty}>Save draft</button>
        <button className="btn-secondary" onClick={() => confirm("Discard all your changes and restore the original transcript?") && setText(original)} disabled={pending}>
          Restore original
        </button>
        <span className="text-xs text-slate-500">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <button className="btn ml-auto" onClick={submit} disabled={pending}>Submit transcript</button>
      </div>
      {message?.error && <p className="text-sm text-red-600">{message.error}</p>}
      {message?.ok && <p className="text-sm text-emerald-700">{message.ok}</p>}
    </div>
  );
}
