import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { docxToText } from "@/lib/docx";
import { notify } from "@/lib/notify";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Replaces a job's transcript when an admin uploaded the wrong one. The transcriber's edits are based on the
 * old text, so they are replaced too. Everything else on the job (details, pay, who has it) stays as it is.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return NextResponse.json({ error: "Only admins can replace a transcript." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  let text = String(form?.get("text") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 10 MB." }, { status: 413 });
    if (/\.docx$/i.test(file.name)) {
      try {
        text = await docxToText(Buffer.from(await file.arrayBuffer()));
      } catch {
        return NextResponse.json({ error: "Couldn't read that Word file. Save it as .docx and try again." }, { status: 400 });
      }
    } else if (/\.txt$/i.test(file.name)) text = await file.text();
    else return NextResponse.json({ error: "Upload a Word .docx or a .txt file." }, { status: 400 });
  }
  text = text.replace(/\r\n?/g, "\n");
  if (!text.trim()) return NextResponse.json({ error: "The new transcript has no text in it." }, { status: 400 });

  const job = await db.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "This job no longer exists." }, { status: 404 });
  if (job.status === "SUBMITTED")
    return NextResponse.json({ error: job.approvedAt ? "This job is approved, so its transcript can't be replaced." : "This job is waiting for review. Send it back first, then replace the transcript." }, { status: 409 });
  // Conditional on the job still being where it was, so a submit in the meantime isn't overwritten.
  const { count } = await db.job.updateMany({
    where: { id, status: job.status, assigneeId: job.assigneeId },
    data: { originalTranscript: text, editedTranscript: text },
  });
  if (!count) return NextResponse.json({ error: "This job changed while you were looking at it. Reload and try again." }, { status: 409 });

  const hadEdits = job.editedTranscript !== job.originalTranscript;
  if (job.assigneeId) {
    await notify([job.assigneeId], {
      title: `New transcript for ${job.title}`,
      body: hadEdits
        ? "The admin uploaded the wrong transcript and replaced it. Your earlier edits were on the wrong text, so start again from the new one."
        : "The admin uploaded the wrong transcript and replaced it. Work on the new one.",
      href: `/jobs/${id}`,
      jobId: id,
    });
  }
  revalidatePath(`/admin/jobs/${id}`);
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
  return NextResponse.json({ ok: true, told: job.assigneeId ? true : false });
}
