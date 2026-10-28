"use client";

import RichTextEditor from "@/components/RichTextEditor";
import { LanguageField, ProjectField } from "@/components/JobFields";
import { CloudUpload, FileAudio, FileText, FileVideo, Link2, Pencil, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/client";
import { formatDuration, formatUGX } from "@/lib/format";
import { adtsDuration, MEDIA_ACCEPT, mediaTypeOf, mp4Duration } from "@/lib/mediaTypes";
import { expectedPayFor } from "@/lib/pay";
import { formatBytes, useUploads } from "../../Uploads";

/** Reads the length of an audio/video file in the browser: a picked file, or a Google Drive one through the app. */
async function readDuration(source: File | string, type: string): Promise<number> {
  const bytes = async () => new Uint8Array(typeof source === "string" ? await (await fetch(source)).arrayBuffer() : await source.arrayBuffer());
  // Raw AAC files often report no length (or a rough guess), so count their frames instead.
  if (type === "audio/aac") {
    const d = adtsDuration(await bytes());
    if (d) return d;
  }
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    return await playerDuration(url, type);
  } catch (e) {
    // Browsers without the codec can still give us the length from an MP4/M4A header.
    if (/mp4|quicktime/.test(type)) {
      const d = mp4Duration(await bytes());
      if (d) return d;
    }
    throw e;
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}

function playerDuration(url: string, type: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(type.startsWith("video") ? "video" : "audio");
    el.preload = "metadata";
    // Stop loading once we have the length, so a long Drive recording isn't downloaded for nothing.
    const done = () => {
      el.onerror = el.onloadedmetadata = null;
      el.removeAttribute("src");
      el.load();
    };
    el.onloadedmetadata = () => {
      const d = el.duration;
      done();
      if (Number.isFinite(d)) resolve(d);
      else reject(new Error("unknown length"));
    };
    el.onerror = () => {
      done();
      reject(new Error("unreadable"));
    };
    el.src = url;
  });
}

/**
 * Identifies a recording without reading all of it: a hash of its size, first and last megabyte. The same file
 * picked again, even renamed, gives the same answer, so it isn't uploaded twice.
 */
async function fingerprintOf(file: File): Promise<string> {
  const MB = 1024 * 1024;
  if (!crypto.subtle) return `file:${file.size}:${file.lastModified}:${file.name}`;
  const sample = await new Blob([`${file.size}:`, file.slice(0, MB), file.slice(Math.max(0, file.size - MB))]).arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", sample));
  return `file:${Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

type DriveInfo = { id: string; name: string; type: string; size: number | null };

/** Paste a Google Drive share link and look the file up. */
function DriveLink({ kind, onPick }: { kind: "media" | "transcript"; onPick: (file: DriveInfo) => void }) {
  const [link, setLink] = useState("");
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function look() {
    if (!link.trim() || looking) return;
    setError(null);
    setLooking(true);
    try {
      const res = await fetch(`/api/drive?kind=${kind}&link=${encodeURIComponent(link.trim())}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "Couldn't open that link. Try again.");
      setLink("");
      onPick(body);
    } catch {
      setError("Couldn't reach Google Drive. Check your connection and try again.");
    } finally {
      setLooking(false);
    }
  }

  const id = `drive-${kind}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{kind === "media" ? "Or use a recording from Google Drive" : "Google Drive link"}</label>
      <div className="flex gap-2">
        <input className="input min-w-0 flex-1" id={id} type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); look(); } }}
          placeholder="https://drive.google.com/file/d/…" />
        <button type="button" className="btn-secondary shrink-0" onClick={look} disabled={!link.trim() || looking}>
          {looking ? <Spinner /> : <Link2 className="size-4" />} Get file
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-red-700"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}</p>
      )}
      <p className="hint">
        {kind === "media" ? "Audio or video" : "A Google Doc, Word .docx or .txt"} shared as &ldquo;Anyone with the link&rdquo;. In Drive, use Share, then Copy link.
      </p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card-header">
        <span className="flex size-6 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{n}</span>
        <h2 className="card-title">{title}</h2>
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

type Props = { users: { id: string; name: string }[]; projects: string[]; languages: string[] };

export default function UploadForm(props: Props) {
  // Each job sent off starts a fresh, empty form, while the earlier one keeps uploading in the background.
  const [formKey, setFormKey] = useState(0);
  return <JobForm key={formKey} {...props} onQueued={() => setFormKey((k) => k + 1)} />;
}

function JobForm({ users, projects, languages, onQueued }: Props & { onQueued: () => void }) {
  const { start, uploading } = useUploads();
  const sent = useRef(false);
  const pick = useRef(0);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  // The job that already has this recording, or an upload of it still in the uploads panel.
  const [duplicate, setDuplicate] = useState<{ title: string; id?: string } | null>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<File | null>(null);
  const [driveMedia, setDriveMedia] = useState<DriveInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [readingLength, setReadingLength] = useState(false);
  const [manual, setManual] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"file" | "drive" | "paste">("file");
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [driveTranscript, setDriveTranscript] = useState<DriveInfo | null>(null);
  const [pasted, setPasted] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [language, setLanguage] = useState("");
  const [project, setProject] = useState("");
  const [deadline, setDeadline] = useState("");
  const [ratePerHour, setRatePerHour] = useState("");
  const [fixedPay, setFixedPay] = useState("");
  const [error, setError] = useState<string | null>(null);

  const effectiveDuration = manual ? Number(minutes || 0) * 60 + Number(seconds || 0) : (duration ?? 0);
  const hasTranscript = mode === "file" ? !!transcriptFile : mode === "drive" ? !!driveTranscript : !!pasted.trim();
  const picked = media ? { name: media.name, size: media.size as number | null, type: mediaTypeOf(media.name, media.type) } : driveMedia;
  const ready = !!picked && !!fingerprint && !duplicate && effectiveDuration > 0 && !!title.trim() && !!language && hasTranscript;
  async function pickMedia(file: File | undefined) {
    setError(null);
    if (!file) return;
    const type = mediaTypeOf(file.name, file.type);
    if (!type) {
      setError("That file isn't audio or video. Try an MP3, AAC, WAV, M4A or MP4.");
      return;
    }
    setMedia(file);
    setDriveMedia(null);
    await Promise.all([checkDuplicate(() => fingerprintOf(file)), measure(file.name, file, type)]);
  }

  async function pickDriveMedia(file: DriveInfo) {
    setError(null);
    setMedia(null);
    setDriveMedia(file);
    await Promise.all([checkDuplicate(async () => `drive:${file.id}`), measure(file.name, `/api/drive/${file.id}`, file.type)]);
  }

  /** Looks for the recording in the uploads panel and among existing jobs, so the same one isn't stored twice. */
  async function checkDuplicate(identify: () => Promise<string>) {
    const mine = ++pick.current;
    setFingerprint(null);
    setDuplicate(null);
    try {
      const id = await identify();
      const inPanel = uploading(id);
      const job = inPanel ? null : ((await (await fetch(`/api/uploads?fingerprint=${encodeURIComponent(id)}`)).json()).job as { id: string; title: string } | null);
      if (mine !== pick.current) return;
      setDuplicate(inPanel ? { title: inPanel } : job);
      setFingerprint(id);
    } catch {
      if (mine === pick.current) setError("Couldn't check whether this recording is already uploaded. Pick it again to retry.");
    }
  }

  async function measure(name: string, source: File | string, type: string) {
    setDuration(null);
    setManual(false);
    if (!title) setTitle(name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    setReadingLength(true);
    try {
      setDuration(Math.round(await readDuration(source, type)));
    } catch {
      setManual(true);
    } finally {
      setReadingLength(false);
    }
  }

  function clearMedia() {
    pick.current++;
    setFingerprint(null);
    setDuplicate(null);
    setMedia(null);
    setDriveMedia(null);
    setDuration(null);
    setManual(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A quick second tap mustn't send the same job twice.
    if (!ready || sent.current) return;
    sent.current = true;
    setError(null);
    const data = new FormData();
    data.set("title", title.trim());
    data.set("fingerprint", fingerprint!);
    if (media) data.set("media", media);
    else if (driveMedia) data.set("driveMediaId", driveMedia.id);
    data.set("durationSeconds", String(Math.round(effectiveDuration)));
    data.set("assigneeId", assigneeId);
    data.set("description", String(new FormData(e.currentTarget as HTMLFormElement).get("description") ?? ""));
    data.set("language", language);
    data.set("project", project.trim());
    data.set("deadline", deadline);
    data.set("ratePerHour", ratePerHour);
    data.set("fixedPay", fixedPay);
    if (mode === "file" && transcriptFile) data.set("transcriptFile", transcriptFile);
    else if (mode === "drive" && driveTranscript) data.set("driveTranscriptId", driveTranscript.id);
    else data.set("transcriptText", pasted);
    start({ title: title.trim(), data, fromDrive: !!driveMedia, assigneeId, fingerprint: fingerprint! });
    toast(`Uploading “${title.trim()}”`, { description: "Its progress shows at the bottom of the screen. You can add the next job now." });
    onQueued();
    window.scrollTo({ top: 0 });
  }

  const MediaIcon = picked?.type?.startsWith("video") ? FileVideo : FileAudio;
  const assigneeName = users.find((u) => u.id === assigneeId)?.name;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <Step n={1} title="Media file">
          {!picked ? (
            <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickMedia(e.dataTransfer.files[0]);
              }}
              onClick={() => mediaInput.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && mediaInput.current?.click()}
              role="button"
              tabIndex={0}
              className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
                dragging ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-300 hover:bg-slate-50"
              }`}
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <CloudUpload className="size-6" />
              </span>
              <p className="mt-3 text-sm font-medium text-slate-900">
                Drop an audio or video file here, or <span className="text-brand-600">browse</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">MP3, AAC, WAV, M4A, MP4, MOV and more. We read the length automatically.</p>
            </div>
            <div className="mt-4"><DriveLink kind="media" onPick={pickDriveMedia} /></div>
            </>
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <MediaIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{picked.name}</div>
                <div className="num text-xs text-slate-500">
                  {driveMedia && "Google Drive"}
                  {driveMedia && picked.size !== null && " · "}
                  {picked.size !== null && formatBytes(picked.size)}
                  {readingLength && " · reading length…"}
                  {duration !== null && !manual && ` · ${formatDuration(duration)}`}
                </div>
              </div>
              <button type="button" className="btn-ghost size-8 px-0" onClick={clearMedia} aria-label="Remove file">
                <X className="size-4" />
              </button>
            </div>
          )}
          <input ref={mediaInput} type="file" accept={MEDIA_ACCEPT} className="hidden" onChange={(e) => { pickMedia(e.target.files?.[0]); e.target.value = ""; }} />
          {duplicate && (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>
                {duplicate.id ? (
                  <>This recording is already uploaded as <Link href={`/admin/jobs/${duplicate.id}`} className="font-medium underline">{duplicate.title}</Link>.</>
                ) : (
                  <>This recording is already uploading as &ldquo;{duplicate.title}&rdquo;.</>
                )}{" "}
                Pick a different file, so the same recording isn&apos;t stored twice.
              </span>
            </p>
          )}

          {picked && (manual ? (
            <div className="mt-4">
              {duration === null && (
                <p className="mb-3 flex items-center gap-2 text-sm text-amber-700">
                  <TriangleAlert className="size-4" /> We couldn&apos;t read this file&apos;s length. Enter it so pay is correct.
                </p>
              )}
              <div className="flex items-end gap-2">
                <div>
                  <label className="label" htmlFor="minutes">Minutes</label>
                  <input className="input num w-24" id="minutes" type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="seconds">Seconds</label>
                  <input className="input num w-24" id="seconds" type="number" min="0" max="59" value={seconds} onChange={(e) => setSeconds(e.target.value)} />
                </div>
              </div>
            </div>
          ) : duration !== null && (
            <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
              onClick={() => { setManual(true); setMinutes(String(Math.floor(duration / 60))); setSeconds(String(duration % 60)); }}>
              <Pencil className="size-3" /> Length looks wrong? Edit it
            </button>
          ))}

          <div className="mt-5">
            <label className="label" htmlFor="title">Job title</label>
            <input className="input" id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Interview with district officer" />
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="description">Details for transcribers <span className="font-normal text-slate-400">(optional)</span></label>
            <RichTextEditor name="description" id="description" placeholder="e.g. Two speakers, some Luganda. Label speakers and keep timestamps." />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="project">Project <span className="font-normal text-slate-400">(optional)</span></label>
              <ProjectField id="project" projects={projects} value={project} onChange={setProject} />
              <p className="hint">Tells jobs apart, e.g. the client or study. Pick an earlier one or type a new one.</p>
            </div>
            <div>
              <label className="label" htmlFor="language">Language</label>
              <LanguageField id="language" languages={languages} required onChange={setLanguage} />
            </div>
            <div>
              <label className="label" htmlFor="deadline">Deadline <span className="font-normal text-slate-400">(optional)</span></label>
              <input className="input" id="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ratePerHour">Special rate in UGX per hour <span className="font-normal text-slate-400">(optional)</span></label>
              <input className="input" id="ratePerHour" inputMode="numeric" value={ratePerHour} disabled={!!fixedPay} onChange={(e) => setRatePerHour(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Leave empty for the usual rate" />
            </div>
            <div>
              <label className="label" htmlFor="fixedPay">Or a fixed price in UGX <span className="font-normal text-slate-400">(optional)</span></label>
              <input className="input" id="fixedPay" inputMode="numeric" value={fixedPay} disabled={!!ratePerHour} onChange={(e) => setFixedPay(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Paid as is, whatever the length" />
            </div>
            <p className="hint sm:col-span-2">Leave both empty to pay the usual rate. A fixed price stays the same whatever the length or the usual rate.</p>
          </div>
        </Step>

        <Step n={2} title="Transcript">
          <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1" role="tablist">
            {(["file", "drive", "paste"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                {m === "file" ? "Upload file" : m === "drive" ? "Google Drive" : "Paste text"}
              </button>
            ))}
          </div>
          {mode === "file" ? (
            transcriptFile ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <FileText className="size-5 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm">{transcriptFile.name}</span>
                <button type="button" className="btn-ghost size-8 px-0" onClick={() => setTranscriptFile(null)} aria-label="Remove transcript file"><X className="size-4" /></button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-4 py-5 text-sm text-slate-600 transition hover:border-brand-300 hover:bg-slate-50">
                <FileText className="size-5 text-slate-400" />
                <span>Choose a Word <strong>.docx</strong>, <strong>.txt</strong>, <strong>.srt</strong> or <strong>.vtt</strong> file</span>
                <input type="file" accept=".txt,.docx,.srt,.vtt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => setTranscriptFile(e.target.files?.[0] ?? null)} />
              </label>
            )
          ) : mode === "drive" ? (
            driveTranscript ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <FileText className="size-5 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm">{driveTranscript.name}</span>
                <span className="shrink-0 text-xs text-slate-500">Google Drive</span>
                <button type="button" className="btn-ghost size-8 px-0" onClick={() => setDriveTranscript(null)} aria-label="Remove transcript file"><X className="size-4" /></button>
              </div>
            ) : (
              <DriveLink kind="transcript" onPick={setDriveTranscript} />
            )
          ) : (
            <textarea className="input h-48 font-mono" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the transcript here…" aria-label="Transcript text" />
          )}
        </Step>

        <Step n={3} title="Assign">
          <label className="label" htmlFor="assigneeId">Who should correct it?</label>
          <select className="input" id="assigneeId" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Post on the job board for transcribers to request</option>
            <option value="__hold">Keep it to myself for now</option>
            <optgroup label="Assign directly">
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </optgroup>
          </select>
          <p className="hint">
            {assigneeId === "" ? "Transcribers see it under Find work and can ask for it. You pick who gets it." : assigneeId === "__hold" ? "It stays unassigned and hidden until you assign or post it." : "It goes straight into their to-do list."}
          </p>
        </Step>
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="card">
          <div className="card-header"><h2 className="card-title">Summary</h2></div>
          <dl className="card-body space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Length</dt><dd className="num font-medium">{effectiveDuration > 0 ? formatDuration(effectiveDuration) : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Expected pay</dt><dd className="num">{fixedPay ? formatUGX(Number(fixedPay)) : effectiveDuration > 0 ? `~${formatUGX(expectedPayFor(effectiveDuration, ratePerHour ? Number(ratePerHour) : null))}` : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Assigned to</dt><dd className="truncate">{assigneeName ?? (assigneeId === "" ? "Job board" : "Nobody yet")}</dd></div>
          </dl>
          <div className="border-t border-slate-100 p-5">
            {error && (
              <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
            <button className="btn w-full" disabled={!ready}>
              <CloudUpload className="size-4" />
              {assigneeName ? "Upload and assign" : assigneeId === "" ? "Upload and post" : "Upload job"}
            </button>
            {!ready && <p className="hint text-center">{duplicate ? "This recording is already uploaded. Pick a different one." : "Add a media file, title, language and transcript to continue."}</p>}
          </div>
        </div>
      </aside>
    </form>
  );
}
