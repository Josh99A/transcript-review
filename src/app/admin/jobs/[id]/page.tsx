import { notFound } from "next/navigation";
import MediaPlayer from "@/components/MediaPlayer";
import StatusBadge from "@/components/StatusBadge";
import { assignJob, deleteJob, removeEarning, reopenJob, updateDuration } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDuration, formatUGX } from "@/lib/format";
import { earningsFor } from "@/lib/pay";

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
  const changed = job.originalTranscript !== job.editedTranscript;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{job.title}</h1>
        <StatusBadge status={job.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-3 lg:col-span-2">
          <MediaPlayer jobId={job.id} mediaType={job.mediaType} />
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-slate-500">Length</dt><dd>{formatDuration(job.durationSeconds)}</dd></div>
            <div><dt className="text-slate-500">Pays</dt><dd>{formatUGX(earningsFor(job.durationSeconds))}</dd></div>
            <div><dt className="text-slate-500">Assigned</dt><dd>{formatDate(job.assignedAt)}</dd></div>
            <div><dt className="text-slate-500">Submitted</dt><dd>{formatDate(job.submittedAt)}</dd></div>
          </dl>
        </div>

        <div className="card space-y-4">
          {job.status === "SUBMITTED" ? (
            <div className="space-y-2">
              <p className="text-sm">Submitted by <strong>{job.assignee?.name ?? "—"}</strong>.</p>
              <form action={reopenJob}>
                <input type="hidden" name="jobId" value={job.id} />
                <button className="btn-secondary">Send back for more corrections</button>
              </form>
            </div>
          ) : (
            <form action={assignJob} className="space-y-2">
              <input type="hidden" name="jobId" value={job.id} />
              <label className="label" htmlFor="assigneeId">Assigned to</label>
              <select className="input" id="assigneeId" name="assigneeId" defaultValue={job.assigneeId ?? ""}>
                <option value="">Nobody</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button className="btn">Save assignment</button>
            </form>
          )}

          <form action={updateDuration} className="space-y-2">
            <input type="hidden" name="jobId" value={job.id} />
            <span className="label">Correct the length</span>
            <div className="flex items-center gap-2">
              <input className="input w-20" name="minutes" type="number" min="0" defaultValue={Math.floor(job.durationSeconds / 60)} aria-label="Minutes" />
              <span className="text-sm">min</span>
              <input className="input w-20" name="seconds" type="number" min="0" max="59" defaultValue={job.durationSeconds % 60} aria-label="Seconds" />
              <span className="text-sm">sec</span>
              <button className="btn-secondary">Save</button>
            </div>
            <p className="text-xs text-slate-500">Changes pay for future submissions only.</p>
          </form>

          {job.earnings.length > 0 && (
            <div>
              <span className="label">Pay credited</span>
              <ul className="space-y-1 text-sm">
                {job.earnings.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <span>{e.user.name}: {formatUGX(e.amount)}</span>
                    <form action={removeEarning} className="ml-auto">
                      <input type="hidden" name="earningId" value={e.id} />
                      <button className="text-xs text-red-600 hover:underline">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form action={deleteJob}>
            <input type="hidden" name="jobId" value={job.id} />
            <button className="btn-danger">Delete job</button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-semibold">Original transcript</h2>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap text-sm">{job.originalTranscript}</pre>
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">
            {job.status === "SUBMITTED" ? "Submitted transcript" : "Current draft"}
            {!changed && <span className="ml-2 text-xs font-normal text-slate-500">(no changes yet)</span>}
          </h2>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap text-sm">{job.editedTranscript}</pre>
          <a href={`/api/jobs/${job.id}/transcript`} className="btn-secondary mt-3">Download .txt</a>
        </section>
      </div>
    </div>
  );
}
