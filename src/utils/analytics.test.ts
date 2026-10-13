import { describe, expect, it } from 'vitest';
import type { Survey, SurveyQuestion, SurveyResponse } from '../types';
import { calculateNps, computeSurveyAnalytics, exportResponsesToCsv } from './analytics';

function makeSurvey(questions: SurveyQuestion[], overrides: Partial<Survey> = {}): Survey {
  return {
    id: 'survey-1',
    title: 'Khảo sát kiểm thử',
    description: '',
    questions,
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'live',
    ...overrides,
  };
}

function makeResponse(
  id: string,
  answers: SurveyResponse['answers'],
  overrides: Partial<SurveyResponse> = {},
): SurveyResponse {
  return {
    id,
    surveyId: 'survey-1',
    answers,
    submittedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('calculateNps', () => {
  it('uses only valid 0–10 answers as the denominator', () => {
    const result = calculateNps([10, 9, 8, 7, 6, 0, -1, 11, Number.NaN]);

    expect(result).toEqual({
      score: 0,
      promoters: 2,
      passives: 2,
      detractors: 2,
      // Exclusive categories are allocated with a largest-remainder rule so
      // their displayed one-decimal shares still total exactly 100%.
      promoterPercent: 33.4,
      passivePercent: 33.3,
      detractorPercent: 33.3,
    });
  });
});

describe('computeSurveyAnalytics', () => {
  const questions: SurveyQuestion[] = [
    {
      id: 'text',
      type: 'text',
      text: 'Ý kiến',
      required: true,
    },
    {
      id: 'grid',
      type: 'multiple_choice_grid',
      text: 'Đánh giá theo tiêu chí',
      required: true,
      options: ['Tiêu chí 1', 'Tiêu chí 2'],
      gridColumns: ['Tốt', 'Chưa tốt'],
    },
    {
      id: 'single',
      type: 'single_choice',
      text: 'Lựa chọn một',
      required: false,
      options: ['A', 'B'],
      correctAnswer: 'A',
    },
    {
      id: 'multiple',
      type: 'multiple_choice',
      text: 'Lựa chọn nhiều',
      required: false,
      options: ['X', 'Y', 'Z'],
      correctAnswer: ['X', 'Y'],
    },
  ];

  const responses = [
    makeResponse('r1', {
      text: 'Có nội dung',
      grid: { 'Tiêu chí 1': 'Tốt', 'Tiêu chí 2': 'Chưa tốt' },
      single: 'A',
      multiple: ['X', 'Y'],
    }),
    makeResponse('r2', {
      text: 'Chỉ trả lời một hàng lưới',
      grid: { 'Tiêu chí 1': 'Tốt' },
      single: 'B',
      multiple: ['Y'],
    }),
    makeResponse('r3', {
      grid: { 'Tiêu chí 1': 'Chưa tốt', 'Tiêu chí 2': 'Tốt' },
      single: 'A',
      multiple: [],
    }),
  ];

  it('counts complete submissions exactly instead of reconstructing them from a rounded rate', () => {
    const analytics = computeSurveyAnalytics(makeSurvey(questions), responses);

    expect(analytics.totalResponses).toBe(3);
    expect(analytics.completedResponses).toBe(1);
    expect(analytics.completionRate).toBeGreaterThan(32);
    expect(analytics.completionRate).toBeLessThan(34);
    expect(analytics.questionMetrics.find(metric => metric.questionId === 'grid')).toMatchObject({
      // Coverage counts any supplied grid row; completion above remains strict
      // and requires every mandatory row.
      answered: 3,
      missing: 0,
    });
  });

  it('uses respondents who answered a choice question as its denominator', () => {
    const analytics = computeSurveyAnalytics(makeSurvey(questions), responses);
    const single = analytics.choiceDistributions.find(distribution => distribution.questionId === 'single');
    const multiple = analytics.choiceDistributions.find(distribution => distribution.questionId === 'multiple');

    expect(single?.totalAnswered).toBe(3);
    expect(single?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'A', count: 2 }),
      expect.objectContaining({ label: 'B', count: 1 }),
    ]));
    expect(multiple?.totalAnswered).toBe(2);
    expect(multiple?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'X', count: 1 }),
      expect.objectContaining({ label: 'Y', count: 2 }),
      expect.objectContaining({ label: 'Z', count: 0 }),
    ]));
    expect(multiple?.options.find(option => option.label === 'Y')?.percent).toBeGreaterThan(99);
  });

  it('keeps quiz correctness denominated by answered responses', () => {
    const analytics = computeSurveyAnalytics(makeSurvey(questions, { isQuiz: true }), responses);
    const single = analytics.questionMetrics.find(metric => metric.questionId === 'single');
    const multiple = analytics.questionMetrics.find(metric => metric.questionId === 'multiple');

    expect(single).toMatchObject({ answered: 3, correctCount: 2 });
    expect(single?.correctRate).toBeGreaterThan(66);
    expect(single?.correctRate).toBeLessThan(68);
    expect(multiple).toMatchObject({ answered: 2, correctCount: 1 });
    expect(multiple?.correctRate).toBe(50);
  });

  it('keeps legacy values visible rather than folding them into a current option or star level', () => {
    const analytics = computeSurveyAnalytics(makeSurvey([
      { id: 'choice', type: 'single_choice', text: 'Choice', required: false, options: ['Hiện tại'] },
      { id: 'rating', type: 'star_rating', text: 'Rating', required: false },
    ]), [
      makeResponse('old', { choice: 'Lựa chọn trước đây', rating: 3.5 }),
      makeResponse('new', { choice: 'Hiện tại', rating: 4 }),
    ]);

    const choice = analytics.choiceDistributions[0];
    expect(choice.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Hiện tại', count: 1, percent: 50 }),
      expect.objectContaining({ isUnknown: true, count: 1, percent: 50 }),
    ]));
    expect(analytics.starRatings[0].distribution[3.5]).toBe(1);
    expect(analytics.starRatings[0].average).toBe(3.8);
  });

  it('uses each captured question version for completion and correctness without merging old choices', () => {
    const currentQuestion: SurveyQuestion = {
      id: 'knowledge',
      type: 'single_choice',
      text: 'Câu hỏi phiên bản mới',
      required: true,
      options: ['A', 'B'],
      correctAnswer: 'A',
    };
    const oldQuestion: SurveyQuestion = {
      ...currentQuestion,
      text: 'Câu hỏi phiên bản cũ',
      required: false,
      correctAnswer: 'B',
    };
    const snapshot = (questions: SurveyQuestion[]) => ({
      schemaVersion: 1,
      capturedAt: '2026-01-01T00:00:00.000Z',
      isQuiz: true,
      questions,
    });
    const analytics = computeSurveyAnalytics(makeSurvey([currentQuestion], { isQuiz: true }), [
      makeResponse('old', { knowledge: 'B' }, { surveySnapshot: snapshot([oldQuestion]) }),
      makeResponse('new', { knowledge: 'A' }, { surveySnapshot: snapshot([currentQuestion]) }),
    ]);

    const metric = analytics.questionMetrics[0];
    const choice = analytics.choiceDistributions[0];
    expect(analytics.completedResponses).toBe(2);
    expect(analytics.snapshotCompletionResponses).toBe(2);
    expect(metric).toMatchObject({
      answered: 2,
      comparableResponses: 2,
      versionDifferentResponses: 1,
      correctCount: 2,
      correctRate: 100,
    });
    expect(choice).toMatchObject({ currentVersionAnswered: 1, historicalVersionAnswered: 1 });
    expect(choice.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'A', count: 1 }),
      expect.objectContaining({ label: 'Phiên bản cũ #1: B', count: 1, isHistorical: true }),
    ]));
  });

  it('does not let malformed stored quiz totals contaminate normalized score statistics', () => {
    const analytics = computeSurveyAnalytics(makeSurvey([], { isQuiz: true }), [
      makeResponse('valid-a', {}, { score: 4, totalQuizQuestions: 4 }),
      makeResponse('valid-b', {}, { score: 2, totalQuizQuestions: 4 }),
      makeResponse('invalid-total', {}, { score: 3, totalQuizQuestions: 0 }),
      makeResponse('missing-total', {}, { score: 3 }),
    ]);

    expect(analytics.averageScorePercent).toBe(75);
    expect(analytics.scoredResponseCount).toBe(2);
    expect(analytics.invalidScoreCount).toBe(2);
  });

  it('writes formula-like open answers as text in CSV exports', () => {
    const survey = makeSurvey([
      { id: 'comment', type: 'text', text: 'Ý kiến', required: false },
    ]);
    const csv = exportResponsesToCsv(survey, [makeResponse('csv-1', { comment: '=1+1' })]);

    expect(csv).toContain("\"'=1+1\"");
  });
});
