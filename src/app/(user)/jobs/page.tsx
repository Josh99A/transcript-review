import { ArrowRight, CircleCheck, Clock, FileAudio, FileVideo, Inbox, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import PayDateBanner from "@/components/PayDateBanner";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { balanceFor } from "@/lib/earnings";
import { formatDuration, formatHours, formatRelative, formatUGX } from "@/lib/format";
import { earningsFor } from "@/lib/pay";
import { getNextPayDate } from "@/lib/settings";
import SubmittedToast from "./SubmittedToast";

export const metadata: Metadata = { title: "My jobs" };

export default async function MyJobsPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const user = await requireRole("USER");
  const { submitted } = await searchParams;
  const [jobs, balance, payDate] = await Promise.all([
    db.job.findMany({
      where: { assigneeId: user.id },
      include: { earnings: { where: { userId: user.id } } },
      orderBy: [{ assignedAt: "desc" }],
    }),
    balanceFor(user.id),
    getNextPayDate(),
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

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Inbox} label="To do" value={todo.length} tone="amber" hint={todo.length ? `${formatHours(todoSeconds)} of media` : "All caught up"} />
        <StatCard icon={Wallet} label="Up for grabs" value={formatUGX(todoPay)} tone="brand" hint="If you finish everything assigned" />
        <StatCard icon={CircleCheck} label="Waiting to be paid" value={formatUGX(balance.owed)} tone="emerald" hint={<Link href="/earnings" className="font-medium text-brand-600 hover:text-brand-700">View earnings</Link>} />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">To do</h2>
        {todo.length === 0 ? (
          <div className="card">
            <EmptyState icon={CircleCheck} title="You're all caught up" description="New jobs will show up here as soon as an admin assigns them to you." />
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {todo.map((j) => {
              const Icon = j.mediaType.startsWith("video") ? FileVideo : FileAudio;
              const started = j.editedTranscript !== j.originalTranscript;
              return (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="card group flex items-center gap-4 p-4 transition hover:border-brand-200 hover:shadow-md">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900">{j.title}</div>
                      <div className="num mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {formatDuration(j.durationSeconds)}</span>
                        <span className="font-medium text-slate-700">{formatUGX(earningsFor(j.durationSeconds))}</span>
                        <span>Assigned {formatRelative(j.assignedAt)}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:text-brand-700">
                      {started ? "Continue" : "Start"} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
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
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Job</th><th>Length</th><th>Submitted</th><th className="text-right">Earned</th></tr></thead>
              <tbody>
                {done.map((j) => (
                  <tr key={j.id}>
                    <td><Link href={`/jobs/${j.id}`} className="font-medium text-slate-900 hover:text-brand-700">{j.title}</Link></td>
                    <td className="num">{formatDuration(j.durationSeconds)}</td>
                    <td className="whitespace-nowrap text-slate-600">{formatRelative(j.submittedAt)}</td>
                    <td className="num text-right font-medium">{formatUGX(j.earnings.reduce((s, e) => s + e.amount, 0))}</td>
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
