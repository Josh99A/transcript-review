import { ArrowRight, CircleCheck, Clock, Eye, FileAudio, FileVideo, X } from "lucide-react";
import PayPicture from "@/components/PayPicture";
import JobTags from "@/components/JobTags";
import { richText } from "@/lib/richtext";
import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge, { jobBadge } from "@/components/StatusBadge";
import { EmptyState, PageHeader } from "@/components/ui";
import PayDateBanner from "@/components/PayDateBanner";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { balanceFor, expectedFor } from "@/lib/earnings";
import { formatDate, formatDeadline, formatDuration, formatRelative, formatUGX } from "@/lib/format";
import { getNextPayDate } from "@/lib/settings";
import ClearSubmitted from "./ClearSubmitted";
import { jobPayLabel } from "@/lib/pay";

export const metadata: Metadata = { title: "My jobs" };

export default async function MyJobsPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const user = await requireRole("USER");
  const { submitted } = await searchParams;
  const [jobs, balance, expected, payDate, openJobs, requests] = await Promise.all([
    db.job.findMany({
      where: { assigneeId: user.id },
      include: { earnings: { where: { userId: user.id } } },
      orderBy: [{ assignedAt: "desc" }],
    }),
    balanceFor(user.id),
    expectedFor(user.id),
    getNextPayDate(),
    db.job.count({ where: { posted: true, status: "UNASSIGNED" } }),
    db.jobRequest.findMany({
      where: { userId: user.id, status: "PENDING", job: { status: "UNASSIGNED" } },
      include: { job: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const open = jobs.filter((j) => j.status === "ASSIGNED");
  const started = (j: (typeof jobs)[number]) => j.editedTranscript !== j.originalTranscript;
  const changes = open.filter((j) => j.reviewNote);
  const inProgress = open.filter((j) => !j.reviewNote && started(j));
  const notStarted = open.filter((j) => !j.reviewNote && !started(j));
  const sent = jobs.filter((j) => j.status === "SUBMITTED").sort((a, b) => +(b.submittedAt ?? 0) - +(a.submittedAt ?? 0));
  const awaiting = sent.filter((j) => !j.approvedAt);
  const completed = sent.filter((j) => j.approvedAt);
  const firstName = user.name.split(" ")[0];
  const justSent = submitted ? sent.find((j) => j.id === submitted) : undefined;

  const groups = [
    { id: "changes", label: "Needs changes", count: changes.length, tone: "bg-red-50 text-red-800 ring-red-600/20" },
    { id: "in-progress", label: "In progress", count: inProgress.length, tone: "bg-amber-50 text-amber-800 ring-amber-600/20" },
    { id: "assigned", label: "Assigned", count: notStarted.length, tone: "bg-brand-50 text-brand-700 ring-brand-600/20" },
    { id: "requested", label: "Requested", count: requests.length, tone: "bg-slate-50 text-slate-700 ring-slate-500/20" },
    { id: "awaiting", label: "Awaiting review", count: awaiting.length, tone: "bg-sky-50 text-sky-800 ring-sky-600/20" },
    { id: "completed", label: "Completed", count: completed.length, tone: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" },
  ];

  return (
    <>
      <PageHeader title={`Hi ${firstName}`} description="Here's what's waiting for you." />
      <div className="mb-6"><PayDateBanner payDate={payDate} owed={balance.owed} /></div>

      {justSent && <SubmittedBanner job={justSent} />}
      <PayPicture expected={expected} balance={balance} />

      <nav aria-label="Jump to" className="mt-6 flex flex-wrap gap-2">
        {groups.map((g) =>
          g.count ? (
            <a key={g.id} href={`#${g.id}`} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${g.tone}`}>
              {g.label} <span className="num">{g.count}</span>
            </a>
          ) : (
            <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-slate-400 ring-1 ring-slate-200 ring-inset">
              {g.label} <span className="num">0</span>
            </span>
          ),
        )}
      </nav>

      {open.length === 0 && (
        <div className="card mt-6">
          <EmptyState
            icon={CircleCheck}
            title="You're all caught up"
            description={openJobs ? `There ${openJobs === 1 ? "is 1 open job" : `are ${openJobs} open jobs`} you can request.` : "New jobs show up here when an admin assigns one to you or approves your request."}
            action={openJobs ? <Link href="/board" className="btn">Find work</Link> : undefined}
          />
        </div>
      )}

      <JobGroup id="changes" title="Needs changes" hint="An admin sent these back with instructions." jobs={changes} action="Fix" />
      <JobGroup id="in-progress" title="In progress" jobs={inProgress} action="Continue" />
      <JobGroup id="assigned" title="Assigned, not started" jobs={notStarted} action="Start" />

      {requests.length > 0 && (
        <Group id="requested" title="Requested" hint="Waiting for an admin to pick who gets each job.">
          <ul className="card divide-y divide-slate-100">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
                <span className="min-w-0"><span className="block font-medium break-words text-slate-900">{r.job.title}</span><JobTags job={r.job} className="mt-1 flex" /></span>
                <span className="num text-sm text-slate-500">{formatDuration(r.job.durationSeconds)} · {jobPayLabel(r.job)} · asked {formatRelative(r.createdAt)}</span>
              </li>
            ))}
          </ul>
          <Link href="/board" className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">Manage requests on Find work</Link>
        </Group>
      )}

      <DoneGroup id="awaiting" title="Submitted, awaiting review" hint="Waiting for an admin to check. Open one to see what you sent." jobs={awaiting} />
      <DoneGroup id="completed" title="Completed" hint="Approved by an admin. Open one to see what you sent." jobs={completed} />

      {openJobs > 0 && open.length > 0 && (
        <p className="mt-8 text-sm text-slate-500">
          <Link href="/board" className="font-medium text-brand-600 hover:text-brand-700">{openJobs} open job{openJobs === 1 ? "" : "s"} to request</Link> on Find work.
        </p>
      )}
    </>
  );
}

type MyJob = Prisma.JobGetPayload<{ include: { earnings: true } }>;

function Group({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function JobGroup({ id, title, hint, jobs, action }: { id: string; title: string; hint?: string; jobs: MyJob[]; action: string }) {
  if (jobs.length === 0) return null;
  return (
    <Group id={id} title={title} hint={hint}>
      <ul className="grid gap-3 md:grid-cols-2">
        {jobs.map((j) => {
          const Icon = j.mediaType.startsWith("video") ? FileVideo : FileAudio;
          const due = j.deadline ? formatDeadline(j.deadline) : null;
          return (
            <li key={j.id} className="min-w-0">
              <Link href={`/jobs/${j.id}`} className="card group flex items-center gap-4 p-4 transition hover:border-brand-200 hover:shadow-md">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block min-w-0 font-medium break-words text-slate-900">{j.title}</span><JobTags job={j} className="mt-1 flex" />
                  {j.reviewNote && <span className="mt-0.5 line-clamp-2 block text-sm text-red-700">{richText(j.reviewNote)}</span>}
                  <div className="num mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {formatDuration(j.durationSeconds)}</span>
                    <span className="font-medium text-slate-700">{jobPayLabel(j)}</span>
                    {due ? (
                      <span className={due.overdue ? "text-red-700" : due.soon ? "text-amber-700" : ""}>Due {due.text}</span>
                    ) : (
                      <span>Assigned {formatRelative(j.assignedAt)}</span>
                    )}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:text-brand-700">
                  {action} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Group>
  );
}

function SubmittedBanner({ job }: { job: MyJob }) {
  const earning = job.earnings[0];
  const pay = earning?.amount ?? 0;
  // Pay is credited once per job, so a resubmission finds it already there.
  const paidBefore = !!earning && !!job.submittedAt && +job.submittedAt - +earning.createdAt > 5000;
  return (
    <section role="status" className="relative mb-6 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-600/20 sm:p-5">
      <ClearSubmitted />
      <Link href="/jobs" scroll={false} aria-label="Dismiss" className="absolute top-3 right-3 rounded-md p-1 text-emerald-700 hover:bg-emerald-100"><X className="size-4" /></Link>
      <div className="flex gap-3 pr-6">
        <CircleCheck className="mt-0.5 size-6 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0 space-y-2 text-sm text-emerald-900">
          <p className="text-base font-semibold">Sent for review: {job.title}</p>
          <p>
            {paidBefore ? "Your corrected transcript is with the admins again. The pay for this job was already added, so it isn't counted twice." : <>About <span className="num font-semibold">{formatUGX(pay)}</span> has been added to <Link href="/earnings" className="font-medium underline">your earnings</Link> for this job.</>}
          </p>
          <div>
            <p className="font-medium">What happens next</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>An admin checks your work. You&apos;ll get a notification when they approve it or ask for changes.</li>
              <li>If they ask for changes, the job moves to Needs changes with their notes.</li>
              <li>Until it&apos;s reviewed, you can still take it back to fix a mistake.</li>
            </ul>
          </div>
          <Link href={`/jobs/${job.id}`} className="btn-secondary btn-sm inline-flex"><Eye className="size-3.5" /> View what you submitted</Link>
        </div>
      </div>
    </section>
  );
}

function DoneGroup({ id, title, hint, jobs }: { id: string; title: string; hint: string; jobs: MyJob[] }) {
  if (jobs.length === 0) return null;
  return (
    <Group id={id} title={title} hint={hint}>
      <ul className="card divide-y divide-slate-100">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link href={`/jobs/${j.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50 sm:px-6">
              <span className="min-w-0"><span className="block font-medium break-words text-slate-900">{j.title}</span><JobTags job={j} className="mt-1 flex" /></span>
              <span className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                <StatusBadge status={jobBadge(j)} />
                <span>{formatDuration(j.durationSeconds)} · {j.approvedAt ? `approved ${formatRelative(j.approvedAt)}` : `submitted ${formatDate(j.submittedAt)}`}</span>
                {j.earnings[0] && <span className="font-medium text-emerald-700">{formatUGX(j.earnings[0].amount)} earned</span>}
                <span className="inline-flex items-center gap-1 font-medium text-brand-600"><Eye className="size-4" aria-hidden /> View</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Group>
  );
}
