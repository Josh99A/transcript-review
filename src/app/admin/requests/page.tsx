import { Check, Inbox, X } from "lucide-react";
import JobTags from "@/components/JobTags";
import type { Metadata } from "next";
import Link from "next/link";
import { approveRequest, declineRequest } from "@/app/actions";
import { ActionForm } from "@/components/client";
import { EmptyState, PageHeader, UserCell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration, formatRelative } from "@/lib/format";
import { jobPayLabel } from "@/lib/pay";

export const metadata: Metadata = { title: "Requests" };

export default async function RequestsPage() {
  await requireAdmin();
  const jobs = await db.job.findMany({
    where: { status: "UNASSIGNED", requests: { some: { status: "PENDING" } } },
    include: {
      requests: {
        where: { status: "PENDING" },
        include: { user: { select: { name: true, email: true, languages: true, _count: { select: { jobs: { where: { status: "ASSIGNED" } } } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  // Jobs asked for longest ago first.
  jobs.sort((a, b) => +a.requests[0].createdAt - +b.requests[0].createdAt);
  const total = jobs.reduce((n, j) => n + j.requests.length, 0);

  return (
    <>
      <PageHeader
        title="Requests"
        description={total ? `${total} request${total === 1 ? "" : "s"} from transcribers waiting on you. Giving a job to one person declines the others.` : "Transcribers ask for jobs you post on the job board. Their requests show up here."}
      />
      {jobs.length === 0 ? (
        <section className="card">
          <EmptyState icon={Inbox} title="No requests waiting" description="Post a job on the job board from its page and transcribers can ask for it." />
        </section>
      ) : (
        <div className="space-y-4">
          {jobs.map((j) => (
            <section key={j.id} className="card">
              <div className="card-header flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/admin/jobs/${j.id}`} className="card-title min-w-0 hover:text-brand-700">{j.title}</Link><JobTags job={j} />
                <span className="num text-sm text-slate-500">{formatDuration(j.durationSeconds)} · {jobPayLabel(j)}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {j.requests.map((r) => (
                  <li key={r.id} className="space-y-2 px-4 py-3 sm:px-6">
                    <UserCell
                      name={r.user.name}
                      sub={`Asked ${formatRelative(r.createdAt)} · ${r.user._count.jobs ? `${r.user._count.jobs} job${r.user._count.jobs === 1 ? "" : "s"} in progress` : "No jobs in progress"} · ${r.user.languages.length ? r.user.languages.join(", ") : "no languages listed"}`}
                    />
                    {r.note && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{r.note}”</p>}
                    <div className="flex gap-2">
                      <ActionForm action={approveRequest} className="flex-1 sm:flex-none" confirm={{ title: `Give ${j.title} to ${r.user.name}?`, description: "Everyone else who asked for it is declined and told.", label: "Give it to them" }}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <button className="btn w-full"><Check className="size-4" /> Give it to {r.user.name.split(" ")[0]}</button>
                      </ActionForm>
                      <ActionForm action={declineRequest} confirm={{ title: `Decline ${r.user.name}'s request?`, description: "They're told it wasn't approved. They can ask again while the job is on the board.", label: "Decline", danger: true }}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <button className="btn-secondary" aria-label={`Decline ${r.user.name}`}><X className="size-4" /> Decline</button>
                      </ActionForm>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
