import { ArrowLeft, Download, FileX2, Trash2, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assignJob, deleteJob, removeEarning, removeJobMedia, reopenJob, updateDuration } from "@/app/actions";
import { ActionForm, ConfirmAction } from "@/components/client";
import MediaPlayer from "@/components/MediaPlayer";
import StatusBadge from "@/components/StatusBadge";
import TranscriptDiff from "@/components/TranscriptDiff";
import { MediaRemoved, PageHeader, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBytes, formatDate, formatDuration, formatUGX } from "@/lib/format";
import { mediaSize } from "@/lib/media";
import { earningsFor } from "@/lib/pay";

export const metadata: Metadata = { title: "Job" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="num text-right text-slate-900">{children}</dd>
    </div>
  );
}

export default async function AdminJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [job, users] = await Promise.all([
    db.job.findUnique({
      where: { id },
      include: { assignee: true, earnings: { include: { user: { select: { name: true } } } } },
    }),
    db.user.findMany({ where: { role: "USER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!job) notFound();

  return (
    <>
      <PageHeader
        back={<Link href="/admin" className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Dashboard</Link>}
        title={job.title}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><StatusBadge status={job.status} /><span className="num">{formatDuration(job.durationSeconds)} · pays {formatUGX(earningsFor(job.durationSeconds))}</span></span>}
        actions={
          <a href={`/api/jobs/${job.id}/transcript`} className="btn-secondary"><Download className="size-4" /> Download .txt</a>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {job.mediaRemovedAt ? <MediaRemoved at={job.mediaRemovedAt} /> : <div className="card p-4"><MediaPlayer jobId={job.id} mediaType={job.mediaType} /></div>}
          <section className="card overflow-hidden">
            <div className="card-header"><h2 className="card-title">Transcript review</h2></div>
            <TranscriptDiff original={job.originalTranscript} edited={job.editedTranscript} finalLabel={job.status === "SUBMITTED" ? "Submitted" : "Current draft"} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="card">
            <div className="card-header"><h2 className="card-title">Assignment</h2></div>
            <div className="card-body space-y-4">
              {job.assignee && <UserCell name={job.assignee.name} sub={job.assignee.email} />}
              {job.status === "SUBMITTED" && job.mediaRemovedAt ? null : job.status === "SUBMITTED" ? (
                <ConfirmAction
                  action={reopenJob}
                  fields={{ jobId: job.id }}
                  trigger={<><Undo2 className="size-4" /> Send back for corrections</>}
                  triggerClassName="btn-secondary w-full"
                  title="Send this job back?"
                  description={`${job.assignee?.name ?? "The transcriber"} will be able to edit it again. Pay already credited stays, and resubmitting won't pay twice.`}
                  confirmLabel="Send back"
                />
              ) : (
                <ActionForm action={assignJob} className="space-y-2">
                  <input type="hidden" name="jobId" value={job.id} />
                  <label className="label" htmlFor="assigneeId">{job.assignee ? "Reassign to" : "Assign to"}</label>
                  <div className="flex gap-2">
                    <select className="input" id="assigneeId" name="assigneeId" defaultValue={job.assigneeId ?? ""}>
                      <option value="">Nobody</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <button className="btn shrink-0">Save</button>
                  </div>
                </ActionForm>
              )}
              <dl className="divide-y divide-slate-100 border-t border-slate-100">
                <Row label="Uploaded">{formatDate(job.createdAt)}</Row>
                <Row label="Assigned">{formatDate(job.assignedAt)}</Row>
                <Row label="Submitted">{formatDate(job.submittedAt)}</Row>
              </dl>
            </div>
          </section>

          <section className="card">
            <div className="card-header"><h2 className="card-title">Pay</h2></div>
            <div className="card-body space-y-4">
              {job.earnings.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing credited yet. {formatUGX(earningsFor(job.durationSeconds))} is credited when the transcript is submitted.</p>
              ) : (
                <ul className="space-y-2">
                  {job.earnings.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                      <span className="flex-1 text-emerald-900">{e.user.name}</span>
                      <span className="num font-semibold text-emerald-900">{formatUGX(e.amount)}</span>
                      <ConfirmAction
                        action={removeEarning}
                        fields={{ earningId: e.id }}
                        trigger={<Trash2 className="size-3.5" />}
                        triggerClassName="btn-ghost size-7 px-0 text-emerald-800 hover:bg-emerald-100"
                        title="Remove this pay?"
                        description={`${formatUGX(e.amount)} will be taken off ${e.user.name}'s earnings.`}
                        confirmLabel="Remove pay"
                        danger
                      />
                    </li>
                  ))}
                </ul>
              )}
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-brand-600 hover:text-brand-700">Correct the media length</summary>
                <ActionForm action={updateDuration} className="mt-3 space-y-2">
                  <input type="hidden" name="jobId" value={job.id} />
                  <div className="flex items-center gap-2">
                    <input className="input num w-20" name="minutes" type="number" min="0" defaultValue={Math.floor(job.durationSeconds / 60)} aria-label="Minutes" />
                    <span className="text-sm text-slate-500">min</span>
                    <input className="input num w-20" name="seconds" type="number" min="0" max="59" defaultValue={job.durationSeconds % 60} aria-label="Seconds" />
                    <span className="text-sm text-slate-500">sec</span>
                    <button className="btn-secondary ml-auto">Save</button>
                  </div>
                  <p className="hint">Only affects pay for future submissions.</p>
                </ActionForm>
              </details>
            </div>
          </section>

          {job.status === "SUBMITTED" && !job.mediaRemovedAt && (
            <section className="card">
              <div className="card-body flex items-center gap-3">
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-slate-900">Free up space</h2>
                  <p className="text-xs text-slate-500">Remove the media file ({formatBytes(await mediaSize(job.mediaPath))}). The job, transcripts and pay stay.</p>
                </div>
                <ConfirmAction
                  action={removeJobMedia}
                  fields={{ jobId: job.id }}
                  trigger={<><FileX2 className="size-4" /> Remove media</>}
                  triggerClassName="btn-secondary shrink-0"
                  title="Remove the media file?"
                  description="The audio or video file is deleted for good to free up space. The job, both transcripts and the pay records are kept, but nobody can play it again and the job can't be sent back for corrections."
                  confirmLabel="Remove media"
                  danger
                />
              </div>
            </section>
          )}

          <section className="card border-red-200">
            <div className="card-body flex items-center gap-3">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-slate-900">Delete job</h2>
                <p className="text-xs text-slate-500">Removes the media, transcript and any pay credited for it.</p>
              </div>
              <ConfirmAction
                action={deleteJob}
                fields={{ jobId: job.id }}
                trigger={<><Trash2 className="size-4" /> Delete</>}
                triggerClassName="btn-secondary text-red-700 hover:bg-red-50 hover:text-red-800"
                title="Delete this job?"
                description="This permanently removes the media file, both transcripts and any pay credited for it. It can't be undone."
                confirmLabel="Delete job"
                danger
              />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
