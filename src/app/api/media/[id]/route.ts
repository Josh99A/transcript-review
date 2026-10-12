import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/media";

// Streams a job's media to its admin or assignee from Cloudinary, passing Range through so players can seek.
// ?download=1 saves it as a file instead of playing it.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const job = await db.job.findUnique({ where: { id } });
  if (!job || (user.role !== "ADMIN" && job.assigneeId !== user.id)) return new Response("Not found", { status: 404 });
  if (job.mediaRemovedAt) return new Response("Media file missing", { status: 404 });

  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(mediaUrl(job.mediaPath), { headers: range ? { Range: range } : {} });
  } catch {
    return new Response("Media storage unreachable", { status: 502 });
  }
  if (upstream.status === 416) {
    const contentRange = upstream.headers.get("content-range");
    return new Response(null, { status: 416, headers: contentRange ? { "Content-Range": contentRange } : {} });
  }
  if (!upstream.ok || !upstream.body) return new Response("Media file missing", { status: 404 });

  const headers: Record<string, string> = { "Content-Type": job.mediaType, "Accept-Ranges": "bytes" };
  if (new URL(req.url).searchParams.get("download")) {
    const ext = job.mediaPath.includes(".") ? job.mediaPath.slice(job.mediaPath.lastIndexOf(".")) : "";
    const name = (job.title.replace(/[^\w\- ]+/g, "").trim() || "media") + ext;
    headers["Content-Disposition"] = `attachment; filename="${name}"`;
  }
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers[h] = v;
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
