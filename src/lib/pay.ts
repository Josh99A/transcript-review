export const RATE_PER_HOUR_UGX = 20_000;
export const REFERRAL_BONUS_UGX = 10_000;

/** Pay for an amount of media time, prorated and rounded to the nearest shilling. */
export function earningsFor(durationSeconds: number): number {
  return Math.round((durationSeconds * RATE_PER_HOUR_UGX) / 3600);
}
