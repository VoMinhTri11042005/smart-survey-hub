import { describe, expect, it } from 'vitest';
import { getStoredRatingLevels } from './excelExport';

describe('getStoredRatingLevels', () => {
  it('keeps valid half-star categories for exported tables and charts', () => {
    const levels = getStoredRatingLevels({
      0.5: 1,
      1: 2,
      1.5: 3,
      3.5: 4,
      5: 5,
      5.5: 99,
    });

    expect(levels).toEqual([0.5, 1, 1.5, 3.5, 5]);
  });
});
