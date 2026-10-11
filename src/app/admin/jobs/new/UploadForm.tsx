"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDuration, formatUGX } from "@/lib/format";
import { earningsFor } from "@/lib/pay";

/** Reads the length of an audio/video file in the browser. */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith("video") ? "video" : "audio");
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

export default function UploadForm({ users }: { users: { id: string; name: string }[] }) {
  const router = useRouter();
  const [duration, setDuration] = useState<number | null>(null);
  const [manual, setManual] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const effectiveDuration = manual ? Number(minutes || 0) * 60 + Number(seconds || 0) : duration ?? 0;

  async function onMediaChange(file: File | undefined) {
    setDuration(null);
    setManual(false);
    if (!file) return;
    try {
      setDuration(Math.round(await readDuration(file)));
    } catch {
      setManual(true);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    data.set("durationSeconds", String(Math.round(effectiveDuration)));
    setBusy(true);
    // XHR rather than fetch so we can show upload progress for large files.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jobs");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      setBusy(false);
      setProgress(null);
      const body = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) router.push(`/admin/jobs/${body.id}`);
      else setError(body.error ?? "Upload failed.");
    };
    xhr.onerror = () => {
      setBusy(false);
      setProgress(null);
      setError("Upload failed. Check your connection and try again.");
    };
    xhr.send(data);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input className="input" id="title" name="title" required placeholder="e.g. Interview with district officer" />
      </div>

      <div>
        <label className="label" htmlFor="media">Audio or video file</label>
        <input className="input" id="media" name="media" type="file" accept="audio/*,video/*" required
          onChange={(e) => onMediaChange(e.target.files?.[0])} />
        {duration !== null && !manual && (
          <p className="mt-1 text-sm text-slate-600">
            Length {formatDuration(duration)}, pays {formatUGX(earningsFor(duration))}.{" "}
            <button type="button" className="text-indigo-600 hover:underline" onClick={() => {
              setManual(true);
              setMinutes(String(Math.floor(duration / 60)));
              setSeconds(String(duration % 60));
            }}>Change</button>
          </p>
        )}
        {manual && (
          <div className="mt-2 flex items-end gap-2">
            <div>
              <label className="label" htmlFor="minutes">Minutes</label>
              <input className="input w-24" id="minutes" type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="seconds">Seconds</label>
              <input className="input w-24" id="seconds" type="number" min="0" max="59" value={seconds} onChange={(e) => setSeconds(e.target.value)} />
            </div>
            <p className="pb-2 text-sm text-slate-600">Pays {formatUGX(earningsFor(effectiveDuration))}</p>
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="transcriptFile">Transcript file (.txt, .srt, .vtt)</label>
        <input className="input" id="transcriptFile" name="transcriptFile" type="file" accept=".txt,.srt,.vtt,text/plain" />
        <p className="mt-1 text-xs text-slate-500">Or paste it below. A file takes priority over pasted text.</p>
        <textarea className="input mt-2 h-40 font-mono" name="transcriptText" placeholder="Paste transcript here…" />
      </div>

      <div>
        <label className="label" htmlFor="assigneeId">Assign to</label>
        <select className="input" id="assigneeId" name="assigneeId" defaultValue="">
          <option value="">Leave unassigned for now</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn" disabled={busy || effectiveDuration <= 0}>
        {busy ? (progress !== null ? `Uploading ${progress}%…` : "Uploading…") : "Upload"}
      </button>
    </form>
  );
}
