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
