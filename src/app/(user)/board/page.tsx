import { CalendarClock, CircleCheck, Clock, FileAudio, FileVideo, Hourglass, Inbox, Search, Wallet } from "lucide-react";
import SortSelect from "@/components/SortSelect";
import { pickSort, sortJobs, sortOptions, type SortKey } from "@/lib/sort";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import RichText from "@/components/RichText";
import type { Metadata } from "next";
import { EmptyState, PageHeader, StatList } from "@/components/ui";
import Filters from "./Filters";
import JobTags from "@/components/JobTags";
import { projectNames } from "@/lib/projects";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDeadline, formatDuration, formatRelative, formatUGX } from "@/lib/format";
import RequestButton from "./RequestButton";
import { jobPayLabel } from "@/lib/pay";

export const metadata: Metadata = { title: "Find work" };

const LENGTHS: Record<string, { label: string; where: Prisma.IntFilter }> = {
  short: { label: "Short (under 15 min)", where: { lt: 15 * 60 } },
  medium: { label: "Medium (15 to 45 min)", where: { gte: 15 * 60, lte: 45 * 60 } },
  long: { label: "Long (over 45 min)", where: { gt: 45 * 60 } },
};
const BOARD_SORTS: SortKey[] = ["deadline", "posted_new", "posted_old", "longest", "shortest", "pay_high", "pay_low", "title"];

type Params = { project?: string; length?: string; type?: string; language?: string; rate?: string; sort?: string };

export default async function BoardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireRole("USER");
  const sp = await searchParams;
  const length = sp.length && LENGTHS[sp.length] ? sp.length : "";
  const type = sp.type === "audio" || sp.type === "video" ? sp.type : "";
  const rate = sp.rate === "usual" || sp.rate === "custom" ? sp.rate : "";
  const sort = await pickSort("board", sp.sort, BOARD_SORTS, "deadline");
  const open: Prisma.JobWhereInput = { posted: true, status: "UNASSIGNED" };
  const [projects, languages, counts, mine] = await Promise.all([
    projectNames(open),
    db.job.findMany({ where: { ...open, language: { not: null } }, select: { language: true }, distinct: ["language"], orderBy: { language: "asc" } }),
    db.job.groupBy({ by: ["status"], where: { OR: [open, { assigneeId: { not: null } }] }, _count: true }),
    db.job.count({ where: { assigneeId: user.id, status: "ASSIGNED" } }),
  ]);
  const languageList = languages.map((l) => l.language!).filter(Boolean);
  const language = sp.language && languageList.includes(sp.language) ? sp.language : "";
  const project = sp.project && projects.includes(sp.project) ? sp.project : "";
  const jobs = await db.job.findMany({
    where: {
      ...open,
      ...(length ? { durationSeconds: LENGTHS[length].where } : {}),
      ...(type ? { mediaType: { startsWith: type } } : {}),
      ...(language ? { language } : {}),
      ...(project ? { project } : {}),
      ...(rate === "usual" ? { ratePerHour: null } : rate === "custom" ? { ratePerHour: { not: null } } : {}),
    },
    include: { requests: { where: { userId: user.id } } },
  });
  sortJobs(jobs, sort);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const posted = count("UNASSIGNED");
  const inProgress = count("ASSIGNED");
  const done = count("SUBMITTED");
  const filtered = Boolean(project || length || type || language || rate);
  const any = { value: "", label: "Any" };
  const fields = [
    ...(projects.length > 0 ? [{ name: "project", label: "Project", value: project, options: [any, ...projects.map((p) => ({ value: p, label: p }))] }] : []),
    { name: "length", label: "Length", value: length, options: [any, ...Object.entries(LENGTHS).map(([value, l]) => ({ value, label: l.label }))] },
    { name: "type", label: "Media", value: type, options: [any, { value: "audio", label: "Audio" }, { value: "video", label: "Video" }] },
    ...(languageList.length > 0 ? [{ name: "language", label: "Language", value: language, options: [any, ...languageList.map((l) => ({ value: l, label: l }))] }] : []),
    { name: "rate", label: "Rate", value: rate, options: [any, { value: "usual", label: "Usual rate" }, { value: "custom", label: "Special rate" }] },
  ];

  return (
    <>
      <PageHeader title="Find work" description="Jobs waiting for a transcriber. Request the ones you'd like and an admin will pick who gets each one." />
      <div className="mb-4">
        <StatList
          stats={[
            { icon: Inbox, label: "Posted", value: posted, tone: "brand", hint: "Open to request now" },
            { icon: CircleCheck, label: "Assigned", value: inProgress + done, tone: "emerald", hint: `${done} finished` },
            { icon: Hourglass, label: "In progress", value: inProgress, tone: "amber", hint: mine > 0 ? <Link href="/jobs" className="font-medium text-brand-600 hover:text-brand-700">{mine} of them yours</Link> : "None of them yours" },
          ]}
        />
      </div>
      {posted > 0 && <Filters fields={fields} active={filtered} sort={<SortSelect page="board" value={sort} options={sortOptions(BOARD_SORTS)} />} />}
      {filtered && jobs.length > 0 && <p className="mb-3 text-sm text-slate-500">Showing {jobs.length} of {posted} open job{posted === 1 ? "" : "s"}</p>}
      {jobs.length === 0 ? (
        <div className="card">
          {filtered ? (
            <EmptyState icon={Search} title="No jobs match these filters" description="Try a different project, language, length or rate." action={<Link href="/board" className="btn-secondary">Clear filters</Link>} />
          ) : (
            <EmptyState icon={Search} title="No open jobs right now" description="New jobs show up here as soon as an admin posts them." />
          )}
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
                    <JobTags job={j} className="mt-2 flex" />
                  </div>
                </div>
                <dl className="num mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600">
                  <div className="inline-flex items-center gap-1.5"><Clock className="size-4 text-slate-400" /><dt className="sr-only">Length</dt><dd>{formatDuration(j.durationSeconds)}</dd></div>
                  <div className="inline-flex items-center gap-1.5"><Wallet className="size-4 text-slate-400" /><dt className="sr-only">Expected pay</dt><dd>{jobPayLabel(j)} expected</dd></div>
                  {due && (
                    <div className={`inline-flex items-center gap-1.5 ${due.overdue ? "text-red-700" : due.soon ? "text-amber-700" : ""}`}>
                      <CalendarClock className="size-4 opacity-70" /><dt className="sr-only">Deadline</dt><dd>{due.text}</dd>
                    </div>
                  )}
                </dl>
                {j.description && <RichText html={j.description} className="mt-3 text-sm text-slate-700" />}
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
