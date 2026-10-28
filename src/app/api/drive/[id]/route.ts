import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { openDriveFile } from "@/lib/drive";

/** Streams a Drive recording to the upload form, so the browser can read its length before the job is created. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const file = await openDriveFile(id, "media", req.headers.get("range")).catch(() => ({ error: "Couldn't reach Google Drive." }));
  if ("error" in file) return NextResponse.json({ error: file.error }, { status: 400 });
  const headers = new Headers({ "content-type": file.type, "cache-control": "private, no-store", "accept-ranges": "bytes" });
  // fetch has already undone any compression, so the length only holds for an uncompressed download.
  for (const h of file.res.headers.get("content-encoding") ? ["content-range"] : ["content-length", "content-range"]) {
    const v = file.res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(file.res.body, { status: file.res.status === 206 ? 206 : 200, headers });
}
