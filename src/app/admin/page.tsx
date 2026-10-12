import { CircleCheck, FileAudio, FileVideo, Hourglass, Inbox, Search, Upload, Wallet } from "lucide-react";
import JobTags from "@/components/JobTags";
import type { Metadata } from "next";
import Link from "next/link";
import PayDayCard from "@/components/PayDayCard";
import StatusBadge, { jobBadge } from "@/components/StatusBadge";
import StorageCard from "@/components/StorageCard";
import { Avatar, EmptyState, PageHeader, StatList, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { balancesByUser, expectedByUser } from "@/lib/earnings";
import { formatDuration, formatRelative, formatUGX } from "@/lib/format";
import { getNextPayDate } from "@/lib/settings";
import { jobPayLabel } from "@/lib/pay";

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

  const [jobs, users, balances, expected, counts, payDate, stored, pendingRequests] = await Promise.all([
    db.job.findMany({
      where: {
        ...(filter === "ALL" ? {} : { status: filter }),
        ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { project: { contains: query, mode: "insensitive" } }, { assignee: { name: { contains: query, mode: "insensitive" } } }] } : {}),
      },
      include: { assignee: { select: { name: true } }, earnings: true, _count: { select: { requests: { where: { status: "PENDING" } } } } },
      orderBy: [{ updatedAt: "desc" }],
    }),
    db.user.findMany({ where: { role: { in: ["USER", "REFERRER"] } }, orderBy: { name: "asc" } }),
    balancesByUser(),
    expectedByUser(),
    db.job.groupBy({ by: ["status"], _count: true }),
    getNextPayDate(),
    db.job.findMany({ where: { mediaRemovedAt: null }, select: { mediaBytes: true, status: true } }),
    db.jobRequest.count({ where: { status: "PENDING", job: { status: "UNASSIGNED" } } }),
  ]);
  const sizes = stored.map((j) => ({ status: j.status, bytes: j.mediaBytes }));
  const usedBytes = sizes.reduce((s, j) => s + j.bytes, 0);
  const removable = sizes.filter((j) => j.status === "SUBMITTED");
  const count = (s: Filter) =>
    s === "ALL" ? counts.reduce((n, c) => n + c._count, 0) : (counts.find((c) => c.status === s)?._count ?? 0);
  const owing = users
    .map((u) => ({ user: u, balance: balances.get(u.id) ?? { earned: 0, paid: 0, owed: 0 } }))
    .sort((a, b) => b.balance.owed - a.balance.owed);
  const totalExpected = [...expected.values()].reduce((sum, e) => sum + e.total, 0);
  const totalOwed = owing.reduce((sum, o) => sum + Math.max(o.balance.owed, 0), 0);
  const peopleOwed = owing.filter((o) => o.balance.owed > 0).length;
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

      <StatList
        stats={[
          { icon: Inbox, label: "Waiting to assign", value: count("UNASSIGNED"), tone: "slate", hint: pendingRequests ? <Link href="/admin/requests" className="font-medium text-brand-600 hover:text-brand-700">{pendingRequests} request{pendingRequests === 1 ? "" : "s"} to review</Link> : undefined },
          { icon: Hourglass, label: "In progress", value: count("ASSIGNED"), tone: "amber", hint: <Link href="/admin/users" className="hover:text-slate-700">{formatUGX(totalExpected)} expected pay</Link> },
          { icon: CircleCheck, label: "Submitted", value: count("SUBMITTED"), tone: "emerald" },
          { icon: Wallet, label: "Owed to team", value: formatUGX(totalOwed), tone: "brand", hint: waitingHint(peopleOwed) },
        ]}
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Jobs</h2>
            <form className="relative ml-auto w-full sm:w-64" role="search">
              {filter !== "ALL" && <input type="hidden" name="status" value={filter} />}
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className="input pl-9" name="q" defaultValue={query} placeholder="Search title, project or person" aria-label="Search jobs" />
            </form>
          </div>
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 sm:px-5" role="tablist">
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <Link
                  key={f}
                  href={href(f)}
                  role="tab"
                  aria-selected={active}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap ring-1 ring-inset ${
                    active ? "bg-brand-50 text-brand-700 ring-brand-600/20" : "bg-white text-slate-600 ring-slate-200 hover:text-slate-900"
                  }`}
                >
                  {FILTER_LABELS[f]}
                  <span className={`num text-xs ${active ? "text-brand-700" : "text-slate-400"}`}>
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
            <div>
              <ul className="divide-y divide-slate-100 sm:hidden">
                {jobs.map((j) => {
                  return (
                    <li key={j.id}>
                      <Link href={`/admin/jobs/${j.id}`} className="block px-4 py-3 active:bg-slate-50">
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0"><span className="block font-medium break-words text-slate-900">{j.title}</span><JobTags job={j} className="mt-1 flex" /></span>
                          <span className="num shrink-0 text-right text-sm text-slate-600">{formatDuration(j.durationSeconds)}<span className="block text-xs text-slate-400">{jobPayLabel(j)}</span></span>
                        </div>
                        <div className="num mt-0.5 text-xs text-slate-500">
                          {j.status === "SUBMITTED" ? `submitted ${formatRelative(j.submittedAt)}` : `updated ${formatRelative(j.updatedAt)}`}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <StatusBadge status={jobBadge(j)} />
                          <span className="text-slate-600">{assignedLabel(j)}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto sm:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Assigned to</th>
                    <th>Status</th>
                    <th className="text-right">Length</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const Icon = j.mediaType.startsWith("video") ? FileVideo : FileAudio;
                    return (
                      <tr key={j.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                              <Icon className="size-4.5" aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <Link href={`/admin/jobs/${j.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                                {j.title}
                              </Link>
                              <JobTags job={j} className="mt-1 flex" />
                              <div className="num text-xs text-slate-500">
                                {j.status === "SUBMITTED" ? `submitted ${formatRelative(j.submittedAt)}` : `updated ${formatRelative(j.updatedAt)}`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {!j.assignee && j._count.requests > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-600/20 ring-inset">
                              {j._count.requests} request{j._count.requests === 1 ? "" : "s"} to review
                            </span>
                          ) : !j.assignee && j.posted ? (
                            <span className="text-slate-500">On the job board</span>
                          ) : j.assignee ? (
                            <div className="flex items-center gap-2">
                              <Avatar name={j.assignee.name} size="sm" />
                              <span className="whitespace-nowrap">{j.assignee.name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Nobody yet</span>
                          )}
                        </td>
                        <td><StatusBadge status={jobBadge(j)} /></td>
                        <td className="num text-right whitespace-nowrap text-slate-600">{formatDuration(j.durationSeconds)}<span className="block text-xs text-slate-400">{jobPayLabel(j)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </section>

        <div className="space-y-6">
        <PayDayCard payDate={payDate} totalOwed={totalOwed} peopleOwed={peopleOwed} />
        <StorageCard usedBytes={usedBytes} removableBytes={removable.reduce((s, j) => s + j.bytes, 0)} removableCount={removable.length} />
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
                    <UserCell name={user.name} sub={`${user.role === "REFERRER" ? "Referrer · " : ""}${user.payPhone ?? "No pay number yet"}`} />
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
      </div>
    </>
  );
}

function assignedLabel(j: { assignee: { name: string } | null; posted: boolean; _count: { requests: number } }) {
  if (j.assignee) return j.assignee.name;
  if (j._count.requests > 0) return `${j._count.requests} request${j._count.requests === 1 ? "" : "s"} to review`;
  return j.posted ? "On the job board" : "Nobody yet";
}

function waitingHint(n: number) {
  if (n === 0) return "Everyone is paid up";
  return `${n} ${n === 1 ? "person" : "people"} waiting to be paid`;
}
