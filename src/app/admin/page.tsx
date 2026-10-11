import { CircleCheck, FileAudio, FileVideo, Hourglass, Inbox, Search, Upload, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { Avatar, EmptyState, PageHeader, StatCard, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser } from "@/lib/earnings";
import { formatDuration, formatRelative, formatUGX } from "@/lib/format";
import { earningsFor } from "@/lib/pay";

export const metadata: Metadata = { title: "Dashboard" };

const FILTERS = ["ALL", "UNASSIGNED", "ASSIGNED", "SUBMITTED"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = {
  ALL: "All",
  UNASSIGNED: "Unassigned",
  ASSIGNED: "In progress",
  SUBMITTED: "Submitted",
};

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdmin();
  const { status, q = "" } = await searchParams;
  const filter: Filter = FILTERS.includes(status as Filter) ? (status as Filter) : "ALL";
  const query = q.trim();

  const [jobs, users, balances, counts] = await Promise.all([
    db.job.findMany({
      where: {
        ...(filter === "ALL" ? {} : { status: filter }),
        ...(query ? { OR: [{ title: { contains: query } }, { assignee: { name: { contains: query } } }] } : {}),
      },
      include: { assignee: { select: { name: true } }, earnings: true },
      orderBy: [{ updatedAt: "desc" }],
    }),
    db.user.findMany({ where: { role: "USER" }, orderBy: { name: "asc" } }),
    balancesByUser(),
    db.job.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: Filter) =>
    s === "ALL" ? counts.reduce((n, c) => n + c._count, 0) : (counts.find((c) => c.status === s)?._count ?? 0);
  const totalOwed = [...balances.values()].reduce((sum, b) => sum + b.owed, 0);
  const owing = users
    .map((u) => ({ user: u, balance: balances.get(u.id) ?? { earned: 0, paid: 0, owed: 0 } }))
    .sort((a, b) => b.balance.owed - a.balance.owed);
  const href = (f: Filter) => {
    const p = new URLSearchParams();
    if (f !== "ALL") p.set("status", f);
    if (query) p.set("q", query);
    const s = p.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Track every job from upload to payment."
        actions={
          <Link href="/admin/jobs/new" className="btn">
            <Upload className="size-4" aria-hidden /> Upload job
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Inbox} label="Waiting to assign" value={count("UNASSIGNED")} tone="slate" />
        <StatCard icon={Hourglass} label="In progress" value={count("ASSIGNED")} tone="amber" />
        <StatCard icon={CircleCheck} label="Submitted" value={count("SUBMITTED")} tone="emerald" />
        <StatCard icon={Wallet} label="Owed to team" value={formatUGX(totalOwed)} tone="brand" hint={waitingHint(owing.filter((o) => o.balance.owed > 0).length)} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Jobs</h2>
            <form className="relative ml-auto w-full sm:w-64" role="search">
              {filter !== "ALL" && <input type="hidden" name="status" value={filter} />}
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className="input pl-9" name="q" defaultValue={query} placeholder="Search title or person" aria-label="Search jobs" />
            </form>
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-5" role="tablist">
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <Link
                  key={f}
                  href={href(f)}
                  role="tab"
                  aria-selected={active}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-2 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {FILTER_LABELS[f]}
                  <span className={`num rounded-full px-1.5 py-0.5 text-[11px] ${active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"}`}>
                    {count(f)}
                  </span>
                </Link>
              );
            })}
          </div>

          {jobs.length === 0 ? (
            query || filter !== "ALL" ? (
              <EmptyState icon={Search} title="No matching jobs" description="Try a different search or filter." action={<Link href="/admin" className="btn-secondary">Clear filters</Link>} />
            ) : (
              <EmptyState
                icon={Upload}
                title="No jobs yet"
                description="Upload an audio or video file with its transcript, then assign it to someone on your team."
                action={<Link href="/admin/jobs/new" className="btn">Upload your first job</Link>}
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Assigned to</th>
                    <th>Status</th>
                    <th className="text-right">Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const credited = j.earnings.reduce((s, e) => s + e.amount, 0);
                    const Icon = j.mediaType.startsWith("video") ? FileVideo : FileAudio;
                    return (
                      <tr key={j.id} className="group relative">
                        <td>
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                              <Icon className="size-4.5" aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <Link href={`/admin/jobs/${j.id}`} className="font-medium text-slate-900 after:absolute after:inset-0 group-hover:text-brand-700">
                                {j.title}
                              </Link>
                              <div className="num text-xs text-slate-500">
                                {formatDuration(j.durationSeconds)} ·{" "}
                                {j.status === "SUBMITTED" ? `submitted ${formatRelative(j.submittedAt)}` : `updated ${formatRelative(j.updatedAt)}`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {j.assignee ? (
                            <div className="flex items-center gap-2">
                              <Avatar name={j.assignee.name} size="sm" />
                              <span className="whitespace-nowrap">{j.assignee.name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Nobody yet</span>
                          )}
                        </td>
                        <td><StatusBadge status={j.status} /></td>
                        <td className="num text-right whitespace-nowrap">
                          {credited ? (
                            <span className="font-medium text-slate-900">{formatUGX(credited)}</span>
                          ) : (
                            <span className="text-slate-400" title="Credited when submitted">{formatUGX(earningsFor(j.durationSeconds))}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                Grey amounts are what the job will pay once it&apos;s submitted.
              </p>
            </div>
          )}
        </section>

        <section className="card h-fit">
          <div className="card-header">
            <h2 className="card-title">Owed to team</h2>
            <Link href="/admin/users" className="ml-auto text-sm font-medium text-brand-600 hover:text-brand-700">Pay people</Link>
          </div>
          {owing.length === 0 ? (
            <EmptyState icon={Wallet} title="No transcribers yet" action={<Link href="/admin/users" className="btn-secondary">Add a transcriber</Link>} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {owing.map(({ user, balance }) => (
                <li key={user.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <UserCell name={user.name} sub={`Earned ${formatUGX(balance.earned)}`} />
                  </div>
                  <div className={`num text-sm font-semibold whitespace-nowrap ${balance.owed > 0 ? "text-slate-900" : "text-slate-400"}`}>
                    {formatUGX(balance.owed)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function waitingHint(n: number) {
  if (n === 0) return "Everyone is paid up";
  return `${n} ${n === 1 ? "person" : "people"} waiting to be paid`;
}
