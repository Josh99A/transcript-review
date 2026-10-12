import { getCurrentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** Unread count for the bell, polled by the browser. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ unread: 0 }, { status: 401 });
  return Response.json({ unread: await unreadCount(user.id) }, { headers: { "Cache-Control": "no-store" } });
}
