"use client";

import { CheckCircle2, ChevronDown, CloudUpload, Pause, Play, RotateCw, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Media files go up in pieces of this size, so an upload can be paused between pieces and carried on later.
// It must match CHUNK in lib/media; Cloudinary needs pieces of at least 5 MB.
const CHUNK = 6_000_000;

type Status = "uploading" | "paused" | "saving" | "done" | "failed";

type Upload = {
  key: number;
  title: string;
  /** A Drive recording is copied on the server, so it can be cancelled but not paused. */
  fromDrive: boolean;
  assigneeId: string;
  /** Identifies the recording, so the form can refuse to upload it a second time. */
  fingerprint: string;
  status: Status;
  loaded: number;
  total: number | null;
  jobId?: string;
  error?: string;
};

/** What a running upload needs that the panel doesn't show: the form, the file, how far it got, and the request in flight. */
type Run = { data: FormData; file: File | null; uploadId: string; offset: number; token?: string; xhr?: XMLHttpRequest; halted?: "pause" | "cancel" };

type NewUpload = { title: string; data: FormData; fromDrive: boolean; assigneeId: string; fingerprint: string };

const UploadsContext = createContext<{ start: (upload: NewUpload) => void; uploading: (fingerprint: string) => string | null } | null>(null);

export function useUploads() {
  const uploads = useContext(UploadsContext);
  if (!uploads) throw new Error("useUploads needs an UploadsProvider");
  return uploads;
}

class Halted extends Error {}

/**
 * Runs job uploads in the background, so an admin can fill in the next job, or move around the admin pages,
 * while earlier ones are still uploading. Each upload shows its own progress in a panel at the bottom of the screen,
 * and can be paused, resumed or cancelled there.
 */
export function UploadsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [open, setOpen] = useState(true);
  const nextKey = useRef(1);
  const runs = useRef(new Map<number, Run>());
  const active = uploads.filter((u) => u.status !== "done" && u.status !== "failed").length;

  const update = useCallback((key: number, change: Partial<Upload>) => {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...change } : u)));
  }, []);

  /** Sends one request for an upload, so pausing or cancelling can stop it midway. */
  const request = useCallback(
    (run: Run, url: string, body: Blob | FormData, headers: Record<string, string>, on: { sent?: (n: number) => void; text?: (t: string) => void } = {}) =>
      new Promise<{ ok: boolean; text: string }>((resolve, reject) => {
        // XHR rather than fetch so we can show upload progress for large files.
        const xhr = new XMLHttpRequest();
        run.xhr = xhr;
        xhr.open("POST", url);
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
        if (on.sent) xhr.upload.onprogress = (ev) => on.sent!(ev.loaded);
        if (on.text) xhr.onprogress = () => xhr.status >= 200 && xhr.status < 300 && on.text!(xhr.responseText);
        xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, text: xhr.responseText });
        xhr.onabort = () => reject(new Halted());
        xhr.onerror = () => reject(run.halted ? new Halted() : new Error("Upload failed. Check your connection and try again."));
        xhr.send(body);
      }),
    [],
  );

  const go = useCallback(
    async (key: number, info: { title: string; assigneeId: string }) => {
      const run = runs.current.get(key);
      if (!run) return;
      try {
        // A file from this device goes up in pieces, picking up from the last piece that was stored.
        const file = run.file;
        while (file && !run.token) {
          const start = run.offset;
          const end = Math.min(start + CHUNK, file.size);
          const res = await request(run, "/api/uploads", file.slice(start, end), { "x-upload-id": run.uploadId, "content-range": `bytes ${start}-${end - 1}/${file.size}` }, {
            sent: (n) => update(key, { loaded: start + Math.min(n, end - start) }),
          });
          const body = parse(res.text);
          if (!res.ok) throw new Error(body.error ?? "Upload failed. Please try again.");
          run.offset = end;
          if (body.token) run.token = body.token;
          else if (end >= file.size) throw new Error("Upload failed. Please try again.");
        }

        // Then the job itself. A Drive recording is copied now, and the server streams one JSON line per update.
        const data = new FormData();
        run.data.forEach((v, k) => data.append(k, v));
        // Lets the server spot a retry of a job it already made, e.g. when its reply was lost.
        data.set("uploadKey", run.uploadId);
        if (file) {
          data.set("mediaToken", run.token!);
          data.set("mediaName", file.name);
          data.set("mediaMime", file.type);
          update(key, { status: "saving", loaded: file.size });
        }
        let result: { id?: string; error?: string } = {};
        const lines = (text: string) => {
          for (const line of text.split("\n")) {
            const msg = parse(line);
            if ("copied" in msg) update(key, { loaded: msg.copied, total: msg.total, status: msg.saved ? "saving" : "uploading" });
            else if (msg.id || msg.error) result = msg;
          }
        };
        const res = await request(run, "/api/jobs", data, {}, { text: lines });
        if (!res.ok) throw new Error(parse(res.text).error ?? "Upload failed. Please try again.");
        lines(res.text);
        if (!result.id) throw new Error(result.error ?? "Upload failed. Please try again.");

        runs.current.delete(key);
        update(key, { status: "done", jobId: result.id });
        toast.success(`“${info.title}” uploaded`, {
          description: info.assigneeId === "" ? "It's on the job board for transcribers to request." : info.assigneeId === "__hold" ? "Assign or post it when you're ready." : "It's now in their to-do list.",
        });
        router.refresh();
      } catch (err) {
        if (err instanceof Halted || run.halted) return;
        update(key, { status: "failed", error: err instanceof Error ? err.message : "Upload failed. Please try again." });
      }
    },
    [request, router, update],
  );

  const start = useCallback(
    ({ title, data, fromDrive, assigneeId, fingerprint }: NewUpload) => {
      const media = data.get("media");
      const file = media instanceof File ? media : null;
      data.delete("media");
      const key = nextKey.current++;
      runs.current.set(key, { data, file, uploadId: crypto.randomUUID().replace(/-/g, ""), offset: 0 });
      setUploads((list) => [...list, { key, title, fromDrive, assigneeId, fingerprint, status: "uploading", loaded: 0, total: file?.size ?? null }]);
      setOpen(true);
      go(key, { title, assigneeId });
    },
    [go],
  );

  function pause(u: Upload) {
    const run = runs.current.get(u.key);
    if (!run) return;
    run.halted = "pause";
    run.xhr?.abort();
    // The piece that was on its way is sent again on resume.
    update(u.key, { status: "paused", loaded: run.offset });
  }

  function resume(u: Upload) {
    const run = runs.current.get(u.key);
    if (!run) return;
    run.halted = undefined;
    update(u.key, { status: "uploading", error: undefined, loaded: run.offset });
    go(u.key, u);
  }

  function cancel(u: Upload) {
    const run = runs.current.get(u.key);
    if (run) {
      run.halted = "cancel";
      run.xhr?.abort();
      // A file that was fully stored but never became a job is thrown away. Pieces of an unfinished one expire on their own.
      if (run.token) void fetch(`/api/uploads?token=${encodeURIComponent(run.token)}`, { method: "DELETE" }).catch(() => {});
      runs.current.delete(u.key);
    }
    setUploads((list) => list.filter((x) => x.key !== u.key));
    toast(`Cancelled “${u.title}”`, { description: "Nothing was saved." });
  }

  // Finished uploads are jobs now, which the server checks; this covers the ones still on their way.
  const uploading = useCallback((fingerprint: string) => uploads.find((u) => u.fingerprint === fingerprint && u.status !== "done")?.title ?? null, [uploads]);

  const dismiss = (key: number) => setUploads((list) => list.filter((u) => u.key !== key));

  // Leaving the site mid-upload throws the upload away, so ask first. Moving between admin pages is fine.
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const failed = uploads.filter((u) => u.status === "failed").length;
  const running = uploads.filter((u) => u.status === "uploading" || u.status === "saving").length;
  const paused = uploads.filter((u) => u.status === "paused").length;
  const heading = running
    ? `Uploading ${running} ${running === 1 ? "job" : "jobs"}${paused ? `, ${paused} paused` : ""}`
    : paused
      ? `${paused} ${paused === 1 ? "upload" : "uploads"} paused`
      : failed
        ? `${failed} ${failed === 1 ? "upload" : "uploads"} failed`
        : "Uploads finished";

  return (
    <UploadsContext.Provider value={{ start, uploading }}>
      {children}
      {/* Room at the bottom so the panel never hides the end of a page. */}
      {uploads.length > 0 && <div aria-hidden className="h-48" />}
      {uploads.length > 0 && (
        <section className="fixed inset-x-4 bottom-4 z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:left-auto sm:w-96" aria-label="Uploads">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-slate-900" onClick={() => setOpen(!open)} aria-expanded={open}>
              {running ? <CloudUpload className="size-4 shrink-0 text-brand-600" /> : paused ? <Pause className="size-4 shrink-0 text-amber-600" /> : failed ? <TriangleAlert className="size-4 shrink-0 text-red-600" /> : <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
              <span className="truncate">{heading}</span>
              <ChevronDown className={`ml-auto size-4 shrink-0 text-slate-400 transition ${open ? "" : "rotate-180"}`} />
            </button>
            {!active && !failed && (
              <button type="button" className="btn-ghost size-7 px-0" onClick={() => setUploads([])} aria-label="Close uploads">
                <X className="size-4" />
              </button>
            )}
          </div>
          {open && (
            <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto">
              {uploads.map((u) => (
                <UploadRow key={u.key} upload={u} onPause={() => pause(u)} onResume={() => resume(u)} onCancel={() => cancel(u)} onDismiss={() => dismiss(u.key)} />
              ))}
            </ul>
          )}
          {open && active > 0 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">You can keep working. Don&apos;t close or reload this tab.</p>}
        </section>
      )}
    </UploadsContext.Provider>
  );
}

function parse(text: string): { error?: string; token?: string; id?: string; copied?: number; total?: number | null; saved?: boolean } {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function UploadRow({ upload: u, onPause, onResume, onCancel, onDismiss }: { upload: Upload; onPause: () => void; onResume: () => void; onCancel: () => void; onDismiss: () => void }) {
  // Cancelling throws the upload away, so it takes a second tap.
  const [confirming, setConfirming] = useState(false);
  const link = "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs font-medium";
  const canPause = !u.fromDrive && u.status === "uploading";
  const canCancel = u.status !== "done" && u.status !== "saving";

  return (
    <li className="px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1">
        <span className="mr-auto min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{u.title}</span>
        {confirming ? (
          <>
            <span className="shrink-0 text-xs text-slate-600">Cancel upload?</span>
            <button type="button" className={`${link} text-red-700 hover:bg-red-50`} onClick={onCancel}>Yes, cancel</button>
            <button type="button" className={`${link} text-slate-600 hover:bg-slate-100`} onClick={() => setConfirming(false)}>No</button>
          </>
        ) : (
          <>
            {u.status === "done" && <Link href={`/admin/jobs/${u.jobId}`} className={`${link} text-brand-600 hover:bg-brand-50`}>Open</Link>}
            {canPause && (
              <button type="button" className={`${link} text-slate-700 hover:bg-slate-100`} onClick={onPause}>
                <Pause className="size-3" /> Pause
              </button>
            )}
            {u.status === "paused" && (
              <button type="button" className={`${link} text-brand-600 hover:bg-brand-50`} onClick={onResume}>
                <Play className="size-3" /> Resume
              </button>
            )}
            {u.status === "failed" && (
              <button type="button" className={`${link} text-brand-600 hover:bg-brand-50`} onClick={onResume}>
                <RotateCw className="size-3" /> Retry
              </button>
            )}
            {canCancel && (
              <button type="button" className={`${link} text-slate-500 hover:bg-slate-100 hover:text-red-700`} onClick={() => setConfirming(true)}>
                Cancel
              </button>
            )}
            {u.status === "done" && (
              <button type="button" className="btn-ghost -mr-1.5 size-6 px-0" onClick={onDismiss} aria-label={`Dismiss ${u.title}`}>
                <X className="size-3.5" />
              </button>
            )}
          </>
        )}
      </div>
      {u.status === "done" ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" /> Uploaded</p>
      ) : (
        <>
          {u.status === "failed" && (
            <p role="alert" className="mb-1.5 flex items-start gap-1.5 text-xs text-red-700"><TriangleAlert className="mt-px size-3.5 shrink-0" /> {u.error}</p>
          )}
          <UploadProgress upload={u} />
        </>
      )}
    </li>
  );
}

function UploadProgress({ upload: { status, loaded, total, fromDrive } }: { upload: Upload }) {
  // Hold at 99% until the job is saved.
  const pct = total ? (status === "saving" ? 99 : Math.min(99, Math.floor((loaded / total) * 100))) : null;
  const label =
    status === "paused" ? "Paused" : status === "failed" ? "Stopped" : status === "saving" ? "Finishing up…" : fromDrive ? (loaded ? "Copying from Google Drive" : "Starting…") : "Uploading";
  const color = status === "paused" ? "bg-amber-500" : status === "failed" ? "bg-slate-400" : "bg-brand-600";
  return (
    <div role="status" aria-live="polite">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-medium text-slate-700">{label}</span>
        {pct !== null && <span className="num shrink-0 text-sm font-semibold text-slate-900">{pct}%</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label={label}>
        {pct !== null ? (
          <div className={`h-full rounded-full ${color} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-400" />
        )}
      </div>
      {(total || loaded > 0) && (
        <p className="num mt-1 text-xs text-slate-500">{total ? `${formatBytes(Math.min(loaded, total))} of ${formatBytes(total)}` : `${formatBytes(loaded)} so far`}</p>
      )}
    </div>
  );
}
