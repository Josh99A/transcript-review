export const RATE_PER_HOUR_UGX = 30_000;
/** What a referrer earns per hour of transcript submitted by the people they referred. */
export const REFERRAL_RATE_PER_HOUR_UGX = 10_000;

/** Pay for an amount of media time at the usual rate, or at a job's own rate, rounded to the nearest shilling. */
export function earningsFor(durationSeconds: number, ratePerHour: number = RATE_PER_HOUR_UGX): number {
  return Math.round((durationSeconds * ratePerHour) / 3600);
}

/** How a job is priced: a fixed price, its own hourly rate, or neither (the usual rate). */
export type Pricing = { ratePerHour: number | null; fixedPay?: number | null };

/** Whether a job is paid its own price (fixed or special rate) rather than toward the usual hourly rate. */
export function hasOwnPay(job: Pricing): boolean {
  return job.fixedPay != null || job.ratePerHour != null;
}

/** Pay for a job with its own price: the fixed price as is, or its length at its own rate. Null for usual-rate jobs. */
export function ownPay(seconds: number, job: Pricing): number | null {
  if (job.fixedPay != null) return job.fixedPay;
  return job.ratePerHour != null ? earningsFor(seconds, job.ratePerHour) : null;
}

/** One credit's amount: the job's own price, else the usual rate it was approved at, else today's usual rate. */
export function creditAmount(seconds: number, job: Pricing, lockedRate: number | null | undefined): number {
  return ownPay(seconds, job) ?? earningsFor(seconds, lockedRate ?? RATE_PER_HOUR_UGX);
}

/**
 * Referral pay: the referral rate on time paid at the usual rate, plus half of what jobs with their
 * own price paid. Both are 50% of what the referred transcriber earned.
 */
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

/** A fixed price is exact; anything worked out from length is an estimate. */
function expectedLabel(job: { durationSeconds: number } & Pricing): string {
  return job.fixedPay != null ? `UGX ${job.fixedPay.toLocaleString("en-US")}` : `~UGX ${expectedPayFor(job.durationSeconds, job.ratePerHour).toLocaleString("en-US")}`;
}

type PricedJob = { durationSeconds: number; ratePerHour: number | null; fixedPay?: number | null; approvedAt?: Date | null; earnings?: { amount: number }[] };

/** What an approved job was credited, which keeps the rate it was approved at; null while it isn't approved. */
export function approvedPay(job: PricedJob): number | null {
  return job.approvedAt && job.earnings?.length ? job.earnings[0].amount : null;
}

/** Pay label for a job: what it was credited once approved, else the expected pay from its length and rate. */
export function jobPayLabel(job: PricedJob): string {
  const paid = approvedPay(job);
  return paid != null ? `UGX ${paid.toLocaleString("en-US")}` : expectedLabel(job);
}

/** Parses an admin-entered hourly rate or price; empty means none. */
export function parseRate(raw: FormDataEntryValue | null): number | null | "invalid" {
  const s = String(raw ?? "").replace(/[,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 && n <= 10_000_000 ? n : "invalid";
}

/** A job's pricing from the admin's form: a special hourly rate or a fixed price, at most one of them. */
export function parsePricing(form: FormData): { ratePerHour: number | null; fixedPay: number | null } | { error: string } {
  const ratePerHour = parseRate(form.get("ratePerHour"));
  if (ratePerHour === "invalid") return { error: "Enter the rate as a whole number of shillings per hour, or leave it empty." };
  const fixedPay = parseRate(form.get("fixedPay"));
  if (fixedPay === "invalid") return { error: "Enter the fixed price as a whole number of shillings, or leave it empty." };
  if (ratePerHour != null && fixedPay != null) return { error: "Use either a special rate or a fixed price, not both." };
  return { ratePerHour, fixedPay };
}
