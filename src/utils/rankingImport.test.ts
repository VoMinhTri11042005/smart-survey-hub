import { describe, expect, it } from 'vitest';
import { findImportedOption, parseRankingCell } from './rankingImport';

describe('ranking spreadsheet import', () => {
  it('preserves punctuation and order in exported JSON arrays', () => {
    const options = ['Nhóm Facebook, Zalo', 'Website; chính thức', 'TikTok'];
    expect(parseRankingCell('["Website; chính thức","Nhóm Facebook, Zalo"]', options)).toEqual(['Website; chính thức', 'Nhóm Facebook, Zalo']);
    expect(parseRankingCell('TikTok; Nhóm Facebook, Zalo', options)).toEqual(['TikTok', 'Nhóm Facebook, Zalo']);
  });

  it('rejects duplicates, unknown labels, malformed JSON, and ambiguous matches', () => {
    expect(parseRankingCell('["A","A"]', ['A', 'B'])).toBeNull();
    expect(parseRankingCell('["A","Z"]', ['A', 'B'])).toBeNull();
    expect(parseRankingCell('["A",', ['A', 'B'])).toBeNull();
    expect(findImportedOption('co', ['Có', 'Cò'])).toBeUndefined();
  });
});
