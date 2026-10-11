import { ArrowLeft, CalendarClock, CircleCheck, Clock, Download, Languages, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MediaPlayer from "@/components/MediaPlayer";
import StatusBadge from "@/components/StatusBadge";
import { MediaRemoved, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDeadline, formatDuration, formatUGX } from "@/lib/format";
import { earningsFor } from "@/lib/pay";
import Editor from "./Editor";

export const metadata: Metadata = { title: "Edit transcript" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("USER");
  const { id } = await params;
  const job = await db.job.findUnique({ where: { id } });
  if (!job || job.assigneeId !== user.id) notFound();
  const pay = earningsFor(job.durationSeconds);
  const due = job.deadline && job.status === "ASSIGNED" ? formatDeadline(job.deadline) : null;

  return (
    <>
      <PageHeader
        back={
          <Link href="/jobs" className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" /> My jobs
          </Link>
        }
        title={job.title}
        description={
          <span className="num flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusBadge status={job.status} />
            <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> {formatDuration(job.durationSeconds)}</span>
            <span className="inline-flex items-center gap-1.5"><Wallet className="size-3.5" /> {formatUGX(pay)}</span>
            {job.language && <span className="inline-flex items-center gap-1.5"><Languages className="size-3.5" /> {job.language}</span>}
            {due && <span className={`inline-flex items-center gap-1.5 ${due.overdue ? "text-red-700" : due.soon ? "text-amber-700" : ""}`}><CalendarClock className="size-3.5" /> {due.text}</span>}
          </span>
        }
      />
      {job.description && (
        <div className="mb-4 rounded-xl bg-brand-50/60 px-4 py-3 text-sm whitespace-pre-line text-slate-700 ring-1 ring-brand-600/10">
          <span className="font-medium text-slate-900">Notes from the admin: </span>{job.description}
        </div>
      )}
      {job.status === "ASSIGNED" ? (
        <Editor jobId={job.id} mediaType={job.mediaType} initial={job.editedTranscript} original={job.originalTranscript} pay={pay} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/15">
            <CircleCheck className="size-5 shrink-0" />
            <span>You submitted this on {formatDate(job.submittedAt)}. It&apos;s read-only unless an admin sends it back.</span>
            <a href={`/api/jobs/${job.id}/transcript`} className="btn-secondary btn-sm ml-auto"><Download className="size-3.5" /> .txt</a>
          </div>
          {job.mediaRemovedAt ? <MediaRemoved at={job.mediaRemovedAt} /> : <div className="card p-4"><MediaPlayer jobId={job.id} mediaType={job.mediaType} /></div>}
          <div className="card px-5 py-4">
            <pre className="font-mono text-[15px] leading-7 whitespace-pre-wrap text-slate-800">{job.editedTranscript}</pre>
          </div>
        </div>
      )}
    </>
  );
}
