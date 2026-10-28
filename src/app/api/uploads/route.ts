import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CHUNK, deleteMedia, mediaToken, readMediaToken, uploadChunk } from "@/lib/media";

/**
 * Takes one piece of a media file from the upload form and passes it on to storage. Sending a file in pieces
 * lets the admin pause an upload and carry on later. The last piece answers with a token for creating the job.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const uploadId = req.headers.get("x-upload-id") ?? "";
  const range = req.headers.get("content-range")?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (!/^[a-f0-9]{32}$/.test(uploadId) || !range) return NextResponse.json({ error: "Bad upload" }, { status: 400 });
  const [start, end, total] = range.slice(1).map(Number);
  const chunk = Buffer.from(await req.arrayBuffer());
  if (chunk.length !== end - start + 1 || chunk.length > CHUNK || end >= total)
    return NextResponse.json({ error: "Bad upload" }, { status: 400 });

  try {
    const stored = await uploadChunk(chunk, uploadId, start, total);
    return NextResponse.json(stored ? { token: mediaToken(stored) } : { ok: true });
  } catch (err) {
    console.error("Media chunk upload failed", err);
    return NextResponse.json({ error: "Couldn't store the media file. Try again." }, { status: 502 });
  }
}

/** Throws away a stored file whose job was never created, e.g. when the admin cancels after a failed upload. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const stored = readMediaToken(new URL(req.url).searchParams.get("token") ?? "");
  if (stored) await deleteMedia(stored.name);
  return NextResponse.json({ ok: true });
}

/** Tells the upload form whether a recording is already a job, before it sends the file again. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const fingerprint = new URL(req.url).searchParams.get("fingerprint") ?? "";
  const job = fingerprint ? await db.job.findFirst({ where: { mediaFingerprint: fingerprint }, select: { id: true, title: true } }) : null;
  return NextResponse.json({ job });
}
