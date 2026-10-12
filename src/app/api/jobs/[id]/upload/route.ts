import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { docxToText } from "@/lib/docx";

const MAX_BYTES = 10 * 1024 * 1024;

/** Reads a transcriber's finished .docx or .txt and returns its text, so the editor can show it before they submit. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const job = await db.job.findUnique({ where: { id }, select: { assigneeId: true, status: true } });
  if (!job || job.assigneeId !== user.id) return NextResponse.json({ error: "This job isn't assigned to you." }, { status: 404 });
  if (job.status !== "ASSIGNED") return NextResponse.json({ error: "This job has already been submitted." }, { status: 409 });

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 10 MB." }, { status: 413 });
  let text: string;
  if (/\.docx$/i.test(file.name)) {
    try {
      text = await docxToText(Buffer.from(await file.arrayBuffer()));
    } catch {
      return NextResponse.json({ error: "Couldn't read that Word file. Save it as .docx and try again." }, { status: 400 });
    }
  } else if (/\.txt$/i.test(file.name)) {
    text = await file.text();
  } else {
    return NextResponse.json({ error: "Upload a Word .docx or a .txt file." }, { status: 400 });
  }
  if (!text.trim()) return NextResponse.json({ error: "That file has no text in it." }, { status: 400 });
  return NextResponse.json({ text });
}
