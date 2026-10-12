import { cleanRich, richText } from "@/lib/richtext";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDeadline } from "@/lib/format";
import { uploadMedia } from "@/lib/media";
import { mediaTypeOf } from "@/lib/mediaTypes";
import { parseRate } from "@/lib/pay";
import { docxToText } from "@/lib/docx";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await req.formData();
  const title = String(form.get("title") ?? "").trim();
  const media = form.get("media");
  const durationSeconds = Math.round(Number(form.get("durationSeconds")));
  // "" posts the job on the board, "__hold" keeps it unassigned and off the board.
  const assignTo = String(form.get("assigneeId") ?? "");
  const assigneeId = assignTo && assignTo !== "__hold" ? assignTo : null;
  const description = cleanRich(String(form.get("description") ?? "").slice(0, 50000));
  if (richText(description).length > 5000) return NextResponse.json({ error: "Keep the details under 5,000 characters." }, { status: 400 });
  const language = String(form.get("language") ?? "").trim().slice(0, 60) || null;
  if (!language) return NextResponse.json({ error: "Choose the job's language." }, { status: 400 });
  const project = String(form.get("project") ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || null;
  const deadline = parseDeadline(String(form.get("deadline") ?? ""));
  const ratePerHour = parseRate(form.get("ratePerHour"));
  if (ratePerHour === "invalid") return NextResponse.json({ error: "Enter the rate as a whole number of shillings per hour, or leave it empty." }, { status: 400 });

  let transcript = String(form.get("transcriptText") ?? "");
  const transcriptFile = form.get("transcriptFile");
  if (transcriptFile instanceof File && transcriptFile.size > 0) {
    if (/\.docx$/i.test(transcriptFile.name)) {
      try {
        transcript = await docxToText(Buffer.from(await transcriptFile.arrayBuffer()));
      } catch {
        return NextResponse.json({ error: "Couldn't read that Word file. Save it as .docx and try again." }, { status: 400 });
      }
    } else transcript = await transcriptFile.text();
  }

  if (!title) return NextResponse.json({ error: "Give the job a title." }, { status: 400 });
  if (!(media instanceof File) || media.size === 0)
    return NextResponse.json({ error: "Choose an audio or video file." }, { status: 400 });
  const mediaType = media instanceof File ? mediaTypeOf(media.name, media.type) : null;
  if (!mediaType)
    return NextResponse.json({ error: "The media must be an audio or video file." }, { status: 400 });
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    return NextResponse.json({ error: "Couldn't read the media length. Enter it manually." }, { status: 400 });
  if (!transcript.trim()) return NextResponse.json({ error: "Add a transcript." }, { status: 400 });

  let stored: Awaited<ReturnType<typeof uploadMedia>>;
  try {
    stored = await uploadMedia(media);
  } catch (err) {
    console.error("Media upload failed", err);
    return NextResponse.json({ error: "Couldn't store the media file. Try again, or use a smaller file." }, { status: 502 });
  }

  const job = await db.job.create({
    data: {
      title,
      mediaPath: stored.name,
      mediaBytes: stored.bytes,
      mediaType,
      durationSeconds,
      ratePerHour,
      originalTranscript: transcript,
      editedTranscript: transcript,
      description,
      language,
      project,
      deadline,
      posted: assignTo === "",
      ...(assigneeId ? { assigneeId, status: "ASSIGNED", assignedAt: new Date() } : {}),
    },
  });
  return NextResponse.json({ id: job.id });
}
