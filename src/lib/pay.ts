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
