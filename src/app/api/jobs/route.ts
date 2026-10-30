import { cleanRich, richText } from "@/lib/richtext";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDeadline } from "@/lib/format";
import { deleteMedia, readMediaToken, uploadMedia } from "@/lib/media";
import { mediaTypeOf } from "@/lib/mediaTypes";
import { parsePricing } from "@/lib/pay";
import { docText, type TranscriptFormat } from "@/lib/docText";
import { driveTranscript, openDriveFile } from "@/lib/drive";
import { readTranscriptFile } from "@/lib/transcriptUpload";
import { announceJob } from "@/lib/newJobAlerts";
import { DEFAULT_JOB_INSTRUCTIONS } from "@/lib/jobInstructions";
import { notifyAdminAssignment } from "@/lib/assignmentNotices";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await req.formData();
  // A retry of an upload that already made its job (say the reply was lost) gets that job back, not a second one.
  const uploadKey = String(form.get("uploadKey") ?? "").slice(0, 64) || null;
  const made = uploadKey ? await db.job.findUnique({ where: { uploadKey }, select: { id: true } }) : null;
  if (made) return NextResponse.json({ id: made.id });
  const title = String(form.get("title") ?? "").trim();
  const durationSeconds = Math.round(Number(form.get("durationSeconds")));
  // "" posts the job on the board, "__hold" keeps it unassigned and off the board.
  const assignTo = String(form.get("assigneeId") ?? "");
  const assigneeId = assignTo && assignTo !== "__hold" ? assignTo : null;
  if (assigneeId) {
    const assignee = await db.user.findUnique({ where: { id: assigneeId }, select: { role: true } });
    if (assignee?.role !== "USER") return NextResponse.json({ error: "Jobs can only go to transcribers." }, { status: 400 });
  }
  const description = cleanRich(String(form.get("description") ?? DEFAULT_JOB_INSTRUCTIONS).slice(0, 50000));
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
  // A media file the browser sent in pieces arrives as a signed token for the stored file; Drive media is copied here.
  const driveMediaId = String(form.get("driveMediaId") ?? "");
  const uploaded = readMediaToken(String(form.get("mediaToken") ?? ""));
  if (!driveMediaId && !uploaded) return NextResponse.json({ error: "Choose an audio or video file." }, { status: 400 });
  const uploadedType = uploaded ? mediaTypeOf(String(form.get("mediaName") ?? ""), String(form.get("mediaMime") ?? "")) : null;
  if (!driveMediaId && !uploadedType)
    return NextResponse.json({ error: "The media must be an audio or video file." }, { status: 400 });
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    return NextResponse.json({ error: "Couldn't read the media length. Enter it manually." }, { status: 400 });
  if (!(transcriptFormat === "html" ? docText(transcript) : transcript).trim()) return NextResponse.json({ error: "Add a transcript." }, { status: 400 });

  // The same recording is never stored twice. The upload form checks before sending; this catches two at once.
  const fingerprint = driveMediaId ? `drive:${driveMediaId}` : String(form.get("fingerprint") ?? "").slice(0, 100) || null;
  const duplicate = fingerprint ? await db.job.findFirst({ where: { mediaFingerprint: fingerprint }, select: { title: true } }) : null;
  if (duplicate) {
    if (uploaded) await deleteMedia(uploaded.name);
    return NextResponse.json({ error: `This recording is already uploaded as “${duplicate.title}”.` }, { status: 409 });
  }

  const createJob = async (stored: { name: string; bytes: number }, mediaType: string) => {
    const job = await db.job.create({
      data: {
        title,
        mediaPath: stored.name,
        mediaBytes: stored.bytes,
        mediaType,
        mediaFingerprint: fingerprint,
        uploadKey,
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
    await notifyAdminAssignment(job, user);
    return job;
  };

  if (uploaded) {
    // The file stays stored if this fails, so the form can try again without sending it a second time.
    const job = await createJob(uploaded, uploadedType!);
    if (job.posted) announceJob(job.id);
    return NextResponse.json({ id: job.id });
  }

  // Copied straight from Drive into storage, without passing through the admin's browser.
  const file = await openDriveFile(driveMediaId, "media").catch(() => ({ error: "Couldn't reach Google Drive. Try again." }));
  if ("error" in file) return NextResponse.json({ error: file.error }, { status: 400 });
  const source = file.res.body!;
  const total = file.size;

  // Copying from Drive can take a while, so the reply streams one JSON line per update: how much has been
  // copied so far, then the new job's id or an error. The upload form turns these into a progress bar.
  // If the admin cancels, the browser drops the reply and the copy stops without creating the job.
  const cancelled = new AbortController();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (msg: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
        } catch {
          // The admin left the page; the job is still created unless they cancelled.
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
        stored = await uploadMedia({ stream: () => source }, onProgress, cancelled.signal);
      } catch (err) {
        if (!cancelled.signal.aborted) {
          console.error("Drive media copy failed", err);
          send({ error: "Couldn't copy the recording from Google Drive. Try again, or use a smaller file." });
        }
        return controller.close();
      }
      if (cancelled.signal.aborted) {
        await deleteMedia(stored.name);
        return;
      }
      send({ copied: stored.bytes, total: stored.bytes, saved: true });
      try {
        const job = await createJob(stored, file.type);
        if (job.posted) announceJob(job.id);
        send({ id: job.id });
      } catch (err) {
        console.error("Job create failed", err);
        await deleteMedia(stored.name);
        send({ error: "Couldn't save the job. Please try again." });
      }
      controller.close();
    },
    cancel() {
      cancelled.abort();
    },
  });
  // Turn off compression and proxy buffering, which would hold the updates back until the end.
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
}
