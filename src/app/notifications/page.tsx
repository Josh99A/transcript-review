import { Bell, CheckCheck } from "lucide-react";
import type { Metadata } from "next";
import { markAllNotificationsRead } from "@/app/actions";
import { ActionForm } from "@/components/client";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatRelative } from "@/lib/format";
import { isOutdated, jobNowLabel } from "@/lib/noticeState";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { job: { select: { status: true, assigneeId: true, approvedAt: true, reviewNote: true, submittedAt: true } } },
  });
  const admin = user.role === "ADMIN";
  // A notice whose job has since moved on is shown as out of date, with what the job is doing now.
  const outdated = (n: (typeof items)[number]) => isOutdated(n.kind, n.job, n.kind != null, user.id);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          unread > 0 && (
            <ActionForm action={markAllNotificationsRead}>
              <button className="btn-secondary"><CheckCheck className="size-4" /> Mark all as read</button>
            </ActionForm>
          )
        }
      />
      <section className="card">
        {items.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" description="Requests, submissions, reviews and payments will show up here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id}>
                <a href={`/notifications/${n.id}`} className={`flex gap-3 px-4 py-3.5 hover:bg-slate-50 sm:px-6 ${n.readAt ? "" : "bg-brand-50/50"}`}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-600"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${outdated(n) ? "text-slate-500" : n.readAt ? "text-slate-700" : "font-medium text-slate-900"}`}>{n.title}</span>
                    {outdated(n) && (
                      <span className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset">Out of date</span>
                        <span className="text-slate-600">{jobNowLabel(n.job, user.id, admin)}</span>
                      </span>
                    )}
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-slate-500">{n.body}</span>}
                    <span className="mt-1 block text-xs text-slate-400">{formatRelative(n.createdAt)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
