import { FolderOpen, Languages } from "lucide-react";

/** Project badge and language for a job, shown on cards and job pages. */
export default function JobTags({ job, className = "" }: { job: { project: string | null; language: string | null }; className?: string }) {
  if (!job.project && !job.language) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {job.project && (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-600/15 ring-inset">
          <FolderOpen className="size-3 shrink-0" aria-hidden /><span className="truncate">{job.project}</span>
        </span>
      )}
      {job.language && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          <Languages className="size-3 shrink-0" aria-hidden />{job.language}
        </span>
      )}
    </span>
  );
}
