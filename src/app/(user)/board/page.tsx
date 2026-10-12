import { CalendarClock, Clock, FileAudio, FileVideo, Languages, Search, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDeadline, formatDuration, formatRelative, formatUGX } from "@/lib/format";
import RequestButton from "./RequestButton";
import { jobPayLabel } from "@/lib/pay";

export const metadata: Metadata = { title: "Find work" };

export default async function BoardPage() {
  const user = await requireRole("USER");
  const jobs = await db.job.findMany({
    where: { posted: true, status: "UNASSIGNED" },
    include: { requests: { where: { userId: user.id } } },
    orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });

  return (
    <>
      <PageHeader title="Find work" description="Jobs waiting for a transcriber. Request the ones you'd like and an admin will pick who gets each one." />
      {jobs.length === 0 ? (
        <div className="card">
          <EmptyState icon={Search} title="No open jobs right now" description="New jobs show up here as soon as an admin posts them." />
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {jobs.map((j) => {
            const Icon = j.mediaType.startsWith("video") ? FileVideo : FileAudio;
            const due = j.deadline ? formatDeadline(j.deadline) : null;
            return (
              <li key={j.id} className="card flex min-w-0 flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-slate-900">{j.title}</h2>
                    <p className="text-xs text-slate-500">Posted {formatRelative(j.createdAt)}</p>
                  </div>
                </div>
                <dl className="num mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600">
                  <div className="inline-flex items-center gap-1.5"><Clock className="size-4 text-slate-400" /><dt className="sr-only">Length</dt><dd>{formatDuration(j.durationSeconds)}</dd></div>
                  <div className="inline-flex items-center gap-1.5"><Wallet className="size-4 text-slate-400" /><dt className="sr-only">Expected pay</dt><dd>{jobPayLabel(j)}{j.fixedPay == null ? " expected" : ""}</dd></div>
                  {j.language && <div className="inline-flex items-center gap-1.5"><Languages className="size-4 text-slate-400" /><dt className="sr-only">Language</dt><dd>{j.language}</dd></div>}
                  {due && (
                    <div className={`inline-flex items-center gap-1.5 ${due.overdue ? "text-red-700" : due.soon ? "text-amber-700" : ""}`}>
                      <CalendarClock className="size-4 opacity-70" /><dt className="sr-only">Deadline</dt><dd>{due.text}</dd>
                    </div>
                  )}
                </dl>
                {j.description && <p className="mt-3 text-sm whitespace-pre-line text-slate-700">{j.description}</p>}
                <div className="mt-auto pt-4">
                  <RequestButton jobId={j.id} title={j.title} status={j.requests[0]?.status ?? null} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
