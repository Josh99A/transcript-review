"use client";

import { diffWords } from "diff";
import { Check, CloudUpload, Download, FileUp, Keyboard, Send, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveDraft, submitJob } from "@/app/actions";
import { Modal, Spinner } from "@/components/client";
import MediaPlayer, { SKIP_SECONDS, SPEEDS } from "@/components/MediaPlayer";
import { formatDuration, formatHours, formatUGX } from "@/lib/format";
import { expectedPayFor } from "@/lib/pay";

/** Seconds to jump back when resuming with the keyboard, so you re-hear the last words. */
const AUTO_REWIND = 2;

const SHORTCUTS: [string[], string][] = [
  [["Esc"], "Play / pause (rewinds 2s on resume)"],
  [["Ctrl", "Space"], "Play / pause"],
  [["Alt", "←"], `Back ${SKIP_SECONDS} seconds`],
  [["Alt", "→"], `Forward ${SKIP_SECONDS} seconds`],
  [["Alt", "↓"], "Slower"],
  [["Alt", "↑"], "Faster"],
  [["Alt", "T"], "Insert current timestamp"],
  [["Ctrl", "S"], "Save draft"],
];

type SaveState = "saved" | "dirty" | "saving" | "error";

export default function Editor({
  jobId,
  mediaType,
  initial,
  original,
  seconds,
  fixedPay,
}: {
  jobId: string;
  mediaType: string;
  initial: string;
  original: string;
  seconds: number;
  fixedPay: number | null;
}) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [uploadedFrom, setUploadedFrom] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isVideo = mediaType.startsWith("video");

  const dirty = text !== saved;
  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);

  const save = useCallback(
    async (value: string, manual = false) => {
      setSaveState("saving");
      const res = await saveDraft(jobId, value);
      if (res?.error) {
        setSaveState("error");
        toast.error(res.error);
        return;
      }
      setSaved(value);
      setSavedAt(new Date());
      setSaveState("saved");
      if (manual) toast.success("Draft saved");
    },
    [jobId],
  );

  // Autosave 3 seconds after typing stops.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => save(text), 3000);
    return () => clearTimeout(t);
  }, [dirty, text, save]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const insertAtCursor = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const next = value.slice(0, a) + snippet + value.slice(b);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(a + snippet.length, a + snippet.length);
    });
  }, []);

  // Playback shortcuts work while typing, so you never leave the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = mediaRef.current;
      const key = e.key;
      const toggle = (rewind: boolean) => {
        if (!m) return;
        if (m.paused) {
          if (rewind) m.currentTime = Math.max(0, m.currentTime - AUTO_REWIND);
          m.play();
        } else m.pause();
      };
      const setSpeed = (dir: 1 | -1) => {
        if (!m) return;
        const i = SPEEDS.indexOf(m.playbackRate);
        const next = SPEEDS[Math.min(Math.max((i < 0 ? 2 : i) + dir, 0), SPEEDS.length - 1)];
        m.playbackRate = next;
        toast(`Speed ${next}×`, { duration: 900, id: "speed" });
      };
      let handled = true;
      if (key === "Escape" && !document.querySelector("dialog[open]")) toggle(true);
      else if (e.ctrlKey && e.code === "Space") toggle(false);
      else if (e.altKey && key === "ArrowLeft") {
        if (m) m.currentTime = Math.max(0, m.currentTime - SKIP_SECONDS);
      } else if (e.altKey && key === "ArrowRight") {
        if (m) m.currentTime = m.currentTime + SKIP_SECONDS;
      }
      else if (e.altKey && key === "ArrowDown") setSpeed(-1);
      else if (e.altKey && key === "ArrowUp") setSpeed(1);
      else if (e.altKey && e.code === "KeyT") {
        if (m) insertAtCursor(`[${formatDuration(m.currentTime)}] `);
      }
      else if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === "s") save(textareaRef.current?.value ?? "", true);
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [insertAtCursor, save]);

  const changes = useMemo(() => {
    if (!confirmOpen) return { added: 0, removed: 0 };
    let added = 0,
      removed = 0;
    for (const part of diffWords(original, text)) {
      const n = part.value.trim() ? part.value.trim().split(/\s+/).length : 0;
      if (part.added) added += n;
      else if (part.removed) removed += n;
    }
    return { added, removed };
  }, [confirmOpen, original, text]);

  function submit() {
    startSubmit(async () => {
      const res = await submitJob(jobId, text, uploadedFrom ?? undefined);
      if (res?.error) toast.error(res.error);
    });
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const res = await fetch(`/api/jobs/${jobId}/upload`, { method: "POST", body: data });
      const body = await res.json().catch(() => ({ error: "Upload failed. Try again." }));
      if (!res.ok || typeof body.text !== "string") return void toast.error(body.error ?? "Upload failed. Try again.");
      setText(body.text);
      setUploadedFrom(file.name);
      setConfirmOpen(true);
    } catch {
      toast.error("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const status = {
    saved: { icon: <Check className="size-3.5" />, text: savedAt ? `Saved at ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "All changes saved", cls: "text-emerald-700" },
    dirty: { icon: <span className="size-1.5 rounded-full bg-amber-500" />, text: "Unsaved changes", cls: "text-amber-700" },
    saving: { icon: <Spinner className="size-3.5" />, text: "Saving…", cls: "text-slate-500" },
    error: { icon: <span className="size-1.5 rounded-full bg-red-500" />, text: "Couldn't save", cls: "text-red-700" },
  }[saveState === "saved" && dirty ? "dirty" : saveState];

  const player = (
    <div className="card p-4">
      <MediaPlayer jobId={jobId} mediaType={mediaType} mediaRef={mediaRef} />
      <div className="mt-3 hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 sm:flex">
        <span><kbd>Esc</kbd> play/pause</span>
        <span><kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> skip</span>
        <span><kbd>Alt</kbd>+<kbd>T</kbd> timestamp</span>
        <button type="button" onClick={() => setHelpOpen(true)} className="ml-auto inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700">
          <Keyboard className="size-3.5" /> All shortcuts
        </button>
      </div>
    </div>
  );

  return (
    <div className={isVideo ? "grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : "space-y-4"}>
      <div className={isVideo ? "lg:sticky lg:top-6 lg:self-start" : "sticky top-14 z-20 lg:top-0"}>
        {isVideo ? player : <div className="bg-slate-50 pt-2 pb-2 lg:pt-4">{player}</div>}
      </div>

      <div className="card flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-xs">
          <span className={`inline-flex items-center gap-1.5 font-medium ${status.cls}`} aria-live="polite">
            {status.icon}
            {status.text}
          </span>
          <span className="num text-slate-400">{words.toLocaleString()} words</span>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setRestoreOpen(true)} disabled={text === original}>
              <Undo2 className="size-3.5" /> Restore original
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => save(text, true)} disabled={!dirty || saveState === "saving"}>
              <CloudUpload className="size-3.5" /> Save
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
          <span className="mr-auto">Prefer Word? Download the original, edit it, then upload it to submit.</span>
          <a href={`/api/jobs/${jobId}/transcript?format=docx&version=original`} className="btn-ghost btn-sm"><Download className="size-3.5" /> Original .docx</a>
          <a href={`/api/jobs/${jobId}/transcript?version=original`} className="btn-ghost btn-sm"><Download className="size-3.5" /> .txt</a>
          <input ref={fileRef} type="file" accept=".docx,.txt" className="sr-only" id={`up-${jobId}`} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading || submitting}>
            {uploading ? <Spinner className="size-3.5" /> : <FileUp className="size-3.5" />} Upload finished file
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="min-h-[55vh] w-full flex-1 resize-y border-0 bg-white px-5 py-4 font-mono text-base leading-7 sm:text-[15px] text-slate-800 focus:ring-0 focus:outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck
          aria-label="Transcript"
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <p className="text-xs text-slate-500">
            {fixedPay != null ? (
              <>This job pays a fixed <span className="num font-semibold text-slate-700">{formatUGX(fixedPay)}</span> when you submit it.</>
            ) : (
              <>Submitting adds <span className="num font-semibold text-slate-700">{formatHours(seconds)}</span> to your total hours (about <span className="num font-semibold text-slate-700">{formatUGX(expectedPayFor(seconds))}</span>). Pay is worked out on your total hours.</>
            )}
          </p>
          <button type="button" className="btn ml-auto" onClick={() => setConfirmOpen(true)} disabled={submitting || !text.trim()}>
            <Send className="size-4" /> Submit transcript
          </button>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => { if (!submitting) { setConfirmOpen(false); setUploadedFrom(null); } }}
        title={uploadedFrom ? `Submit ${uploadedFrom}?` : "Submit this transcript?"}
        description={uploadedFrom ? "Your file's text is now in the editor. Check the changes below, then submit. You can't edit it after that unless an admin sends it back." : "Once submitted you can't edit it unless an admin sends it back."}
      >
        <dl className="mb-5 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-4 text-center">
          <div><dt className="text-xs text-slate-500">Words added</dt><dd className="num mt-0.5 font-semibold text-emerald-700">+{changes.added}</dd></div>
          <div><dt className="text-xs text-slate-500">Words removed</dt><dd className="num mt-0.5 font-semibold text-red-700">−{changes.removed}</dd></div>
          <div><dt className="text-xs text-slate-500">Adds to your hours</dt><dd className="num mt-0.5 font-semibold text-slate-900">{formatHours(seconds)}</dd></div>
        </dl>
        {changes.added + changes.removed === 0 && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">You haven&apos;t changed anything from the original yet.</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => { setConfirmOpen(false); setUploadedFrom(null); }} disabled={submitting}>Keep editing</button>
          <button type="button" className="btn" onClick={submit} disabled={submitting}>
            {submitting ? <Spinner /> : <Send className="size-4" />} Submit
          </button>
        </div>
      </Modal>

      <Modal open={restoreOpen} onClose={() => setRestoreOpen(false)} title="Restore the original?" description="This replaces your edits with the transcript as it was uploaded.">
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setRestoreOpen(false)}>Cancel</button>
          <button type="button" className="btn-danger" onClick={() => { setText(original); setRestoreOpen(false); }}>Restore original</button>
        </div>
      </Modal>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" description="These work while you type in the transcript.">
        <ul className="divide-y divide-slate-100">
          {SHORTCUTS.map(([keys, label]) => (
            <li key={label} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-slate-700">{label}</span>
              <span className="flex items-center gap-1">
                {keys.map((k, i) => (
                  <span key={k} className="flex items-center gap-1">{i > 0 && <span className="text-slate-400">+</span>}<kbd>{k}</kbd></span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
