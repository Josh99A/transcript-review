import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser } from "@/lib/earnings";
import { formatDate, formatDuration, formatUGX } from "@/lib/format";
import { earningsFor } from "@/lib/pay";

const FILTERS = ["ALL", "UNASSIGNED", "ASSIGNED", "SUBMITTED"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = {
  ALL: "All",
  UNASSIGNED: "Unassigned",
  ASSIGNED: "In progress",
  SUBMITTED: "Submitted",
};

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter: Filter = FILTERS.includes(status as Filter) ? (status as Filter) : "ALL";

  const [jobs, users, balances, counts] = await Promise.all([
    db.job.findMany({
      where: filter === "ALL" ? {} : { status: filter },
      include: { assignee: { select: { name: true } }, earnings: true },
      orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    }),
    db.user.findMany({ where: { role: "USER" }, orderBy: { name: "asc" } }),
    balancesByUser(),
    db.job.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const totalOwed = [...balances.values()].reduce((sum, b) => sum + b.owed, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Unassigned" value={count("UNASSIGNED")} />
        <Stat label="In progress" value={count("ASSIGNED")} />
        <Stat label="Submitted" value={count("SUBMITTED")} />
        <Stat label="Owed to users" value={formatUGX(totalOwed)} />
      </div>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Jobs</h2>
          <div className="flex gap-1 text-sm">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={f === "ALL" ? "/admin" : `/admin?status=${f}`}
                className={`rounded-md px-2 py-1 ${f === filter ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {FILTER_LABELS[f]}
              </Link>
            ))}
          </div>
          <Link href="/admin/jobs/new" className="btn ml-auto">Upload new</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th><th>Length</th><th>Assigned to</th><th>Status</th><th>Submitted</th><th>Pay</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500">No jobs yet.</td></tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><Link href={`/admin/jobs/${j.id}`} className="font-medium text-indigo-600 hover:underline">{j.title}</Link></td>
                  <td>{formatDuration(j.durationSeconds)}</td>
                  <td>{j.assignee?.name ?? "—"}</td>
                  <td><StatusBadge status={j.status} /></td>
                  <td>{formatDate(j.submittedAt)}</td>
                  <td>
                    {j.earnings.length
                      ? formatUGX(j.earnings.reduce((s, e) => s + e.amount, 0))
                      : <span className="text-slate-400">{formatUGX(earningsFor(j.durationSeconds))}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Grey pay amounts haven&apos;t been credited yet; they&apos;re credited when the transcript is submitted.</p>
      </section>

      <section className="card">
        <div className="mb-3 flex items-center">
          <h2 className="text-lg font-semibold">What each user is owed</h2>
          <Link href="/admin/users" className="btn-secondary ml-auto">Record a payment</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>User</th><th>Earned</th><th>Paid</th><th>Owed</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const b = balances.get(u.id) ?? { earned: 0, paid: 0, owed: 0 };
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{formatUGX(b.earned)}</td>
                    <td>{formatUGX(b.paid)}</td>
                    <td className="font-semibold">{formatUGX(b.owed)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
