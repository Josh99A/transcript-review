import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { docText, type TranscriptFormat } from "@/lib/docText";
import { readTranscriptFile } from "@/lib/transcriptUpload";

/** Reads a transcriber's finished .docx or .txt and returns its text, so the editor can show it before they submit. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const job = await db.job.findUnique({ where: { id }, select: { assigneeId: true, status: true, transcriptFormat: true } });
  if (!job || job.assigneeId !== user.id) return NextResponse.json({ error: "This job isn't assigned to you." }, { status: 404 });
  if (job.status !== "ASSIGNED") return NextResponse.json({ error: "This job has already been submitted." }, { status: 409 });

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  const read = await readTranscriptFile(file, job.transcriptFormat as TranscriptFormat);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  const text = read.text;
  if (!(read.format === "html" ? docText(text) : text).trim()) return NextResponse.json({ error: "That file has no text in it." }, { status: 400 });
  return NextResponse.json({ text });
}
