import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDuration, formatUGX } from "@/lib/format";
import { earningsFor } from "@/lib/pay";

export default async function MyJobsPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const user = await requireUser();
  const { submitted } = await searchParams;
  const jobs = await db.job.findMany({
    where: { assigneeId: user.id },
    orderBy: [{ status: "asc" }, { assignedAt: "desc" }],
  });
  const todo = jobs.filter((j) => j.status === "ASSIGNED");
  const done = jobs.filter((j) => j.status === "SUBMITTED");

  return (
    <div className="space-y-6">
      {submitted && (
        <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Transcript submitted. Your pay has been added to <Link href="/earnings" className="underline">your earnings</Link>.
        </p>
      )}
      <section className="card">
        <h1 className="mb-3 text-xl font-semibold">To do</h1>
        {todo.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing assigned to you right now.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {todo.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-3 py-3">
                <div>
                  <div className="font-medium">{j.title}</div>
                  <div className="text-xs text-slate-500">
                    {formatDuration(j.durationSeconds)} · pays {formatUGX(earningsFor(j.durationSeconds))} · assigned {formatDate(j.assignedAt)}
                  </div>
                </div>
                <Link href={`/jobs/${j.id}`} className="btn ml-auto">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Submitted</h2>
        {done.length === 0 ? (
          <p className="text-sm text-slate-500">You haven&apos;t submitted anything yet.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Title</th><th>Length</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>
              {done.map((j) => (
                <tr key={j.id}>
                  <td><Link href={`/jobs/${j.id}`} className="text-indigo-600 hover:underline">{j.title}</Link></td>
                  <td>{formatDuration(j.durationSeconds)}</td>
                  <td>{formatDate(j.submittedAt)}</td>
                  <td><StatusBadge status={j.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
