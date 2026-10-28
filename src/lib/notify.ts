import "server-only";
import { db } from "./db";
import { type Detail, emailConfigured, sendEmailsLater } from "./email";
import { isOutdated } from "./noticeState";

type Notice = {
  title: string;
  body?: string | null;
  href: string;
  jobId?: string | null;
  kind?: string | null;
  /** Also email it, for the things people need to know about even when they're not in the app. */
  email?: boolean;
  /** Extra facts listed in the email only. */
  details?: Detail[];
};

/** Records an in-app notification for each of the given people, and emails it if asked. Never throws: a lost notice mustn't fail the action. */
export async function notify(userIds: (string | null | undefined)[], notice: Notice) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  const { email, details, ...row } = notice;
  try {
    await db.notification.createMany({ data: ids.map((userId) => ({ userId, ...row, body: row.body?.slice(0, 300) ?? null })) });
  } catch (e) {
    console.error("notify failed", e);
  }
  if (!email || !emailConfigured()) return;
  try {
    const people = await db.user.findMany({ where: { id: { in: ids } }, select: { email: true, name: true } });
    sendEmailsLater(people.map((p) => ({ to: p.email, name: p.name, subject: row.title, body: row.body, details, href: row.href })));
  } catch (e) {
    console.error("notify email failed", e);
  }
}

export async function notifyAdmins(notice: Notice) {
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await notify(admins.map((a) => a.id), notice);
}

export function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

/**
 * After a job changes, unread notifications about it that no longer hold (a submission that was
 * taken back, a review someone else already did) are marked read so they don't sit in the bell count.
 * They stay in the list, labelled with what the job is doing now.
 */
export async function settleNotices(jobId: string) {
  try {
    const [job, unread] = await Promise.all([
      db.job.findUnique({ where: { id: jobId }, select: { status: true, assigneeId: true, approvedAt: true, reviewNote: true, submittedAt: true } }),
      db.notification.findMany({ where: { jobId, readAt: null, kind: { not: null } }, select: { id: true, kind: true, userId: true } }),
    ]);
    const stale = unread.filter((n) => isOutdated(n.kind, job, true, n.userId)).map((n) => n.id);
    if (stale.length) await db.notification.updateMany({ where: { id: { in: stale } }, data: { readAt: new Date() } });
  } catch (e) {
    console.error("settleNotices failed", e);
  }
}
