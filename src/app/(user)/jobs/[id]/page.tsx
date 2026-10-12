import DocView from "@/components/DocView";
import TranscriptView from "@/components/TranscriptView";
import { cleanDoc } from "@/lib/richDoc";
import { ArrowLeft, CalendarClock, CircleCheck, Clock, Download, Hourglass, LifeBuoy, LogOut, MessageSquareWarning, Send, Undo2, Wallet } from "lucide-react";
import JobTags from "@/components/JobTags";
import RichText from "@/components/RichText";
import Guidelines, { UpdatedTag } from "@/components/Guidelines";
import { getGuidelinesInfo } from "@/lib/guidelines";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { leaveJob, raiseIssue, withdrawSubmission } from "@/app/actions";
import IssueThread, { IssueStatus, issueInclude } from "@/components/IssueThread";
import { ActionForm, OpenLinkedDetails } from "@/components/client";
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
  const [job, guidelines, issues] = await Promise.all([
    db.job.findUnique({ where: { id }, include: { earnings: { where: { userId: user.id } } } }),
    getGuidelinesInfo(),
    db.issue.findMany({ where: { jobId: id, userId: user.id }, include: issueInclude, orderBy: { createdAt: "desc" } }),
  ]);
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
        actions={<a href="#issues" className="btn-secondary"><LifeBuoy className="size-4" /> Report a problem</a>}
        description={
          <span className="num flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusBadge status={jobBadge(job)} />
            <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> {formatDuration(job.durationSeconds)}</span>
            <span className="inline-flex items-center gap-1.5"><Wallet className="size-3.5" /> {job.status === "SUBMITTED" && job.earnings[0] ? `${formatUGX(job.earnings[0].amount)} ${job.approvedAt ? "earned" : "awaiting approval"}` : `${jobPayLabel(job)} expected`}</span>
            <JobTags job={job} />
            {due && <span className={`inline-flex items-center gap-1.5 ${due.overdue ? "text-red-700" : due.soon ? "text-amber-700" : ""}`}><CalendarClock className="size-3.5" /> {due.text}</span>}
          </span>
        }
      />
      {job.description && (
        <div id="instructions" className="mb-4 rounded-xl bg-brand-50/60 px-4 py-3 text-sm text-slate-700 ring-1 ring-brand-600/10">
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
            Notes from the admin
            {job.instructionsUpdatedAt && job.assignedAt && job.instructionsUpdatedAt > job.assignedAt && <UpdatedTag at={job.instructionsUpdatedAt} />}
          </p>
          <RichText html={job.description} className="mt-1" />
        </div>
      )}
      {job.status === "ASSIGNED" && job.reviewNote && (
        <div className="mb-4 rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-900 ring-1 ring-orange-600/15">
          <p className="flex items-center gap-2 font-medium"><MessageSquareWarning className="size-4 shrink-0" /> The admin reviewed this {formatRelative(job.reviewedAt)} and asked for changes:{job.reviewNoteEditedAt && <UpdatedTag at={job.reviewNoteEditedAt} />}</p>
          <RichText html={job.reviewNote} className="mt-1" />
          <p className="mt-2 text-xs text-orange-800">Make the changes below and submit again.</p>
        </div>
      )}
      <Guidelines html={guidelines.html} updatedAt={guidelines.updatedAt} since={job.assignedAt} open={job.status === "ASSIGNED"} />
      {job.status === "ASSIGNED" ? (
        <Editor jobId={job.id} mediaType={job.mediaType} initial={job.editedTranscript} original={job.originalTranscript} seconds={job.durationSeconds} ratePerHour={job.ratePerHour} format={job.transcriptFormat} />
      ) : (
        <div className="space-y-4">
          <div className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm ring-1 ${job.approvedAt ? "bg-emerald-50 text-emerald-800 ring-emerald-600/15" : "bg-sky-50 text-sky-800 ring-sky-600/15"}`}>
            {job.approvedAt ? <CircleCheck className="size-5 shrink-0" /> : <Hourglass className="size-5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{job.approvedAt ? "Approved" : "Submitted, awaiting review"}</p>
              <p>
                {job.approvedAt
                  ? `You submitted this on ${formatDate(job.submittedAt)} and it was approved ${formatRelative(job.approvedAt)}. Nothing more to do.`
                  : `You submitted this on ${formatDate(job.submittedAt)}. An admin will review it, and you'll be notified if they approve it or ask for changes.`}
              </p>
              {job.earnings[0] && <p className="num mt-0.5 text-xs opacity-80">{job.approvedAt ? `${formatUGX(job.earnings[0].amount)} added to your earnings for this job.` : `${formatUGX(job.earnings[0].amount)} for this job is awaiting approval. It's added to your earnings when an admin approves it.`}</p>}
            </div>
            <a href={`/api/jobs/${job.id}/transcript`} className="btn-secondary btn-sm"><Download className="size-3.5" /> .txt</a>
          </div>
          {!job.approvedAt && !job.mediaRemovedAt && (
            <ActionForm action={withdrawSubmission} className="card flex flex-wrap items-center gap-3 px-4 py-3" confirm={{ title: "Unsubmit this transcript?", description: "It goes back to In progress with your edits kept, and leaves the admin's review list. You can submit it again when you're ready.", label: "Unsubmit and edit" }}>
              <input type="hidden" name="jobId" value={job.id} />
              <p className="min-w-0 flex-1 text-sm text-slate-600">Made a mistake? Unsubmit it, fix it in the editor or upload a new file, then submit again. You can do this until an admin reviews it.</p>
              <button className="btn-secondary w-full sm:w-auto"><Undo2 className="size-4" /> Unsubmit</button>
            </ActionForm>
          )}
          {job.mediaRemovedAt ? <MediaRemoved at={job.mediaRemovedAt} /> : <div className="card p-4"><MediaPlayer jobId={job.id} mediaType={job.mediaType} /></div>}
          <div className="card px-5 py-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">What you submitted <span className="font-normal text-slate-500">(read only)</span></h2>
            {job.transcriptFormat === "html" ? <DocView html={cleanDoc(job.editedTranscript)} /> : <TranscriptView text={job.editedTranscript} />}
          </div>
        </div>
      )}

      <section id="issues" className="card mt-6 scroll-mt-4">
        <div className="card-header">
          <h2 className="card-title">Problems with this job?</h2>
          <p className="w-full text-sm text-slate-500">Tell the admins about bad audio, a wrong transcript, missing details or anything else. You&apos;ll be notified when they reply.</p>
        </div>
        <div className="card-body space-y-5">
          <OpenLinkedDetails />
          {issues.map((i) => (
            <details key={i.id} id={`issue-${i.id}`} open={i.status === "OPEN"} className="scroll-mt-4 rounded-xl ring-1 ring-slate-200">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 font-medium break-words text-slate-900">{i.subject}</span>
                <IssueStatus status={i.status} />
                <span className="ml-auto text-xs text-slate-500">{i.messages.length} message{i.messages.length === 1 ? "" : "s"}</span>
              </summary>
              <div className="border-t border-slate-100 px-4 py-3"><IssueThread issue={i} admin={false} /></div>
            </details>
          ))}
          <ActionForm action={raiseIssue} resetOnSuccess>
            <input type="hidden" name="jobId" value={job.id} />
            <div className="space-y-3">
              {issues.length > 0 && <p className="border-t border-slate-100 pt-4 text-sm font-semibold text-slate-900">Raise another issue</p>}
              <div>
                <label className="label" htmlFor="issue-subject">What&apos;s the problem?</label>
                <input className="input" id="issue-subject" name="subject" required maxLength={120} placeholder="e.g. Audio cuts out after 12:40" />
              </div>
              <div>
                <label className="label" htmlFor="issue-body">Details</label>
                <textarea className="input h-24" id="issue-body" name="body" required maxLength={3000} placeholder="What happened, and where in the audio or transcript." />
              </div>
              <button className="btn w-full sm:w-auto"><Send className="size-4" /> Send to admins</button>
            </div>
          </ActionForm>
        </div>
      </section>

      {job.status === "ASSIGNED" && (
        <ActionForm
          action={leaveJob}
          redirectTo="/jobs"
          className="card mt-6 px-5 py-4"
          confirm={{ title: "Leave this job?", description: "It goes back on Find work so someone else can take it. Your edits so far stay with the job, and you won't be paid for it.", label: "Leave job", danger: true }}
        >
          <input type="hidden" name="jobId" value={job.id} />
          <div className="space-y-3">
            <div>
              <p className="font-medium text-slate-900">Can&apos;t finish this job?</p>
              <p className="mt-0.5 text-sm text-slate-500">Give it back so someone else can take it. Your edits so far stay with the job, and you won&apos;t be paid for it.</p>
            </div>
            <div>
              <label className="label" htmlFor="leave-reason">Reason <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea className="input h-20" id="leave-reason" name="reason" maxLength={1000} placeholder="e.g. I don't understand the second language well enough." />
            </div>
            <button className="btn-danger w-full sm:w-auto"><LogOut className="size-4" /> Leave this job</button>
          </div>
        </ActionForm>
      )}
    </>
  );
}
