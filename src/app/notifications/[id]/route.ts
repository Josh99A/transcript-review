import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Relative Location headers: behind Render's proxy the request URL is the internal localhost address.
const go = (path: string) => new Response(null, { status: 303, headers: { Location: path } });

/** Marks one notification read and takes its owner to what it's about, as things stand now. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return go("/login");
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) return go("/notifications");
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  // Only ever an in-app path.
  if (!n.href.startsWith("/") || n.href.startsWith("//")) return go("/notifications");
  return go(await resolve(n.href, user));
}

/** Job links are checked against the job's current state, so an old notice never lands on a dead end. */
async function resolve(href: string, user: { id: string; role: string }) {
  const admin = href.match(/^\/admin\/jobs\/([^/#?]+)/);
  if (admin) {
    if (user.role !== "ADMIN") return "/notifications";
    const job = await db.job.findUnique({ where: { id: admin[1] }, select: { status: true } });
    if (!job) return "/admin";
    // A submitted job opens at its review, including once it's been approved, so the outcome is in view.
    return job.status === "SUBMITTED" ? `/admin/jobs/${admin[1]}#review` : `/admin/jobs/${admin[1]}`;
  }
  const mine = href.match(/^\/jobs\/([^/#?]+)(#[\w-]+)?/);
  if (mine) {
    const job = await db.job.findUnique({ where: { id: mine[1] }, select: { assigneeId: true } });
    return job?.assigneeId === user.id ? `/jobs/${mine[1]}${mine[2] ?? ""}` : "/jobs";
  }
  if (href.startsWith("/admin") && user.role !== "ADMIN") return "/notifications";
  return href;
}
