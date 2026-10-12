import { ArrowLeft, CalendarClock, CircleCheck, Clock, Download, Hourglass, Languages, MessageSquareWarning, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MediaPlayer from "@/components/MediaPlayer";
import StatusBadge, { jobBadge } from "@/components/StatusBadge";
import { MediaRemoved, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDeadline, formatDuration, formatRelative, formatUGX } from "@/lib/format";
import Editor from "./Editor";
import { jobPayLabel } from "@/lib/pay";

export const metadata: Metadata = { title: "Edit transcript" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("USER");
  const { id } = await params;
  const job = await db.job.findUnique({ where: { id } });
  if (!job || job.assigneeId !== user.id) notFound();
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
            <StatusBadge status={jobBadge(job)} />
            <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> {formatDuration(job.durationSeconds)}</span>
            <span className="inline-flex items-center gap-1.5"><Wallet className="size-3.5" /> {jobPayLabel(job)}{job.fixedPay == null ? " expected" : ""}</span>
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
      {job.status === "ASSIGNED" && job.reviewNote && (
        <div className="mb-4 rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-900 ring-1 ring-orange-600/15">
          <p className="flex items-center gap-2 font-medium"><MessageSquareWarning className="size-4 shrink-0" /> The admin reviewed this {formatRelative(job.reviewedAt)} and asked for changes:</p>
          <p className="mt-1 whitespace-pre-line">{job.reviewNote}</p>
          <p className="mt-2 text-xs text-orange-800">Make the changes below and submit again.</p>
        </div>
      )}
      {job.status === "ASSIGNED" ? (
        <Editor jobId={job.id} mediaType={job.mediaType} initial={job.editedTranscript} original={job.originalTranscript} seconds={job.durationSeconds} fixedPay={job.fixedPay} />
      ) : (
        <div className="space-y-4">
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ring-1 ${job.approvedAt ? "bg-emerald-50 text-emerald-800 ring-emerald-600/15" : "bg-sky-50 text-sky-800 ring-sky-600/15"}`}>
            {job.approvedAt ? <CircleCheck className="size-5 shrink-0" /> : <Hourglass className="size-5 shrink-0" />}
            <span>
              {job.approvedAt
                ? `Approved ${formatRelative(job.approvedAt)}. Nothing more to do.`
                : `You submitted this on ${formatDate(job.submittedAt)}. It's waiting for the admin's review; you'll see any requested changes here.`}
            </span>
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
