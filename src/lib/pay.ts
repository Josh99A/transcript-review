export const RATE_PER_HOUR_UGX = 30_000;
/** What a referrer earns per hour of transcript submitted by the people they referred. */
export const REFERRAL_RATE_PER_HOUR_UGX = 10_000;

/** Pay for an amount of media time at the usual rate, or at a job's own rate, rounded to the nearest shilling. */
export function earningsFor(durationSeconds: number, ratePerHour: number = RATE_PER_HOUR_UGX): number {
  return Math.round((durationSeconds * ratePerHour) / 3600);
}

/**
 * Referral pay: the referral rate on time paid at the usual rate, plus half of what jobs with their
 * own rate paid. Both are 50% of what the referred transcriber earned.
 */
/** One credit's amount: a special rate, else the usual rate it was approved at, else today's usual rate. */
export function creditAmount(seconds: number, jobRate: number | null | undefined, lockedRate: number | null | undefined): number {
  return earningsFor(seconds, jobRate ?? lockedRate ?? RATE_PER_HOUR_UGX);
}

export function referralPayFor(usualSeconds: number, customRatePay = 0): number {
  return Math.round((usualSeconds * REFERRAL_RATE_PER_HOUR_UGX) / 3600) + Math.round(customRatePay / 2);
}

/**
 * Rough pay a job is expected to bring, for display on the job itself. Usual-rate pay is worked out on
 * each person's total hours, so this is rounded to the nearest 100 and shown as an estimate.
 */
export function expectedPayFor(durationSeconds: number, ratePerHour?: number | null): number {
  return Math.round(earningsFor(durationSeconds, ratePerHour ?? undefined) / 100) * 100;
}

/** Expected pay label for a job, from its length and its own rate if it has one. */
export function jobPayLabel(job: { durationSeconds: number; ratePerHour: number | null }): string {
  return `~UGX ${expectedPayFor(job.durationSeconds, job.ratePerHour).toLocaleString("en-US")}`;
}

/** Parses an admin-entered hourly rate; empty means the usual rate. */
export function parseRate(raw: FormDataEntryValue | null): number | null | "invalid" {
  const s = String(raw ?? "").replace(/[,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 && n <= 10_000_000 ? n : "invalid";
}
