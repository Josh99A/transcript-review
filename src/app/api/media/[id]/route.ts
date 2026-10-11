import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mediaFile } from "@/lib/media";

// Streams a job's media to its admin or assignee, with Range support so players can seek.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const job = await db.job.findUnique({ where: { id } });
  if (!job || (user.role !== "ADMIN" && job.assigneeId !== user.id)) return new Response("Not found", { status: 404 });

  const file = mediaFile(job.mediaPath);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response("Media file missing", { status: 404 });
  }

  const headers: Record<string, string> = { "Content-Type": job.mediaType, "Accept-Ranges": "bytes" };
  const range = req.headers.get("range");
  const match = range?.match(/bytes=(\d*)-(\d*)/);
  if (match && (match[1] || match[2])) {
    let start: number, end: number;
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    } else {
      start = Math.max(size - Number(match[2]), 0);
      end = size - 1;
    }
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
}
