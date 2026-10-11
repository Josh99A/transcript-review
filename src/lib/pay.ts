export const RATE_PER_HOUR_UGX = 20_000;

/** Pay for a job, prorated by media length and rounded to the nearest shilling. */
export function earningsFor(durationSeconds: number): number {
  return Math.round((durationSeconds * RATE_PER_HOUR_UGX) / 3600);
}
