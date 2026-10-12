import { Bell, CheckCheck } from "lucide-react";
import type { Metadata } from "next";
import { markAllNotificationsRead } from "@/app/actions";
import { ActionForm } from "@/components/client";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
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
                    <span className={`block text-sm ${n.readAt ? "text-slate-700" : "font-medium text-slate-900"}`}>{n.title}</span>
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
