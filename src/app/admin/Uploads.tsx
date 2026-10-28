"use client";

import { CheckCircle2, ChevronDown, CloudUpload, RotateCw, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Where an upload has got to: the browser sending the form, then the server copying the recording into storage. */
type Progress = { stage: "send" | "store"; loaded: number; total: number | null; saved?: boolean };

type Upload = {
  key: number;
  title: string;
  data: FormData;
  /** A Drive recording is copied on the server, so there's no browser upload step to show. */
  fromDrive: boolean;
  assigneeId: string;
  progress: Progress;
  jobId?: string;
  error?: string;
};

const UploadsContext = createContext<{ start: (upload: Pick<Upload, "title" | "data" | "fromDrive" | "assigneeId">) => void } | null>(null);

export function useUploads() {
  const uploads = useContext(UploadsContext);
  if (!uploads) throw new Error("useUploads needs an UploadsProvider");
  return uploads;
}

/**
 * Runs job uploads in the background, so an admin can fill in the next job, or move around the admin pages,
 * while earlier ones are still uploading. Each upload shows its own progress in a panel at the bottom of the screen.
 */
export function UploadsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [open, setOpen] = useState(true);
  const nextKey = useRef(1);
  const active = uploads.filter((u) => !u.jobId && !u.error).length;

  const update = useCallback((key: number, change: Partial<Upload>) => {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...change } : u)));
  }, []);

  const send = useCallback(
    (upload: Upload) => {
      const { key, data } = upload;
      const finish = (body: { id?: string; error?: string }) => {
        if (body.id) {
          update(key, { jobId: body.id });
          toast.success(`“${upload.title}” uploaded`, {
            description: upload.assigneeId === "" ? "It's on the job board for transcribers to request." : upload.assigneeId === "__hold" ? "Assign or post it when you're ready." : "It's now in their to-do list.",
          });
          router.refresh();
        } else update(key, { error: body.error ?? "Upload failed. Please try again." });
      };
      // XHR rather than fetch so we can show upload progress for large files.
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/jobs");
      xhr.upload.onprogress = (ev) => ev.lengthComputable && update(key, { progress: { stage: "send", loaded: ev.loaded, total: ev.total } });
      // Once the form is sent, the server streams one JSON line per update while it copies the recording to storage.
      let read = 0;
      let result: { id?: string; error?: string } = {};
      const readLines = () => {
        if (xhr.status < 200 || xhr.status >= 300) return;
        const text = xhr.responseText;
        const end = text.lastIndexOf("\n") + 1;
        for (const line of text.slice(read, end).split("\n")) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if ("copied" in msg) update(key, { progress: { stage: "store", loaded: msg.copied, total: msg.total, saved: msg.saved } });
            else result = msg;
          } catch {}
        }
        read = end;
      };
      xhr.onprogress = readLines;
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          readLines();
          return finish(result);
        }
        let body: { error?: string } = {};
        try {
          body = JSON.parse(xhr.responseText || "{}");
        } catch {}
        finish({ error: body.error });
      };
      xhr.onerror = () => update(key, { error: "Upload failed. Check your connection and try again." });
      xhr.send(data);
    },
    [router, update],
  );

  const start = useCallback(
    (upload: Pick<Upload, "title" | "data" | "fromDrive" | "assigneeId">) => {
      const added: Upload = { ...upload, key: nextKey.current++, progress: { stage: "send", loaded: 0, total: null } };
      setUploads((list) => [...list, added]);
      setOpen(true);
      send(added);
    },
    [send],
  );

  function retry(upload: Upload) {
    const again = { ...upload, error: undefined, progress: { stage: "send" as const, loaded: 0, total: null } };
    update(upload.key, again);
    send(again);
  }

  const dismiss = (key: number) => setUploads((list) => list.filter((u) => u.key !== key));

  // Leaving the site mid-upload throws the upload away, so ask first. Moving between admin pages is fine.
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const failed = uploads.filter((u) => u.error).length;
  const heading = active ? `Uploading ${active} ${active === 1 ? "job" : "jobs"}` : failed ? `${failed} ${failed === 1 ? "upload" : "uploads"} failed` : "Uploads finished";

  return (
    <UploadsContext.Provider value={{ start }}>
      {children}
      {/* Room at the bottom so the panel never hides the end of a page. */}
      {uploads.length > 0 && <div aria-hidden className="h-48" />}
      {uploads.length > 0 && (
        <section className="fixed inset-x-4 bottom-4 z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:left-auto sm:w-96" aria-label="Uploads">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-slate-900" onClick={() => setOpen(!open)} aria-expanded={open}>
              {active ? <CloudUpload className="size-4 shrink-0 text-brand-600" /> : failed ? <TriangleAlert className="size-4 shrink-0 text-red-600" /> : <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
              <span className="truncate">{heading}</span>
              <ChevronDown className={`ml-auto size-4 shrink-0 text-slate-400 transition ${open ? "" : "rotate-180"}`} />
            </button>
            {!active && (
              <button type="button" className="btn-ghost size-7 px-0" onClick={() => setUploads([])} aria-label="Close uploads">
                <X className="size-4" />
              </button>
            )}
          </div>
          {open && (
            <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto">
              {uploads.map((u) => (
                <li key={u.key} className="px-4 py-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{u.title}</span>
                    {u.jobId && <Link href={`/admin/jobs/${u.jobId}`} className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700">Open</Link>}
                    {u.error && (
                      <button type="button" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700" onClick={() => retry(u)}>
                        <RotateCw className="size-3" /> Retry
                      </button>
                    )}
                    {(u.jobId || u.error) && (
                      <button type="button" className="btn-ghost -mr-1.5 size-6 px-0" onClick={() => dismiss(u.key)} aria-label={`Dismiss ${u.title}`}>
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                  {u.jobId ? (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" /> Uploaded</p>
                  ) : u.error ? (
                    <p role="alert" className="flex items-start gap-1.5 text-xs text-red-700"><TriangleAlert className="mt-px size-3.5 shrink-0" /> {u.error}</p>
                  ) : (
                    <UploadProgress progress={u.progress} fromDrive={u.fromDrive} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {open && active > 0 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">You can keep working. Don&apos;t close or reload this tab.</p>}
        </section>
      )}
    </UploadsContext.Provider>
  );
}

function UploadProgress({ progress, fromDrive }: { progress: Progress; fromDrive: boolean }) {
  const { stage, loaded, total, saved } = progress;
  // Hold at 99% until the server says the file is safely stored, since the last piece is still on its way.
  const pct = total ? (saved ? 100 : Math.min(99, Math.floor((loaded / total) * 100))) : null;
  const label =
    stage === "send"
      ? pct === 99 || pct === 100 ? "Checking the files…" : fromDrive ? "Starting…" : "Uploading"
      : saved || (total && loaded >= total) ? "Finishing up…" : fromDrive ? "Copying from Google Drive" : "Saving to storage";
  // Drive media skips the browser step, so it's a single step.
  const step = fromDrive ? null : stage === "send" ? "Step 1 of 2" : "Step 2 of 2";
  const showPct = pct !== null && !(stage === "send" && (fromDrive || pct >= 99));
  const showBytes = !(stage === "send" && fromDrive) && (total || loaded > 0);
  return (
    <div role="status" aria-live="polite">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-slate-500">
        <span className="min-w-0 truncate">{step && <span className="text-slate-400">{step} · </span>}<span className="font-medium text-slate-700">{label}</span></span>
        {showPct && <span className="num shrink-0 text-sm font-semibold text-slate-900">{pct}%</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={showPct ? pct! : undefined} aria-label={label}>
        {showPct ? (
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-400" />
        )}
      </div>
      {showBytes && (
        <p className="num mt-1 text-xs text-slate-500">{total ? `${formatBytes(Math.min(loaded, total))} of ${formatBytes(total)}` : `${formatBytes(loaded)} so far`}</p>
      )}
    </div>
  );
}
