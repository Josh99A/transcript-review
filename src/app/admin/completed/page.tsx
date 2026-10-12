import { CircleCheck, Download } from "lucide-react";
import SortSelect from "@/components/SortSelect";
import { pickSort, sortJobs, sortOptions, type SortKey } from "@/lib/sort";
import JobTags from "@/components/JobTags";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDuration, formatUGX } from "@/lib/format";

export const metadata: Metadata = { title: "Completed" };

type PayState = "Paid" | "Part paid" | "Unpaid";
const PAY_TONE: Record<PayState, string> = {
  Paid: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  "Part paid": "bg-amber-50 text-amber-800 ring-amber-600/20",
  Unpaid: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

const DONE_SORTS: SortKey[] = ["approved_new", "approved_old", "submitted_new", "submitted_old", "assigned_new", "assigned_old", "longest", "shortest", "pay_high", "pay_low", "title"];

export default async function CompletedPage({ searchParams }: { searchParams: Promise<{ unpaid?: string; who?: string; sort?: string }> }) {
  await requireAdmin();
  const { unpaid, who, sort: sortParam } = await searchParams;
  const sort = await pickSort("completed", sortParam, DONE_SORTS, "approved_new");
  const [jobs, people, paid, earnings] = await Promise.all([
    db.job.findMany({
      where: { status: "SUBMITTED", approvedAt: { not: null } },
      include: { assignee: { select: { id: true, name: true } }, earnings: true },
      orderBy: { approvedAt: "desc" },
    }),
    db.user.findMany({ where: { role: "USER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.payout.groupBy({ by: ["userId"], _sum: { amount: true } }),
    db.earning.findMany({ select: { id: true, userId: true, amount: true }, orderBy: { createdAt: "asc" } }),
  ]);

  // Payments aren't tied to jobs, so each person's payments are counted against their jobs oldest first.
  const left = new Map(paid.map((p) => [p.userId, p._sum.amount ?? 0]));
  const payState = new Map<string, PayState>();
  for (const e of earnings) {
    const cover = left.get(e.userId) ?? 0;
    payState.set(e.id, cover >= e.amount ? "Paid" : cover > 0 ? "Part paid" : "Unpaid");
    left.set(e.userId, Math.max(0, cover - e.amount));
  }
  const rows = sortJobs([...jobs], sort)
    .map((j) => {
      const e = j.earnings.find((x) => x.userId === j.assigneeId) ?? j.earnings[0];
      return { job: j, amount: e?.amount ?? 0, state: (e ? payState.get(e.id) : undefined) ?? ("Unpaid" as PayState) };
    })
    .filter((r) => (!unpaid || r.state !== "Paid") && (!who || r.job.assigneeId === who));
  const unpaidTotal = rows.filter((r) => r.state !== "Paid").length;

  const href = (next: { unpaid?: string; who?: string }) => {
    const q = new URLSearchParams(Object.entries({ unpaid, who, ...next }).filter(([, v]) => v) as [string, string][]);
    return `/admin/completed${q.size ? `?${q}` : ""}`;
  };
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${active ? "bg-brand-50 text-brand-700 ring-brand-600/20" : "text-slate-600 ring-slate-200"}`;

  return (
    <>
      <PageHeader title="Completed" description="Approved jobs. Pay status counts each person's payments against their jobs oldest first." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={href({ unpaid: "" })} className={chip(!unpaid)}>All</Link>
        <Link href={href({ unpaid: "1" })} className={chip(!!unpaid)}>Not fully paid</Link>
        <form action="/admin/completed" className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          {unpaid && <input type="hidden" name="unpaid" value="1" />}
          <label className="sr-only" htmlFor="who">Transcriber</label>
          <select id="who" name="who" defaultValue={who ?? ""} className="input h-9 min-w-0 flex-1 text-sm sm:w-48 sm:flex-none">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-secondary btn-sm">Filter</button>
        </form>
        <SortSelect page="completed" value={sort} options={sortOptions(DONE_SORTS)} className="w-full sm:w-auto" />
      </div>

      {rows.length === 0 ? (
        <section className="card">
          <EmptyState icon={CircleCheck} title={jobs.length ? "Nothing matches these filters" : "No completed jobs yet"} description={jobs.length ? "Try another filter." : "Jobs you approve from Reviews show up here."} />
        </section>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500"><span className="num">{rows.length}</span> job{rows.length === 1 ? "" : "s"}{unpaidTotal ? ` · ${unpaidTotal} not fully paid` : ""}</p>
          <ul className="space-y-3 sm:hidden">
            {rows.map(({ job: j, amount, state }) => (
              <li key={j.id} className="card p-4">
                <Link href={`/admin/jobs/${j.id}`} className="font-medium break-words text-slate-900 hover:text-brand-700">{j.title}</Link><JobTags job={j} className="mt-1 flex" />
                <div className="num mt-1 text-xs text-slate-500">{j.assignee?.name ?? "Unknown"} · approved {formatDate(j.approvedAt)} · {formatDuration(j.durationSeconds)}</div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="num font-medium text-slate-900">{formatUGX(amount)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PAY_TONE[state]}`}>{state}</span>
                  <a href={`/api/jobs/${j.id}/transcript?format=docx`} className="btn-ghost btn-sm ml-auto"><Download className="size-3.5" /> .docx</a>
                </div>
              </li>
            ))}
          </ul>
          <div className="card hidden overflow-x-auto sm:block">
            <table className="table">
              <thead><tr><th>Job</th><th>Transcriber</th><th>Approved</th><th>Length</th><th className="text-right">Pay</th><th>Paid?</th><th><span className="sr-only">Download</span></th></tr></thead>
              <tbody>
                {rows.map(({ job: j, amount, state }) => (
                  <tr key={j.id}>
                    <td><Link href={`/admin/jobs/${j.id}`} className="font-medium text-slate-900 hover:text-brand-700">{j.title}</Link><JobTags job={j} className="mt-1 flex" /></td>
                    <td><UserCell name={j.assignee?.name ?? "Unknown"} /></td>
                    <td className="whitespace-nowrap text-slate-600">{formatDate(j.approvedAt)}</td>
                    <td className="num">{formatDuration(j.durationSeconds)}</td>
                    <td className="num text-right">{formatUGX(amount)}{j.ratePerHour != null && <span className="block text-xs text-slate-400">{formatUGX(j.ratePerHour)}/hr</span>}</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${PAY_TONE[state]}`}>{state}</span></td>
                    <td className="text-right"><a href={`/api/jobs/${j.id}/transcript?format=docx`} className="btn-ghost btn-sm"><Download className="size-3.5" /> .docx</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
