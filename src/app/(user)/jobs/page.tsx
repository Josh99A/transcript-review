import { ArrowRight, CircleCheck, Clock, FileAudio, FileVideo, Inbox, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge, { jobBadge } from "@/components/StatusBadge";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import PayDateBanner from "@/components/PayDateBanner";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { balanceFor } from "@/lib/earnings";
import { formatDeadline, formatDuration, formatHours, formatRelative, formatUGX } from "@/lib/format";
import { earningsFor } from "@/lib/pay";
import { getNextPayDate } from "@/lib/settings";
import SubmittedToast from "./SubmittedToast";

export const metadata: Metadata = { title: "My jobs" };

export default async function MyJobsPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const user = await requireRole("USER");
  const { submitted } = await searchParams;
  const [jobs, balance, payDate, openJobs] = await Promise.all([
    db.job.findMany({
      where: { assigneeId: user.id },
      include: { earnings: { where: { userId: user.id } } },
      orderBy: [{ assignedAt: "desc" }],
    }),
    balanceFor(user.id),
    getNextPayDate(),
    db.job.count({ where: { posted: true, status: "UNASSIGNED" } }),
  ]);
  const todo = jobs.filter((j) => j.status === "ASSIGNED");
  const done = jobs.filter((j) => j.status === "SUBMITTED").sort((a, b) => +(b.submittedAt ?? 0) - +(a.submittedAt ?? 0));
  const todoPay = todo.reduce((s, j) => s + earningsFor(j.durationSeconds), 0);
  const todoSeconds = todo.reduce((s, j) => s + j.durationSeconds, 0);
  const firstName = user.name.split(" ")[0];

  return (
    <>
      {submitted && <SubmittedToast />}
      <PageHeader title={`Hi ${firstName}`} description="Here's what's waiting for you." />
      <div className="mb-6"><PayDateBanner payDate={payDate} owed={balance.owed} /></div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
        <StatCard icon={Inbox} label="To do" value={todo.length} tone="amber" hint={todo.length ? `${formatHours(todoSeconds)} of media` : "All caught up"} />
        <StatCard icon={Wallet} label="Up for grabs" value={formatUGX(todoPay)} tone="brand" hint="If you finish everything assigned" />
        <StatCard icon={CircleCheck} label="Waiting to be paid" value={formatUGX(balance.owed)} tone="emerald" hint={<Link href="/earnings" className="font-medium text-brand-600 hover:text-brand-700">View earnings</Link>} />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">To do</h2>
          {openJobs > 0 && todo.length > 0 && (
            <Link href="/board" className="text-sm font-medium text-brand-600 hover:text-brand-700">{openJobs} open job{openJobs === 1 ? "" : "s"} to request</Link>
          )}
        </div>
        {todo.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={CircleCheck}
              title="You're all caught up"
              description={openJobs ? `There ${openJobs === 1 ? "is 1 open job" : `are ${openJobs} open jobs`} you can request.` : "New jobs show up here when an admin assigns one to you or approves your request."}
              action={openJobs ? <Link href="/board" className="btn">Find work</Link> : undefined}
            />
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {todo.map((j) => {
              const Icon = j.mediaType.startsWith("video") ? FileVideo : FileAudio;
              const started = j.editedTranscript !== j.originalTranscript;
              return (
                <li key={j.id} className="min-w-0">
                  <Link href={`/jobs/${j.id}`} className="card group flex items-center gap-4 p-4 transition hover:border-brand-200 hover:shadow-md">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-slate-900">{j.title}</span>
                        {j.reviewNote && <StatusBadge status="CHANGES" />}
                      </div>
                      <div className="num mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {formatDuration(j.durationSeconds)}</span>
                        <span className="font-medium text-slate-700">{formatUGX(earningsFor(j.durationSeconds))}</span>
                        {j.deadline ? (
                          <span className={formatDeadline(j.deadline).overdue ? "text-red-700" : formatDeadline(j.deadline).soon ? "text-amber-700" : ""}>Due {formatDeadline(j.deadline).text}</span>
                        ) : (
                          <span>Assigned {formatRelative(j.assignedAt)}</span>
                        )}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:text-brand-700">
                      {j.reviewNote ? "Fix" : started ? "Continue" : "Start"} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="card mt-8 overflow-hidden">
          <div className="card-header"><h2 className="card-title">Submitted</h2></div>
          <div className="relative overflow-x-auto">
            <table className="table table-stack">
              <thead><tr><th>Job</th><th>Status</th><th>Length</th><th>Submitted</th><th className="text-right">Earned</th></tr></thead>
              <tbody>
                {done.map((j) => (
                  <tr key={j.id}>
                    <td><Link href={`/jobs/${j.id}`} className="font-medium text-slate-900 hover:text-brand-700">{j.title}</Link></td>
                    <td data-label="Status"><StatusBadge status={jobBadge(j)} /></td>
                    <td data-label="Length" className="num">{formatDuration(j.durationSeconds)}</td>
                    <td data-label="Submitted" className="whitespace-nowrap text-slate-600">{formatRelative(j.submittedAt)}</td>
                    <td data-label="Earned" className="num text-right font-medium">{formatUGX(j.earnings.reduce((s, e) => s + e.amount, 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
