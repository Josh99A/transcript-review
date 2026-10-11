"use client";

import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const SKIP_SECONDS = 5;

type Props = {
  jobId: string;
  mediaType: string;
  /** Lets the parent drive playback (e.g. keyboard shortcuts in the editor). */
  mediaRef?: React.RefObject<HTMLMediaElement | null>;
  compact?: boolean;
};

/** Audio/video player with large, labelled controls: skip back/forward, speed and a seekable timeline. */
export default function MediaPlayer({ jobId, mediaType, mediaRef, compact }: Props) {
  const [el, setEl] = useState<HTMLMediaElement | null>(null);
  const elRef = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const isVideo = mediaType.startsWith("video");
  const src = `/api/media/${jobId}`;

  const attach = (node: HTMLMediaElement | null) => {
    elRef.current = node;
    if (mediaRef) mediaRef.current = node;
    setEl(node);
  };

  useEffect(() => {
    if (!el) return;
    const sync = () => {
      setPlaying(!el.paused);
      setTime(el.currentTime);
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
      setRate(el.playbackRate);
      setMuted(el.muted);
    };
    const events = ["play", "pause", "timeupdate", "loadedmetadata", "ratechange", "volumechange", "seeked"];
    events.forEach((ev) => el.addEventListener(ev, sync));
    sync();
    return () => events.forEach((ev) => el.removeEventListener(ev, sync));
  }, [el]);

  const toggle = () => {
    const m = elRef.current;
    if (!m) return;
    if (m.paused) m.play();
    else m.pause();
  };
  const skip = (s: number) => {
    const m = elRef.current;
    if (m) m.currentTime = Math.min(Math.max(m.currentTime + s, 0), m.duration || 0);
  };
  const set = (fn: (m: HTMLMediaElement) => void) => {
    if (elRef.current) fn(elRef.current);
  };
  const pct = duration ? (time / duration) * 100 : 0;

  return (
    <div className="space-y-3">
      {isVideo ? (
        <video ref={attach} src={src} preload="metadata" playsInline onClick={toggle} className={`w-full rounded-lg bg-black ${compact ? "max-h-56" : "max-h-[24rem]"}`} />
      ) : (
        <audio ref={attach} src={src} preload="metadata" className="hidden" />
      )}

      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
        <button type="button" onClick={() => skip(-SKIP_SECONDS)} className="btn-ghost size-9 px-0" aria-label={`Back ${SKIP_SECONDS} seconds`} title={`Back ${SKIP_SECONDS}s`}>
          <RotateCcw className="size-4.5" />
        </button>
        <button
          type="button"
          onClick={toggle}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-md transition hover:bg-brand-700 active:scale-95"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="ml-0.5 size-5" fill="currentColor" />}
        </button>
        <button type="button" onClick={() => skip(SKIP_SECONDS)} className="btn-ghost size-9 px-0" aria-label={`Forward ${SKIP_SECONDS} seconds`} title={`Forward ${SKIP_SECONDS}s`}>
          <RotateCw className="size-4.5" />
        </button>

        <div className="order-last flex min-w-0 basis-full items-center gap-3 sm:order-none sm:flex-1 sm:basis-auto">
          <span className="num w-12 text-right text-xs text-slate-600">{formatDuration(time)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            onChange={(e) => set((m) => (m.currentTime = Number(e.target.value)))}
            aria-label="Seek"
            className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full accent-brand-600"
            style={{ background: `linear-gradient(to right, var(--color-brand-600) ${pct}%, var(--color-slate-200) ${pct}%)` }}
          />
          <span className="num w-12 text-xs text-slate-500">{formatDuration(duration)}</span>
        </div>

        <button type="button" onClick={() => set((m) => (m.muted = !m.muted))} className="btn-ghost hidden size-9 px-0 sm:inline-flex" aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <VolumeX className="size-4.5" /> : <Volume2 className="size-4.5" />}
        </button>
        <select
          value={rate}
          onChange={(e) => set((m) => (m.playbackRate = Number(e.target.value)))}
          className="input num ml-auto h-9 w-20 px-2 text-base sm:ml-0 sm:h-8 sm:w-[4.5rem] sm:text-xs"
          aria-label="Playback speed"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>
      </div>
    </div>
  );
}
