import "server-only";
import { db } from "./db";

type Notice = { title: string; body?: string | null; href: string };

/** Records an in-app notification for each of the given people. Never throws: a lost notice mustn't fail the action. */
export async function notify(userIds: (string | null | undefined)[], notice: Notice) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  try {
    await db.notification.createMany({ data: ids.map((userId) => ({ userId, ...notice, body: notice.body?.slice(0, 300) ?? null })) });
  } catch (e) {
    console.error("notify failed", e);
  }
}

export async function notifyAdmins(notice: Notice) {
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await notify(admins.map((a) => a.id), notice);
}

export function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
