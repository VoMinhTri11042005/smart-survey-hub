/**
 * Reads historical star ratings without changing their value. Older versions
 * of the form permitted half stars, while new submissions are restricted to
 * whole stars by `isIntegerStarRating`. Keeping the original value here avoids
 * rewriting or misreporting existing data during analytics/export.
 */
export function parseStoredStarRating(value: unknown): number | null {
  const rating = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2)) return null;
  return rating;
}

export function isIntegerStarRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}
