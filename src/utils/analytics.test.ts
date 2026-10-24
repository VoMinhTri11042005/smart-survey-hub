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
    const snapshot = {
      schemaVersion: 1,
      capturedAt: '2026-01-01T00:00:00.000Z',
      isQuiz: true,
      questions,
    };
    const analytics = computeSurveyAnalytics(makeSurvey(questions, { isQuiz: true }), responses.map(response => ({ ...response, surveySnapshot: snapshot })));
    const single = analytics.questionMetrics.find(metric => metric.questionId === 'single');
    const multiple = analytics.questionMetrics.find(metric => metric.questionId === 'multiple');

    expect(single).toMatchObject({ answered: 3, correctCount: 2 });
    expect(single?.correctRate).toBeGreaterThan(66);
    expect(single?.correctRate).toBeLessThan(68);
    expect(multiple).toMatchObject({ answered: 2, correctCount: 1 });
    expect(multiple?.correctRate).toBe(50);
  });

  it('does not grade ordinary surveys or snapshot-less historical answers as a quiz', () => {
    const keyedQuestion: SurveyQuestion = {
      id: 'keyed', type: 'single_choice', text: 'Câu có đáp án cũ', required: false, options: ['A', 'B'], correctAnswer: 'A',
    };
    const ordinary = computeSurveyAnalytics(makeSurvey([keyedQuestion]), [makeResponse('ordinary', { keyed: 'A' })]);
    expect(ordinary.questionMetrics[0]?.correctRate).toBeUndefined();
    expect(ordinary.questionMetrics[0]?.correctCount).toBeUndefined();

    const legacyQuiz = computeSurveyAnalytics(makeSurvey([keyedQuestion], { isQuiz: true }), [makeResponse('legacy', { keyed: 'A' })]);
    expect(legacyQuiz.questionMetrics[0]).toMatchObject({ correctCount: 0, correctSampleSize: 0 });
    expect(legacyQuiz.questionMetrics[0]?.correctRate).toBeUndefined();
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

  it('merges formatting-only legacy choice values into their one current option', () => {
    const analytics = computeSurveyAnalytics(makeSurvey([
      { id: 'choice', type: 'single_choice', text: 'Lựa chọn', required: false, options: ['Có', 'Không'] },
    ]), [
      makeResponse('html-yes', { choice: '<p>Có&nbsp;</p>' }),
      makeResponse('nfd-yes', { choice: 'Co\u0301' }),
      makeResponse('space-no', { choice: '\u00a0Không\u00a0' }),
      makeResponse('nfd-no', { choice: 'Kho\u0302ng' }),
    ]);

    const choice = analytics.choiceDistributions[0];
    expect(choice).toMatchObject({ totalAnswered: 4, legacyUnversionedAnswered: 4 });
    expect(choice.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Có', count: 2, percent: 50 }),
      expect.objectContaining({ label: 'Không', count: 2, percent: 50 }),
    ]));
    expect(choice.options).toHaveLength(2);
    expect(choice.options.some(option => option.isUnknown)).toBe(false);
  });

  it('does not double count formatting-only duplicates in an old multi-select response', () => {
    const analytics = computeSurveyAnalytics(makeSurvey([
      { id: 'multi', type: 'multiple_choice', text: 'Lựa chọn', required: false, options: ['Có', 'Không'] },
    ]), [
      makeResponse('legacy-a', { multi: ['Có', '<strong>Có</strong>', ' Không '] }),
      makeResponse('legacy-b', { multi: ['<em>Có</em>'] }),
    ]);

    const choice = analytics.choiceDistributions[0];
    expect(choice).toMatchObject({ totalAnswered: 2, legacyUnversionedAnswered: 2 });
    expect(choice.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Có', count: 2, percent: 100 }),
      expect.objectContaining({ label: 'Không', count: 1, percent: 50 }),
    ]));
    expect(choice.options.some(option => option.isUnknown)).toBe(false);
  });

  it('keeps a legacy formatting variant separate when the configured display label is ambiguous', () => {
    const analytics = computeSurveyAnalytics(makeSurvey([
      { id: 'choice', type: 'single_choice', text: 'Lựa chọn', required: false, options: ['Có', '<p>Có</p>', 'Không'] },
    ]), [
      makeResponse('legacy', { choice: '<i>Có</i>' }),
    ]);

    const choice = analytics.choiceDistributions[0];
    expect(choice.options.filter(option => option.isAmbiguous)).toHaveLength(2);
    expect(choice.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ isUnknown: true, count: 1 }),
    ]));
  });

  it('treats snapshot questions with formatting-only changes as the same instrument', () => {
    const currentQuestion: SurveyQuestion = {
      id: 'choice', type: 'single_choice', text: '<p>Bạn chọn đáp án nào?</p>', required: true, options: ['Có', 'Không'],
    };
    const capturedQuestion: SurveyQuestion = {
      ...currentQuestion,
      text: 'Bạn chọn đáp án nào?',
      options: ['<strong>Có</strong>', 'Không&nbsp;'],
    };
    const snapshot = (questions: SurveyQuestion[]) => ({
      schemaVersion: 1,
      capturedAt: '2026-01-01T00:00:00.000Z',
      isQuiz: false,
      questions,
    });

    const analytics = computeSurveyAnalytics(makeSurvey([currentQuestion]), [
      makeResponse('old-format', { choice: '<strong>Có</strong>' }, { surveySnapshot: snapshot([capturedQuestion]) }),
      makeResponse('new-format', { choice: 'Không' }, { surveySnapshot: snapshot([currentQuestion]) }),
    ]);

    const choice = analytics.choiceDistributions[0];
    expect(analytics.responsesWithSchemaDifferences).toBe(0);
    expect(choice).toMatchObject({ currentVersionAnswered: 2, historicalVersionAnswered: 0 });
    expect(choice.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Có', count: 1 }),
      expect.objectContaining({ label: 'Không', count: 1 }),
    ]));
    expect(choice.options.some(option => option.isHistorical || option.isUnknown)).toBe(false);
  });

  it('separates star answers collected with different endpoint meanings while preserving old defaults', () => {
    const oldQuestion: SurveyQuestion = { id: 'stars', type: 'star_rating', text: 'Đánh giá', required: true };
    const explicitDefault = { ...oldQuestion, scaleMinLabel: 'Cần cải thiện', scaleMaxLabel: 'Tuyệt vời' };
    const customQuestion = { ...oldQuestion, scaleMinLabel: 'Chưa hài lòng', scaleMaxLabel: 'Rất hài lòng' };
    const snapshot = (question: SurveyQuestion) => ({ schemaVersion: 1, capturedAt: '2026-01-01T00:00:00.000Z', isQuiz: false, questions: [question] });
    const responses = [
      makeResponse('old', { stars: 2 }, { surveySnapshot: snapshot(oldQuestion) }),
      makeResponse('default', { stars: 5 }, { surveySnapshot: snapshot(explicitDefault) }),
      makeResponse('custom', { stars: 4 }, { surveySnapshot: snapshot(customQuestion) }),
    ];
    const defaults = computeSurveyAnalytics(makeSurvey([explicitDefault]), responses);
    expect(defaults.starRatings[0]).toMatchObject({ totalAnswered: 2, average: 3.5 });
    expect(defaults.questionMetrics[0].versionDifferentResponses).toBe(1);
    const custom = computeSurveyAnalytics(makeSurvey([customQuestion]), responses);
    expect(custom.starRatings[0]).toMatchObject({ totalAnswered: 1, average: 4 });
    expect(custom.questionMetrics[0].versionDifferentResponses).toBe(2);
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

  it('omits recognized direct-identifier fields from standard CSV exports', () => {
    const survey = makeSurvey([
      { id: 'email', type: 'text', text: 'Email của bạn', required: false },
      { id: 'comment', type: 'text', text: 'Ý kiến', required: false },
    ]);
    const csv = exportResponsesToCsv(survey, [makeResponse('csv-pii', { email: 'person@example.com', comment: 'Giữ lại' })]);

    expect(csv).not.toContain('Email của bạn');
    expect(csv).not.toContain('person@example.com');
    expect(csv).toContain('Ý kiến');
    expect(csv).toContain('Giữ lại');
  });
});
