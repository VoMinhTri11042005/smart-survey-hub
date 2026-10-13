import { describe, expect, it } from 'vitest';
import { allocateExclusivePercents, roundPercent, sanitizeSpreadsheetValue } from './percent';

describe('allocateExclusivePercents', () => {
  it('makes single-choice shares sum to 100', () => {
    const percents = allocateExclusivePercents([20, 13, 2, 0, 0], 35);
    // Decimal tenths are not represented exactly in binary floating point;
    // the displayed one-decimal values still sum to exactly 100.0%.
    expect(percents.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 10);
    expect(percents[0]).toBe(57.2);
    expect(percents[1]).toBe(37.1);
    expect(percents[2]).toBe(5.7);
    expect(percents.slice(3)).toEqual([0, 0]);
  });

  it('splits a 2/2/2 NPS split without dropping a tenth of a percent', () => {
    expect(allocateExclusivePercents([2, 2, 2], 6)).toEqual([33.4, 33.3, 33.3]);
  });
});

describe('roundPercent', () => {
  it('keeps one decimal by default', () => {
    expect(roundPercent(50 / 3)).toBe(16.7);
  });
});

describe('sanitizeSpreadsheetValue', () => {
  it('prefixes formula-like text', () => {
    expect(sanitizeSpreadsheetValue('=cmd|calc')).toBe("'=cmd|calc");
    expect(sanitizeSpreadsheetValue('+1+1')).toBe("'+1+1");
    expect(sanitizeSpreadsheetValue('Sinh viên năm 4')).toBe('Sinh viên năm 4');
    expect(sanitizeSpreadsheetValue(12)).toBe(12);
  });
});
