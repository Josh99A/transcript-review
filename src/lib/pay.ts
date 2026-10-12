export const RATE_PER_HOUR_UGX = 20_000;
/** What a referrer earns per hour of transcript submitted by the people they referred. */
export const REFERRAL_RATE_PER_HOUR_UGX = 10_000;

/** Pay for an amount of media time, prorated and rounded to the nearest shilling. */
export function earningsFor(durationSeconds: number): number {
  return Math.round((durationSeconds * RATE_PER_HOUR_UGX) / 3600);
}

/** Referral pay for media time submitted by referred transcribers. */
export function referralPayFor(durationSeconds: number): number {
  return Math.round((durationSeconds * REFERRAL_RATE_PER_HOUR_UGX) / 3600);
}

/**
 * Rough pay a job is expected to bring, for display on the job itself. Actual pay is worked out on
 * each person's total hours, so this is rounded to the nearest 100 and shown as an estimate.
 */
export function expectedPayFor(durationSeconds: number): number {
  return Math.round(earningsFor(durationSeconds) / 100) * 100;
}

/** Expected pay label for a job: its fixed price, or an estimate from its length. */
export function jobPayLabel(job: { durationSeconds: number; fixedPay: number | null }): string {
  const fmt = (n: number) => `UGX ${n.toLocaleString("en-US")}`;
  return job.fixedPay != null ? `${fmt(job.fixedPay)} fixed` : `~${fmt(expectedPayFor(job.durationSeconds))}`;
}

/** Parses an admin-entered fixed price; empty means no fixed price. */
export function parseFixedPay(raw: FormDataEntryValue | null): number | null | "invalid" {
  const s = String(raw ?? "").replace(/[,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 && n <= 100_000_000 ? n : "invalid";
}
