import { LifeBuoy, MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { IssueStatus } from "@/components/IssueThread";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Issues" };

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdmin();
  const resolved = (await searchParams).show === "resolved";
  const [issues, openCount] = await Promise.all([
    db.issue.findMany({
      where: { status: resolved ? "RESOLVED" : "OPEN" },
      orderBy: { updatedAt: resolved ? "desc" : "asc" },
      take: 200,
      include: {
        job: { select: { title: true } },
        user: { select: { name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, include: { author: { select: { name: true, role: true } } } },
        _count: { select: { messages: true } },
      },
    }),
    db.issue.count({ where: { status: "OPEN" } }),
  ]);
  const tab = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${on ? "bg-brand-50 text-brand-700 ring-brand-600/20" : "text-slate-600 ring-slate-200"}`;

  return (
    <>
      <PageHeader
        title="Issues"
        description={openCount ? `${openCount} open issue${openCount === 1 ? "" : "s"} from transcribers. Reply, then mark each one resolved.` : "Problems transcribers raise about their jobs show up here."}
      />
      <div className="mb-4 flex gap-2" role="tablist">
        <Link href="/admin/issues" role="tab" aria-selected={!resolved} className={tab(!resolved)}>Open{openCount ? ` (${openCount})` : ""}</Link>
        <Link href="/admin/issues?show=resolved" role="tab" aria-selected={resolved} className={tab(resolved)}>Resolved</Link>
      </div>
      {issues.length === 0 ? (
        <section className="card">
          <EmptyState icon={LifeBuoy} title={resolved ? "No resolved issues yet" : "No open issues"} description={resolved ? "Issues you resolve are kept here." : "When a transcriber raises a problem with a job, it lands here."} />
        </section>
      ) : (
        <section className="card divide-y divide-slate-100">
          {issues.map((i) => {
            const last = i.messages[0];
            const waiting = i.status === "OPEN" && last?.author.role !== "ADMIN";
            return (
              <Link key={i.id} href={`/admin/issues/${i.id}`} className="block px-4 py-3.5 hover:bg-slate-50 sm:px-6">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 font-medium break-words text-slate-900">{i.subject}</span>
                  <IssueStatus status={i.status} />
                  {waiting && <span className="text-xs font-medium text-amber-700">Needs your reply</span>}
                  <span className="ml-auto text-xs text-slate-500">{formatRelative(i.updatedAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-500">{i.user.name} · {i.job.title}</p>
                {last && (
                  <p className="mt-1 line-clamp-2 flex gap-1.5 text-sm text-slate-700">
                    <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                    <span><span className="font-medium">{last.author.name}:</span> {last.body}</span>
                  </p>
                )}
                <p className="num mt-1 text-xs text-slate-400">{i._count.messages} message{i._count.messages === 1 ? "" : "s"}</p>
              </Link>
            );
          })}
        </section>
      )}
    </>
  );
}
