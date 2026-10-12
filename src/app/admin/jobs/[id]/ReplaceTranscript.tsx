"use client";

import { FileUp, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Modal, Spinner } from "@/components/client";

/** Lets an admin swap in the right transcript after uploading the wrong one. */
export default function ReplaceTranscript({ jobId, assignee, hasEdits }: { jobId: string; assignee: string | null; hasEdits: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (busy) return;
    setOpen(false);
    setFile(null);
  };

  async function replace() {
    if (!file) return;
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const res = await fetch(`/api/jobs/${jobId}/original`, { method: "POST", body: data });
      const body = await res.json().catch(() => ({ error: "Couldn't replace the transcript. Try again." }));
      if (!res.ok) return void toast.error(body.error ?? "Couldn't replace the transcript. Try again.");
      toast.success(assignee ? `Transcript replaced. ${assignee} was told.` : "Transcript replaced.");
      setOpen(false);
      setFile(null);
      router.refresh();
    } catch {
      toast.error("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <RefreshCw className="size-3.5" /> Replace transcript
      </button>
      <Modal
        open={open}
        onClose={close}
        title="Replace the transcript?"
        description="Use this if you uploaded the wrong transcript. The job's details, pay and who has it stay the same."
      >
        {hasEdits && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {assignee ?? "A transcriber"} has already edited this transcript. Those edits are replaced too and can&apos;t be brought back. Download the current draft first if you need it.
          </p>
        )}
        {assignee && <p className="mb-4 text-sm text-slate-600">{assignee} gets a notification that the transcript changed.</p>}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 hover:border-brand-400">
          <FileUp className="size-4 shrink-0 text-brand-600" />
          <span className="min-w-0 flex-1 truncate">{file ? file.name : "Choose the correct .docx or .txt file"}</span>
          <input type="file" accept=".docx,.txt" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="New transcript file" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={close} disabled={busy}>Cancel</button>
          <button type="button" className={hasEdits ? "btn-danger" : "btn"} onClick={replace} disabled={!file || busy}>
            {busy ? <Spinner /> : <RefreshCw className="size-4" />} Replace transcript
          </button>
        </div>
      </Modal>
    </>
  );
}
