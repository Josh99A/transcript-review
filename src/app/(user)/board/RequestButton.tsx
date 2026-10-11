"use client";

import { Hand } from "lucide-react";
import { useState } from "react";
import { cancelRequest, requestJob } from "@/app/actions";
import { ActionForm, Modal } from "@/components/client";

/** Request a job from the board (with an optional note), or withdraw a pending request. */
export default function RequestButton({ jobId, title, status }: { jobId: string; title: string; status: "PENDING" | "APPROVED" | "DECLINED" | null }) {
  const [open, setOpen] = useState(false);
  if (status === "PENDING") {
    return (
      <ActionForm action={cancelRequest} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset">Requested · waiting for an admin</span>
        <button className="btn-ghost btn-sm">Withdraw</button>
      </ActionForm>
    );
  }
  return (
    <>
      <button type="button" className="btn w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Hand className="size-4" /> {status === "DECLINED" ? "Request again" : "Request this job"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Request “${title}”?`} description="An admin will review your request. If they pick you, it moves into My jobs.">
        <ActionForm action={requestJob} onDone={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="jobId" value={jobId} />
          <div>
            <label className="label" htmlFor={`note-${jobId}`}>Note to the admin <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea className="input h-20" id={`note-${jobId}`} name="note" maxLength={500} placeholder="e.g. I speak Luganda and can finish by Friday." />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn">Send request</button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}
