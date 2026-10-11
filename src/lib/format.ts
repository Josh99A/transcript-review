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

/** Formats a YYYY-MM-DD pay date, e.g. "Fri 31 Oct 2026". */
export function formatPayDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Whole days from today (in East Africa Time) until a YYYY-MM-DD date; negative if it has passed. */
export function daysUntil(ymd: string, now = new Date()): number {
  const today = new Date(now.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" }) + "T00:00:00Z");
  return Math.round((Date.parse(ymd + "T00:00:00Z") - today.getTime()) / 86_400_000);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Turns a YYYY-MM-DD deadline into the end of that day in Kampala (UTC+3). */
export function parseDeadline(value: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59+03:00`) : null;
}

/** The YYYY-MM-DD (Kampala) of a deadline, for date inputs. */
export function deadlineInput(d: Date | null): string {
  return d ? new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10) : "";
}

/** e.g. "Fri, 17 Oct · 6 days left", "Due today", "2 days overdue". */
export function formatDeadline(d: Date): { text: string; overdue: boolean; soon: boolean } {
  const ymd = deadlineInput(d);
  const days = daysUntil(ymd);
  const date = new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const left = days > 1 ? `${days} days left` : days === 1 ? "due tomorrow" : days === 0 ? "due today" : `${-days} day${days === -1 ? "" : "s"} overdue`;
  return { text: `${date} · ${left}`, overdue: days < 0, soon: days >= 0 && days <= 2 };
}
