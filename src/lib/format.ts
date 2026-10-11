export function formatUGX(amount: number): string {
  return `UGX ${amount.toLocaleString("en-US")}`;
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function formatRelative(d: Date | null | undefined, now = new Date()): string {
  if (!d) return "—";
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "1 hr 5 min", "12 min" — for totals of media time. */
export function formatHours(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  if (h === 0) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.round(totalSeconds % 60);
    return m === 0 ? `${s} sec` : s ? `${m} min ${s} sec` : `${m} min`;
  }
  const m = Math.round((totalSeconds % 3600) / 60);
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
