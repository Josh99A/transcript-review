export const PAY_NETWORKS = ["MTN Mobile Money", "Airtel Money", "Bank or other"] as const;

/**
 * Tidies a phone number for display and payment: Ugandan numbers become +256 7XX XXX XXX.
 * Returns null if it doesn't look like a phone number.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let d = digits.replace(/^\+/, "");
  if (/^0\d{9}$/.test(d)) d = "256" + d.slice(1);
  if (/^7\d{8}$/.test(d)) d = "256" + d;
  if (/^256\d{9}$/.test(d)) return `+256 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return /^\d{8,15}$/.test(d) ? "+" + d : null;
}
