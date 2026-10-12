import { ArrowRight, Check, CircleCheck, ClipboardCheck, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { approveJob } from "@/app/actions";
import { ActionForm } from "@/components/client";
import { EmptyState, PageHeader, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration, formatRelative } from "@/lib/format";
import { jobPayLabel } from "@/lib/pay";

export const metadata: Metadata = { title: "Reviews" };

/** Rough word-level change count, so admins can see at a glance how much was edited. */
function changedWords(original: string, edited: string) {
  const a = original.split(/\s+/).filter(Boolean);
  const b = edited.split(/\s+/).filter(Boolean);
  const count = new Map<string, number>();
  for (const w of a) count.set(w, (count.get(w) ?? 0) + 1);
  let kept = 0;
  for (const w of b) {
    const n = count.get(w) ?? 0;
    if (n > 0) {
      kept++;
      count.set(w, n - 1);
    }
  }
  return { added: b.length - kept, removed: a.length - kept };
}

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdmin();
  const showApproved = (await searchParams).show === "approved";
  const [waiting, approved] = await Promise.all([
    db.job.findMany({
      where: { status: "SUBMITTED", approvedAt: null },
      include: { assignee: { select: { name: true } } },
      orderBy: { submittedAt: "asc" },
    }),
    db.job.findMany({
      where: { status: "SUBMITTED", approvedAt: { not: null } },
      include: { assignee: { select: { name: true } } },
      orderBy: { approvedAt: "desc" },
      take: 50,
    }),
  ]);
  const jobs = showApproved ? approved : waiting;

  return (
    <>
      <PageHeader
        title="Reviews"
        description={waiting.length ? `${waiting.length} submission${waiting.length === 1 ? "" : "s"} waiting for you, oldest first. Open one to compare it with the original, then approve it or send it back.` : "Submitted transcripts land here for you to approve or send back."}
      />
      <div className="mb-4 flex gap-2" role="tablist">
        <Link href="/admin/reviews" role="tab" aria-selected={!showApproved} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${!showApproved ? "bg-brand-50 text-brand-700 ring-brand-600/20" : "text-slate-600 ring-slate-200"}`}>
          Waiting <span className="num">{waiting.length}</span>
        </Link>
        <Link href="/admin/completed" className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 ring-inset">
          Completed
        </Link>
      </div>

      {jobs.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={showApproved ? CircleCheck : ClipboardCheck}
            title={showApproved ? "Nothing approved yet" : "No submissions waiting"}
            description={showApproved ? "Jobs you approve show up here." : "When a transcriber submits a job, it shows up here and you get a notification."}
          />
        </section>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => {
            const c = changedWords(j.originalTranscript, j.editedTranscript);
            return (
              <li key={j.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/jobs/${j.id}#review`} className="font-medium break-words text-slate-900 hover:text-brand-700">{j.title}</Link>
                    <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{formatDuration(j.durationSeconds)}</span>
                      <span>{jobPayLabel(j)}</span>
                      <span className="text-emerald-700">+{c.added} words</span>
                      <span className="text-red-700">−{c.removed} words</span>
                      {j.revisions > 0 && <span className="text-orange-700">Resubmitted (round {j.revisions + 1})</span>}
                    </div>
                  </div>
                  <UserCell name={j.assignee?.name ?? "Unknown"} sub={showApproved ? `Approved ${formatRelative(j.approvedAt)}` : `Submitted ${formatRelative(j.submittedAt)}`} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/admin/jobs/${j.id}#review`} className="btn flex-1 whitespace-nowrap sm:flex-none">
                    {showApproved ? "Open" : "Review"} <ArrowRight className="size-4" />
                  </Link>
                  {!showApproved && (
                    <ActionForm action={approveJob} confirm={{ title: `Approve ${j.title}?`, description: `${j.assignee?.name ?? "The transcriber"} is told it was accepted, and it moves to Completed. Open it first if you haven't checked the changes.`, label: "Approve" }}>
                      <input type="hidden" name="jobId" value={j.id} />
                      <button className="btn-secondary"><Check className="size-4" /> Approve</button>
                    </ActionForm>
                  )}
                  <a href={`/api/jobs/${j.id}/transcript?format=docx`} className="btn-ghost"><Download className="size-4" /> .docx</a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
