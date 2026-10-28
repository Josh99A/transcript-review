import { cleanRich, richText } from "@/lib/richtext";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDeadline } from "@/lib/format";
import { deleteMedia, uploadMedia } from "@/lib/media";
import { mediaTypeOf } from "@/lib/mediaTypes";
import { parsePricing } from "@/lib/pay";
import { docText, type TranscriptFormat } from "@/lib/docText";
import { driveTranscript, openDriveFile } from "@/lib/drive";
import { readTranscriptFile } from "@/lib/transcriptUpload";

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
  const pricing = parsePricing(form);
  if ("error" in pricing) return NextResponse.json({ error: pricing.error }, { status: 400 });
  const { ratePerHour, fixedPay } = pricing;

  let transcript = String(form.get("transcriptText") ?? "");
  let transcriptFormat: TranscriptFormat = "text";
  // A Google Drive transcript is downloaded and then read just like an uploaded file.
  const driveTranscriptId = String(form.get("driveTranscriptId") ?? "");
  let transcriptFile = form.get("transcriptFile");
  if (driveTranscriptId) {
    const file = await driveTranscript(driveTranscriptId).catch(() => ({ error: "Couldn't reach Google Drive. Try again." }));
    if ("error" in file) return NextResponse.json({ error: file.error }, { status: 400 });
    transcriptFile = file;
  }
  if (transcriptFile instanceof File && transcriptFile.size > 0) {
    // Word files keep their formatting and tables.
    const read = await readTranscriptFile(transcriptFile);
    if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
    transcript = read.text;
    transcriptFormat = read.format;
  }

  if (!title) return NextResponse.json({ error: "Give the job a title." }, { status: 400 });
  const driveMediaId = String(form.get("driveMediaId") ?? "");
  if (!driveMediaId && (!(media instanceof File) || media.size === 0))
    return NextResponse.json({ error: "Choose an audio or video file." }, { status: 400 });
  const uploadedType = media instanceof File ? mediaTypeOf(media.name, media.type) : null;
  if (!driveMediaId && !uploadedType)
    return NextResponse.json({ error: "The media must be an audio or video file." }, { status: 400 });
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    return NextResponse.json({ error: "Couldn't read the media length. Enter it manually." }, { status: 400 });
  if (!(transcriptFormat === "html" ? docText(transcript) : transcript).trim()) return NextResponse.json({ error: "Add a transcript." }, { status: 400 });

  let source: ReadableStream<Uint8Array>;
  let total: number | null;
  let mediaType = uploadedType;
  if (driveMediaId) {
    // Copied straight from Drive into storage, without passing through the admin's browser.
    const file = await openDriveFile(driveMediaId, "media").catch(() => ({ error: "Couldn't reach Google Drive. Try again." }));
    if ("error" in file) return NextResponse.json({ error: file.error }, { status: 400 });
    mediaType = file.type;
    source = file.res.body!;
    total = file.size;
  } else {
    source = (media as File).stream();
    total = (media as File).size;
  }

  // Copying to storage can take a while, so the reply streams one JSON line per update: how much has been
  // copied so far, then the new job's id or an error. The upload form turns these into a progress bar.
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (msg: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
        } catch {
          // The admin left the page; the job is still created.
        }
      };
      let lastSent = 0;
      const onProgress = (copied: number) => {
        const now = Date.now();
        if (now - lastSent < 250 && copied !== total) return;
        lastSent = now;
        send({ copied, total });
      };
      let stored: Awaited<ReturnType<typeof uploadMedia>>;
      try {
        stored = await uploadMedia({ stream: () => source }, onProgress);
      } catch (err) {
        console.error(driveMediaId ? "Drive media copy failed" : "Media upload failed", err);
        send({ error: driveMediaId ? "Couldn't copy the recording from Google Drive. Try again, or use a smaller file." : "Couldn't store the media file. Try again, or use a smaller file." });
        return controller.close();
      }
      send({ copied: stored.bytes, total: stored.bytes, saved: true });
      try {
        const job = await db.job.create({
          data: {
            title,
            mediaPath: stored.name,
            mediaBytes: stored.bytes,
            mediaType: mediaType!,
            durationSeconds,
            ratePerHour,
            fixedPay,
            originalTranscript: transcript,
            editedTranscript: transcript,
            transcriptFormat,
            description,
            language,
            project,
            deadline,
            posted: assignTo === "",
            ...(assigneeId ? { assigneeId, status: "ASSIGNED", assignedAt: new Date() } : {}),
          },
        });
        send({ id: job.id });
      } catch (err) {
        console.error("Job create failed", err);
        await deleteMedia(stored.name);
        send({ error: "Couldn't save the job. Please try again." });
      }
      controller.close();
    },
  });
  // Turn off compression and proxy buffering, which would hold the updates back until the end.
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
}
