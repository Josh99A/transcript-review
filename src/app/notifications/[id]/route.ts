import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Relative Location headers: behind Render's proxy the request URL is the internal localhost address.
const go = (path: string) => new Response(null, { status: 303, headers: { Location: path } });

/** Marks one notification read and takes its owner to what it's about. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return go("/login");
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) return go("/notifications");
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  // Only ever an in-app path.
  return go(n.href.startsWith("/") && !n.href.startsWith("//") ? n.href : "/notifications");
}
