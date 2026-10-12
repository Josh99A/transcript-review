"use client";

import RichTextEditor from "@/components/RichTextEditor";
import { CloudUpload, FileAudio, FileText, FileVideo, Pencil, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/client";
import { formatDuration, formatUGX } from "@/lib/format";
import { adtsDuration, MEDIA_ACCEPT, mediaTypeOf, mp4Duration } from "@/lib/mediaTypes";
import { expectedPayFor } from "@/lib/pay";

/** Reads the length of an audio/video file in the browser. */
async function readDuration(file: File, type: string): Promise<number> {
  // Raw AAC files often report no length (or a rough guess), so count their frames instead.
  if (type === "audio/aac") {
    const d = adtsDuration(new Uint8Array(await file.arrayBuffer()));
    if (d) return d;
  }
  try {
    return await playerDuration(file, type);
  } catch (e) {
    // Browsers without the codec can still give us the length from an MP4/M4A header.
    if (/mp4|quicktime/.test(type)) {
      const d = mp4Duration(new Uint8Array(await file.arrayBuffer()));
      if (d) return d;
    }
    throw e;
  }
}

function playerDuration(file: File, type: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(type.startsWith("video") ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (Number.isFinite(el.duration)) resolve(el.duration);
      else reject(new Error("unknown length"));
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    el.src = url;
  });
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
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

export default function UploadForm({ users }: { users: { id: string; name: string }[] }) {
  const router = useRouter();
  const mediaInput = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [readingLength, setReadingLength] = useState(false);
  const [manual, setManual] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [language, setLanguage] = useState("");
  const [deadline, setDeadline] = useState("");
  const [fixedPay, setFixedPay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const effectiveDuration = manual ? Number(minutes || 0) * 60 + Number(seconds || 0) : (duration ?? 0);
  const hasTranscript = mode === "file" ? !!transcriptFile : !!pasted.trim();
  const ready = !!media && effectiveDuration > 0 && !!title.trim() && hasTranscript;
  const busy = progress !== null;

  async function pickMedia(file: File | undefined) {
    setError(null);
    if (!file) return;
    const type = mediaTypeOf(file.name, file.type);
    if (!type) {
      setError("That file isn't audio or video. Try an MP3, AAC, WAV, M4A or MP4.");
      return;
    }
    setMedia(file);
    setDuration(null);
    setManual(false);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    setReadingLength(true);
    try {
      setDuration(Math.round(await readDuration(file, type)));
    } catch {
      setManual(true);
    } finally {
      setReadingLength(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!media || !ready) return;
    setError(null);
    const data = new FormData();
    data.set("title", title.trim());
    data.set("media", media);
    data.set("durationSeconds", String(Math.round(effectiveDuration)));
    data.set("assigneeId", assigneeId);
    data.set("description", String(new FormData(e.currentTarget as HTMLFormElement).get("description") ?? ""));
    data.set("language", language);
    data.set("deadline", deadline);
    data.set("fixedPay", fixedPay);
    if (mode === "file" && transcriptFile) data.set("transcriptFile", transcriptFile);
    else data.set("transcriptText", pasted);
    setProgress(0);
    // XHR rather than fetch so we can show upload progress for large files.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jobs");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      let body: { id?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        toast.success("Job uploaded", { description: assigneeId === "" ? "It's on the job board for transcribers to request." : assigneeId === "__hold" ? "Assign or post it when you're ready." : "It's now in their to-do list." });
        router.push(`/admin/jobs/${body.id}`);
      } else setError(body.error ?? "Upload failed. Please try again.");
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed. Check your connection and try again.");
    };
    xhr.send(data);
  }

  const MediaIcon = media && mediaTypeOf(media.name, media.type)?.startsWith("video") ? FileVideo : FileAudio;
  const assigneeName = users.find((u) => u.id === assigneeId)?.name;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <Step n={1} title="Media file">
          {!media ? (
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
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <MediaIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{media.name}</div>
                <div className="num text-xs text-slate-500">
                  {formatBytes(media.size)}
                  {readingLength && " · reading length…"}
                  {duration !== null && !manual && ` · ${formatDuration(duration)}`}
                </div>
              </div>
              <button type="button" className="btn-ghost size-8 px-0" onClick={() => { setMedia(null); setDuration(null); setManual(false); }} aria-label="Remove file" disabled={busy}>
                <X className="size-4" />
              </button>
            </div>
          )}
          <input ref={mediaInput} type="file" accept={MEDIA_ACCEPT} className="hidden" onChange={(e) => pickMedia(e.target.files?.[0])} />

          {media && (manual ? (
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
              <label className="label" htmlFor="language">Language <span className="font-normal text-slate-400">(optional)</span></label>
              <input className="input" id="language" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="e.g. English, Luganda" />
            </div>
            <div>
              <label className="label" htmlFor="deadline">Deadline <span className="font-normal text-slate-400">(optional)</span></label>
              <input className="input" id="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="fixedPay">Fixed price in UGX <span className="font-normal text-slate-400">(optional)</span></label>
            <input className="input sm:max-w-60" id="fixedPay" inputMode="numeric" value={fixedPay} onChange={(e) => setFixedPay(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Leave empty to pay by length" />
            <p className="hint">Use this for jobs with their own price. It&apos;s paid as is, instead of by the hour.</p>
          </div>
        </Step>

        <Step n={2} title="Transcript">
          <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1" role="tablist">
            {(["file", "paste"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                {m === "file" ? "Upload file" : "Paste text"}
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
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Expected pay</dt><dd className="num">{fixedPay ? `${formatUGX(Number(fixedPay))} fixed` : effectiveDuration > 0 ? `~${formatUGX(expectedPayFor(effectiveDuration))}` : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Assigned to</dt><dd className="truncate">{assigneeName ?? (assigneeId === "" ? "Job board" : "Nobody yet")}</dd></div>
          </dl>
          <div className="border-t border-slate-100 p-5">
            {error && (
              <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
            {busy && (
              <div className="mb-3">
                <div className="num mb-1 flex justify-between text-xs text-slate-500"><span>Uploading</span><span>{progress}%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} /></div>
              </div>
            )}
            <button className="btn w-full" disabled={!ready || busy}>
              {busy ? <Spinner /> : <CloudUpload className="size-4" />}
              {busy ? "Uploading…" : assigneeName ? "Upload and assign" : assigneeId === "" ? "Upload and post" : "Upload job"}
            </button>
            {!ready && !busy && <p className="hint text-center">Add a media file, title and transcript to continue.</p>}
          </div>
        </div>
      </aside>
    </form>
  );
}
