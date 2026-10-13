/** Round a percentage to a fixed number of decimal places. */
export function roundPercent(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Convert exclusive counts into displayed percentages that sum to 100.0%
 * (largest-remainder method). Zero-count categories stay at 0%.
 */
export function allocateExclusivePercents(counts: number[], total: number, decimals = 1): number[] {
  if (!counts.length) return [];
  if (!(total > 0)) return counts.map(() => 0);

  const factor = 10 ** decimals;
  const exact = counts.map(count => (count / total) * 100);
  const floored = exact.map(value => Math.floor(value * factor + 1e-8));
  let leftover = Math.round(100 * factor) - floored.reduce((sum, value) => sum + value, 0);
  const recipients = exact
    .map((value, index) => ({
      index,
      fraction: value * factor - floored[index],
      count: counts[index],
    }))
    .filter(item => item.count > 0)
    .sort((left, right) => {
      // Fractions such as 20/35 and 13/35 are mathematically equal but can
      // differ by an IEEE-754 rounding bit. Treat them as a tie so allocation
      // remains deterministic across runtimes.
      const fractionDifference = right.fraction - left.fraction;
      if (Math.abs(fractionDifference) > 1e-9) return fractionDifference;
      return right.count - left.count || left.index - right.index;
    });

  const result = [...floored];
  for (let step = 0; leftover > 0 && recipients.length > 0; step++) {
    result[recipients[step % recipients.length].index] += 1;
    leftover--;
  }

  return result.map(value => value / factor);
}

/** Neutralize CSV/Excel formula injection from open-text answers. */
export function sanitizeSpreadsheetValue(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
