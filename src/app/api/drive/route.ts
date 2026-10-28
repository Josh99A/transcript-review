import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { driveFileId, openDriveFile, type DriveKind } from "@/lib/drive";

/** Looks up a Google Drive link for the upload form: the file's name, type and size, without downloading it. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const url = new URL(req.url);
  const kind: DriveKind = url.searchParams.get("kind") === "transcript" ? "transcript" : "media";
  const id = driveFileId(url.searchParams.get("link") ?? "");
  if (!id) return NextResponse.json({ error: "Paste the link from Drive's Share > Copy link." }, { status: 400 });
  try {
    const file = await openDriveFile(id, kind, kind === "media" ? "bytes=0-0" : null);
    if ("error" in file) return NextResponse.json({ error: file.error }, { status: 400 });
    void file.res.body?.cancel().catch(() => {});
    return NextResponse.json({ id, name: file.name, type: file.type, size: file.size });
  } catch (err) {
    console.error("Google Drive lookup failed", err);
    return NextResponse.json({ error: "Couldn't reach Google Drive. Try again." }, { status: 502 });
  }
}
