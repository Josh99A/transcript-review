"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderInput } from "lucide-react";
import { toast } from "sonner";
import { groupJobs } from "@/app/actions";
import { ProjectField } from "./JobFields";
import { Spinner } from "./client";

/** Bulk organisation of the jobs in the current list, including completed jobs. */
export default function GroupJobs({ jobs, groups }: { jobs: { id: string; title: string }[]; groups: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [group, setGroup] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const visible = jobs.filter((job) => selected.has(job.id));
  if (!jobs.length) return null;
  return (
    <details className="border-b border-slate-100 px-4 py-3 sm:px-5">
      <summary className="cursor-pointer text-sm font-medium text-brand-700">Organise jobs into groups</summary>
      <form className="mt-4 space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        visible.forEach((job) => data.append("jobId", job.id));
        start(async () => {
          const result = await groupJobs(data);
          if (result?.error) {
            toast.error(result.error);
            return;
          }
          toast.success(result?.ok ?? "Group saved.");
          setSelected(new Set());
          router.refresh();
        });
      }}>
        <fieldset disabled={pending} className="space-y-3">
          <p className="text-sm text-slate-500">Choose jobs below, then type a new group or choose an existing one. Leave the group empty to ungroup them.</p>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="size-4" checked={visible.length === jobs.length} onChange={(event) => setSelected(event.target.checked ? new Set(jobs.map((job) => job.id)) : new Set())} />
            Select all {jobs.length} jobs in this list
          </label>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {jobs.map((job) => (
              <label key={job.id} className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={selected.has(job.id)} onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected((previous) => {
                    const next = new Set(previous);
                    if (checked) next.add(job.id); else next.delete(job.id);
                    return next;
                  });
                }} />
                {job.title}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1"><label className="label" htmlFor="bulk-group">Destination group</label><ProjectField id="bulk-group" projects={groups} value={group} onChange={setGroup} /></div>
            <button className="btn" disabled={!visible.length}>
              {pending ? <Spinner /> : <FolderInput className="size-4" aria-hidden />}
              {group.trim() ? "Move" : "Ungroup"} {visible.length} selected
            </button>
          </div>
          <p className="hint">Approved jobs also move to the matching folder in Google Drive when it is connected.</p>
        </fieldset>
      </form>
    </details>
  );
}
