import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import IssueThread, { IssueStatus, issueInclude } from "@/components/IssueThread";
import StatusBadge, { jobBadge } from "@/components/StatusBadge";
import { PageHeader, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Issue" };

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const issue = await db.issue.findUnique({
    where: { id },
    include: { ...issueInclude, user: { select: { id: true, name: true, email: true } }, job: { select: { id: true, title: true, status: true, reviewNote: true, approvedAt: true, assigneeId: true } } },
  });
  if (!issue) notFound();
  const stillTheirs = issue.job.assigneeId === issue.user.id;

  return (
    <>
      <PageHeader
        back={<Link href={issue.status === "OPEN" ? "/admin/issues" : "/admin/issues?show=resolved"} className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Issues</Link>}
        title={issue.subject}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><IssueStatus status={issue.status} /><span>Raised {formatRelative(issue.createdAt)}</span></span>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card">
          <div className="card-header"><h2 className="card-title">Conversation</h2></div>
          <div className="card-body"><IssueThread issue={issue} admin /></div>
        </section>
        <section className="card h-fit">
          <div className="card-header"><h2 className="card-title">About</h2></div>
          <div className="card-body space-y-4 text-sm">
            <UserCell name={issue.user.name} sub={issue.user.email} />
            <div>
              <p className="text-slate-500">Job</p>
              <Link href={`/admin/jobs/${issue.job.id}`} className="mt-0.5 inline-flex items-center gap-1.5 font-medium break-words text-slate-900 hover:text-brand-700">{issue.job.title} <ExternalLink className="size-3.5 shrink-0" /></Link>
              <div className="mt-1"><StatusBadge status={jobBadge(issue.job)} /></div>
            </div>
            {!stillTheirs && <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">This job is no longer assigned to {issue.user.name}. They&apos;re still notified of your replies, but can&apos;t reply.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
