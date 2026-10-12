import { ArrowLeft, Check, CircleCheck, Download, FileX2, Megaphone, MessageSquareWarning, Trash2, Undo2, UserMinus, X } from "lucide-react";
import RichText from "@/components/RichText";
import RichTextEditor from "@/components/RichTextEditor";
import Guidelines from "@/components/Guidelines";
import { LanguageField, ProjectField } from "@/components/JobFields";
import JobTags from "@/components/JobTags";
import { projectNames } from "@/lib/projects";
import { getGuidelines } from "@/lib/guidelines";
import { richHtml } from "@/lib/richtext";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { approveJob, approveRequest, assignJob, declineRequest, deleteJob, removeEarning, removeJobMedia, reopenJob, setPosted, unassignJob, updateDuration, updateGuidelines, updateJobDetails } from "@/app/actions";
import { IssueStatus } from "@/components/IssueThread";
import { ActionForm, ConfirmAction } from "@/components/client";
import MediaPlayer from "@/components/MediaPlayer";
import StatusBadge, { jobBadge } from "@/components/StatusBadge";
import TranscriptDiff from "@/components/TranscriptDiff";
import { MediaRemoved, PageHeader, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { deadlineInput, formatBytes, formatDate, formatDeadline, formatDuration, formatHours, formatRelative, formatUGX } from "@/lib/format";
import { jobPayLabel } from "@/lib/pay";

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
  const guidelines = await getGuidelines();
  const [job, users, projects] = await Promise.all([
    db.job.findUnique({
      where: { id },
      include: {
        assignee: true,
        earnings: { include: { user: { select: { name: true } } } },
        requests: { include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } },
        issues: { include: { user: { select: { name: true } }, _count: { select: { messages: true } } }, orderBy: { updatedAt: "desc" } },
      },
    }),
    db.user.findMany({ where: { role: "USER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    projectNames(),
  ]);
  if (!job) notFound();
  const due = job.deadline ? formatDeadline(job.deadline) : null;
  const pending = job.requests.filter((r) => r.status === "PENDING");

  return (
    <>
      <PageHeader
        back={job.status === "SUBMITTED" ? <Link href="/admin/reviews" className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Reviews</Link> : <Link href="/admin" className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Dashboard</Link>}
        title={job.title}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><StatusBadge status={jobBadge(job)} /><span className="num">{formatDuration(job.durationSeconds)} · expected {jobPayLabel(job)}</span><JobTags job={job} /></span>}
        actions={
          <>
            <a href={`/api/jobs/${job.id}/transcript?format=docx`} className="btn-secondary"><Download className="size-4" /> Word .docx</a>
            <a href={`/api/jobs/${job.id}/transcript`} className="btn-secondary"><Download className="size-4" /> .txt</a>
          </>
        }
      />

      {job.status === "SUBMITTED" && !job.approvedAt && (
        <a href="#review" className="mb-4 flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900 ring-1 ring-sky-600/15 xl:hidden">
          <MessageSquareWarning className="size-4 shrink-0" /> Waiting for your review. Compare the changes below, then approve or send back.
          <span className="ml-auto whitespace-nowrap text-brand-700">Go to review</span>
        </a>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <section className="card">
            <div className="card-header"><h2 className="card-title">Details</h2></div>
            <div className="card-body space-y-3 text-sm">
              {job.description ? <RichText html={job.description} className="text-slate-700" /> : <p className="text-slate-400">No details for transcribers yet.</p>}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
                <span>Project: <span className="text-slate-900">{job.project ?? "Not set"}</span></span>
                <span>Language: <span className="text-slate-900">{job.language ?? "Not set"}</span></span>
                <span>Deadline: <span className={due?.overdue ? "text-red-700" : "text-slate-900"}>{due?.text ?? "None"}</span></span>
              </div>
              <details>
                <summary className="cursor-pointer font-medium text-brand-600 hover:text-brand-700">Edit details</summary>
                <ActionForm action={updateJobDetails} className="mt-3 space-y-3">
                  <input type="hidden" name="jobId" value={job.id} />
                  <div><label className="label" htmlFor="d-title">Title</label><input className="input" id="d-title" name="title" defaultValue={job.title} required /></div>
                  <div><label className="label" htmlFor="d-desc">Details for transcribers</label><RichTextEditor name="description" id="d-desc" defaultValue={richHtml(job.description)} /></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><label className="label" htmlFor="d-project">Project</label><ProjectField id="d-project" projects={projects} defaultValue={job.project ?? ""} /></div>
                    <div><label className="label" htmlFor="d-lang">Language</label><LanguageField id="d-lang" defaultValue={job.language ?? ""} /></div>
                    <div><label className="label" htmlFor="d-due">Deadline</label><input className="input" id="d-due" name="deadline" type="date" defaultValue={deadlineInput(job.deadline)} /></div>
                    <div><label className="label" htmlFor="d-rate">Custom rate (UGX per hour)</label><input className="input" id="d-rate" name="ratePerHour" inputMode="numeric" defaultValue={job.ratePerHour ?? ""} placeholder="Empty = usual rate" /></div>
                  </div>
                  <button className="btn">Save details</button>
                </ActionForm>
              </details>
            </div>
          </section>
          <Guidelines html={guidelines} open={false}>
            <details className="mt-3 border-t border-slate-100 pt-3">
              <summary className="cursor-pointer font-medium text-brand-600 hover:text-brand-700">Edit guidelines</summary>
              <ActionForm action={updateGuidelines} className="mt-3 space-y-3">
                <RichTextEditor name="guidelines" id="guidelines" defaultValue={guidelines} minHeight="10rem" />
                <p className="hint">These show on every job, for every transcriber.</p>
                <button className="btn">Save guidelines</button>
              </ActionForm>
            </details>
          </Guidelines>
          {job.mediaRemovedAt ? <MediaRemoved at={job.mediaRemovedAt} /> : <div className="card p-4"><MediaPlayer jobId={job.id} mediaType={job.mediaType} /></div>}
          {/* Review links land here: the comparison, with the approve and send-back controls right under it. */}
          <div id="review" className="scroll-mt-4 space-y-6">
            <section className="card overflow-hidden">
              <div className="card-header"><h2 className="card-title">Transcript review</h2></div>
              <TranscriptDiff original={job.originalTranscript} edited={job.editedTranscript} finalLabel={job.status === "SUBMITTED" ? "Submitted" : "Current draft"} />
            </section>
            {job.status === "SUBMITTED" && (
              <section className="card">
                <div className="card-header"><h2 className="card-title">Review</h2></div>
                <div className="card-body space-y-4">
                  {job.approvedAt ? (
                    <p className="flex items-center gap-2 text-sm text-emerald-700"><CircleCheck className="size-4 shrink-0" /> Approved {formatRelative(job.approvedAt)}.</p>
                  ) : (
                    <>
                      <p className="text-sm text-slate-600">Check the changes, then approve them or send the job back with instructions.</p>
                      <ActionForm action={approveJob} confirm={{ title: "Approve this transcript?", description: `${job.assignee?.name ?? "The transcriber"} is told it was accepted, and it moves to Completed.`, label: "Approve" }}>
                        <input type="hidden" name="jobId" value={job.id} />
                        <button className="btn w-full"><Check className="size-4" /> Approve</button>
                      </ActionForm>
                    </>
                  )}
                  {job.mediaRemovedAt ? null : (
                    <ActionForm action={reopenJob} className="space-y-2 border-t border-slate-100 pt-4" confirm={{ title: "Send this back for changes?", description: `${job.assignee?.name ?? "The transcriber"} gets your instructions and the job reopens in their editor.`, label: "Send back" }}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <label className="label" htmlFor="review-note">{job.approvedAt ? "Still needs changes?" : "Not satisfactory?"}</label>
                      <RichTextEditor name="note" id="review-note" minHeight="7rem" placeholder="e.g. Speaker names are missing from 02:10 to 04:30, and fix the spelling of Kampala." />
                      <button className="btn-secondary w-full"><Undo2 className="size-4" /> Send back with instructions</button>
                      <p className="text-xs text-slate-500">{job.assignee?.name ?? "The transcriber"} sees your instructions and can edit again. Pay already credited stays, and resubmitting won&apos;t pay twice.</p>
                    </ActionForm>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {job.status === "ASSIGNED" && job.reviewNote && (
            <section className="rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-900 ring-1 ring-orange-600/15">
              <p className="flex items-center gap-2 font-medium"><MessageSquareWarning className="size-4 shrink-0" /> Sent back {formatRelative(job.reviewedAt)}{job.revisions > 1 ? ` (round ${job.revisions})` : ""}</p>
              <RichText html={job.reviewNote} className="mt-1" />
            </section>
          )}
          {job.status === "UNASSIGNED" && (
            <section className="card">
              <div className="card-header">
                <Megaphone className="size-4.5 text-brand-600" />
                <h2 className="card-title">Job board</h2>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${job.posted ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{job.posted ? "Posted" : "Not posted"}</span>
              </div>
              <div className="card-body space-y-4">
                <ActionForm action={setPosted}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="posted" value={job.posted ? "false" : "true"} />
                  <button className="btn-secondary w-full">{job.posted ? "Take off the job board" : "Post on the job board"}</button>
                </ActionForm>
                {job.requests.length === 0 ? (
                  <p className="text-sm text-slate-500">{job.posted ? "No requests yet. Transcribers see it under Find work." : "Post it so transcribers can request it."}</p>
                ) : (
                  <div>
                    <h3 className="mb-2 text-sm font-medium text-slate-700">Requests ({pending.length} waiting)</h3>
                    <ul className="divide-y divide-slate-100">
                      {job.requests.map((r) => (
                        <li key={r.id} className="space-y-2 py-3">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1"><UserCell name={r.user.name} sub={`Asked ${formatRelative(r.createdAt)}`} /></div>
                            {r.status === "DECLINED" && <span className="text-xs text-slate-400">Declined</span>}
                          </div>
                          {r.note && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{r.note}”</p>}
                          {r.status === "PENDING" && (
                            <div className="flex gap-2">
                              <ActionForm action={approveRequest} className="flex-1" confirm={{ title: `Give this job to ${r.user.name}?`, description: "Everyone else who asked for it is declined and told.", label: "Give it to them" }}>
                                <input type="hidden" name="requestId" value={r.id} />
                                <button className="btn w-full"><Check className="size-4" /> Give it to {r.user.name.split(" ")[0]}</button>
                              </ActionForm>
                              <ActionForm action={declineRequest} confirm={{ title: `Decline ${r.user.name}'s request?`, description: "They're told it wasn't approved. They can ask again while the job is on the board.", label: "Decline", danger: true }}>
                                <input type="hidden" name="requestId" value={r.id} />
                                <button className="btn-secondary" aria-label={`Decline ${r.user.name}`}><X className="size-4" /> Decline</button>
                              </ActionForm>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-header"><h2 className="card-title">Assignment</h2></div>
            <div className="card-body space-y-4">
              {job.assignee && <UserCell name={job.assignee.name} sub={job.assignee.email} />}
              {job.status === "SUBMITTED" ? null : (
                <ActionForm action={assignJob} className="space-y-2" confirm={{ title: job.assignee ? "Change who has this job?" : "Assign this job?", description: job.assignee ? `${job.assignee.name} loses access to it and is told. Their draft stays on the job for the next person.` : "The person you picked is told and can start right away.", label: "Save assignment" }}>
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
              {job.assignee && !(job.status === "SUBMITTED" && job.approvedAt) && !job.mediaRemovedAt && (
                <ActionForm
                  action={unassignJob}
                  className="space-y-2 border-t border-slate-100 pt-4"
                  confirm={{ title: `Unassign ${job.assignee.name}?`, description: `They lose access and are told. The job goes back on Find work with their edits so far, and any pay credited to them for it is removed.`, label: "Unassign", danger: true }}
                >
                  <input type="hidden" name="jobId" value={job.id} />
                  <label className="label" htmlFor="unassign-reason">Message to {job.assignee.name.split(" ")[0]} <span className="font-normal text-slate-400">(optional)</span></label>
                  <textarea className="input h-16" id="unassign-reason" name="reason" maxLength={1000} placeholder="e.g. The deadline moved, so someone else will take it." />
                  <button className="btn-secondary w-full"><UserMinus className="size-4" /> Unassign and put back on Find work</button>
                </ActionForm>
              )}
              <dl className="divide-y divide-slate-100 border-t border-slate-100">
                <Row label="Uploaded">{formatDate(job.createdAt)}</Row>
                <Row label="Assigned">{formatDate(job.assignedAt)}</Row>
                <Row label="Submitted">{formatDate(job.submittedAt)}</Row>
              </dl>
            </div>
          </section>

          {job.issues.length > 0 && (
            <section className="card">
              <div className="card-header"><h2 className="card-title">Issues</h2></div>
              <ul className="divide-y divide-slate-100">
                {job.issues.map((i) => (
                  <li key={i.id}>
                    <Link href={`/admin/issues/${i.id}`} className="block px-5 py-3 hover:bg-slate-50">
                      <span className="flex items-center gap-2"><span className="min-w-0 flex-1 text-sm font-medium break-words text-slate-900">{i.subject}</span><IssueStatus status={i.status} /></span>
                      <span className="mt-0.5 block text-xs text-slate-500">{i.user.name} · {i._count.messages} message{i._count.messages === 1 ? "" : "s"} · {formatRelative(i.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <div className="card-header"><h2 className="card-title">Time credited</h2></div>
            <div className="card-body space-y-4">
              {job.earnings.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing credited yet. When the transcript is submitted, its {formatHours(job.durationSeconds)} are added to the transcriber&apos;s total hours, which their pay is worked out on.</p>
              ) : (
                <ul className="space-y-2">
                  {job.earnings.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                      <span className="flex-1 text-emerald-900">{e.user.name}</span>
                      <span className="num font-semibold text-emerald-900">{formatHours(e.seconds)}</span>
                      <ConfirmAction
                        action={removeEarning}
                        fields={{ earningId: e.id }}
                        trigger={<Trash2 className="size-3.5" />}
                        triggerClassName="btn-ghost size-7 px-0 text-emerald-800 hover:bg-emerald-100"
                        title="Remove this pay?"
                        description={`${formatHours(e.seconds)} will be taken off ${e.user.name}'s total hours.`}
                        confirmLabel="Remove pay"
                        typeWord="REMOVE"
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
                  <p className="text-xs text-slate-500">Remove the media file ({formatBytes(job.mediaBytes)}). The job, transcripts and pay stay.</p>
                </div>
                <ConfirmAction
                  action={removeJobMedia}
                  fields={{ jobId: job.id }}
                  trigger={<><FileX2 className="size-4" /> Remove media</>}
                  triggerClassName="btn-secondary shrink-0"
                  title="Remove the media file?"
                  description="The audio or video file is deleted for good to free up space. The job, both transcripts and the pay records are kept, but nobody can play it again and the job can't be sent back for corrections."
                  confirmLabel="Remove media"
                  typeWord="REMOVE"
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
                description="This permanently removes the media file and both transcripts. It can't be undone."
                confirmLabel="Delete job"
                typeWord="DELETE"
                danger
              />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
