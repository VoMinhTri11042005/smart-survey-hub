/**
 * Converts legacy half-star values to the survey's integer 1–5 scale.
 * Valid values outside this historical range are deliberately left untouched.
 */
export function roundLegacyStarRating(value: unknown): number | null {
  const rating = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(rating) || rating < 0.5 || rating > 5) return null;
  return Math.min(5, Math.max(1, Math.round(rating)));
}

export function isIntegerStarRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}
