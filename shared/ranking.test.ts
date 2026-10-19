import { describe, expect, it } from 'vitest';
import { clearDependentRankings, findInvalidRankingSources, getRankingOptions, isCompleteRanking, isRankingApplicable, moveRankingOption, removeInvalidRankingAnswers } from './ranking';

const questions = [
  { id: 'source', type: 'multiple_choice', options: ['Facebook, Zalo', 'TikTok', 'Website'] },
  { id: 'rank', type: 'ranking', carryForwardFromQuestionId: 'source' },
];

describe('ranking carry-forward', () => {
  it('uses only selected source options, in source order', () => {
    expect(getRankingOptions(questions[1], questions, { source: ['Website', 'Facebook, Zalo', 'obsolete'] }))
      .toEqual(['Facebook, Zalo', 'Website']);
    expect(isRankingApplicable(questions[1], questions, { source: [] })).toBe(false);
    expect(isRankingApplicable(questions[1], questions, { source: ['TikTok'] })).toBe(true);
    expect(getRankingOptions({ id: 'static', type: 'ranking', options: ['X', 'Y'] }, questions, {})).toEqual(['X', 'Y']);
  });

  it('accepts a complete permutation, rejects duplicate, missing and extra items', () => {
    expect(isCompleteRanking(['A', 'B'], ['B', 'A'])).toBe(true);
    expect(isCompleteRanking(['A', 'B'], ['A', 'A'])).toBe(false);
    expect(isCompleteRanking(['A', 'B'], ['A'])).toBe(false);
    expect(isCompleteRanking(['A', 'B'], ['A', 'C'])).toBe(false);
  });

  it('clears dependent rankings on source changes and discards stale drafts', () => {
    const original = { source: ['Facebook, Zalo', 'Website'], rank: ['Website', 'Facebook, Zalo'], other: 'kept' };
    expect(clearDependentRankings(questions, original, 'source')).toEqual({ source: original.source, other: 'kept' });
    expect(original.rank).toHaveLength(2);
    expect(removeInvalidRankingAnswers(questions, { source: ['Website'], rank: original.rank, other: 'kept' })).toEqual({ source: ['Website'], other: 'kept' });
    expect(removeInvalidRankingAnswers(questions, original)).toEqual(original);
  });

  it('removes obsolete or duplicate source choices before restoring a draft', () => {
    const original = { source: ['Website', 'removed', 'Website'], rank: ['Website'], other: 'kept' };
    expect(removeInvalidRankingAnswers(questions, original)).toEqual({ source: ['Website'], other: 'kept' });
    expect(original.source).toEqual(['Website', 'removed', 'Website']);
    expect(removeInvalidRankingAnswers(questions, { source: ['removed'], rank: ['removed'] })).toEqual({ source: [] });
  });

  it('moves choices without changing or dropping them', () => {
    expect(moveRankingOption(['A', 'B', 'C'], 2, 0)).toEqual(['C', 'A', 'B']);
    expect(moveRankingOption(['A', 'B'], 0, -1)).toEqual(['A', 'B']);
  });

  it('requires a previous multiple-choice source in a previously visited section', () => {
    expect(findInvalidRankingSources(questions)).toEqual([]);
    expect(findInvalidRankingSources([...questions].reverse())).toEqual([0]);
    expect(findInvalidRankingSources([{ id: 'source', type: 'text' }, questions[1]])).toEqual([1]);
    expect(findInvalidRankingSources([{ ...questions[0], sectionId: 'later' }, { ...questions[1], sectionId: 'first' }], [{ id: 'first' }, { id: 'later' }])).toEqual([1]);
  });
});
