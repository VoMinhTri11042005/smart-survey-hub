import { describe, expect, it } from 'vitest';
import type { Survey, SurveyQuestion, SurveyResponse } from '../types';
import { computeSurveyAnalytics, exportResponsesToCsv } from './analytics';
import { createSurveyAnalysisWorkbook } from './excelExport';
import { parseRankingCell } from './rankingImport';

const questions: SurveyQuestion[] = [
  { id: 'source', type: 'multiple_choice', text: 'Các kênh', options: ['Facebook, Zalo', 'Website; chính thức', 'TikTok'], required: false },
  { id: 'rank', type: 'ranking', text: 'Xếp hạng kênh', carryForwardFromQuestionId: 'source', required: true },
];
const survey: Survey = { id: 's', title: 'Khảo sát', description: '', questions, status: 'live', createdAt: '2026-01-01T00:00:00.000Z' };
const snapshot = (items: SurveyQuestion[]) => ({ schemaVersion: 1, capturedAt: '2026-01-01T00:00:00.000Z', isQuiz: false, questions: items });
const response = (id: string, answers: SurveyResponse['answers'], items = questions): SurveyResponse => ({
  id, surveyId: 's', answers, submittedAt: '2026-01-01T00:00:00.000Z', surveySnapshot: snapshot(items),
});

describe('ranking analytics', () => {
  it('excludes skipped dependent questions from the denominator and separates changed source versions', () => {
    const oldQuestions: SurveyQuestion[] = [{ ...questions[0], options: [...questions[0].options!, 'Kênh cũ'] }, questions[1]];
    const responses = [
      response('a', { source: ['Facebook, Zalo', 'Website; chính thức'], rank: ['Website; chính thức', 'Facebook, Zalo'] }),
      response('b', { source: [] }),
      response('c', { source: ['Facebook, Zalo'], rank: ['Facebook, Zalo'] }),
      response('old', { source: ['Facebook, Zalo'], rank: ['Facebook, Zalo'] }, oldQuestions),
    ];
    const analytics = computeSurveyAnalytics(survey, responses);
    expect(analytics.completedResponses).toBe(4);
    expect(analytics.questionMetrics[1]).toMatchObject({ comparableResponses: 3, answered: 3, missing: 0 });
    const ranking = analytics.rankingDistributions[0];
    expect(ranking).toMatchObject({ totalAnswered: 2, excludedOtherVersion: 1, invalidAnswers: 0 });
    expect(ranking.options).toEqual([
      { label: 'Website; chính thức', count: 1, firstPlace: 1, averageRank: 1 },
      { label: 'Facebook, Zalo', count: 2, firstPlace: 1, averageRank: 1.5 },
    ]);
  });

  it('preserves ordered choices and punctuation in spreadsheet and CSV exports', () => {
    const responses = [response('a', { source: ['Facebook, Zalo', 'Website; chính thức'], rank: ['Website; chính thức', 'Facebook, Zalo'] })];
    const { workbook } = createSurveyAnalysisWorkbook(survey, responses);
    const raw = workbook.getWorksheet('Dữ liệu phản hồi')!;
    expect(raw.getCell('C2').value).toBe('["Facebook, Zalo","Website; chính thức"]');
    expect(raw.getCell('D2').value).toBe('["Website; chính thức","Facebook, Zalo"]');
    const ranking = workbook.getWorksheet('Xếp hạng')!;
    expect(ranking.getCell('C2').value).toBe('Website; chính thức');
    expect(ranking.getCell('D2').value).toBe(1);
    expect(exportResponsesToCsv(survey, responses)).toContain('[""Website; chính thức"",""Facebook, Zalo""]');
  });

  it('keeps angle brackets in separate choices when exporting and re-importing a ranking', () => {
    const options = ['< 10', '> 20'];
    const changedQuestions: SurveyQuestion[] = [{ ...questions[0], options }, questions[1]];
    const changedSurvey = { ...survey, questions: changedQuestions };
    const responses = [response('a', { source: options, rank: [...options].reverse() }, changedQuestions)];
    const { workbook } = createSurveyAnalysisWorkbook(changedSurvey, responses);
    const raw = workbook.getWorksheet('Dữ liệu phản hồi')!;
    const sourceCell = String(raw.getCell('C2').value);
    const rankCell = String(raw.getCell('D2').value);
    expect(JSON.parse(sourceCell)).toEqual(options);
    expect(JSON.parse(rankCell)).toEqual(['> 20', '< 10']);
    expect(parseRankingCell(sourceCell, options)).toEqual(options);
    expect(parseRankingCell(rankCell, options)).toEqual(['> 20', '< 10']);
    expect(exportResponsesToCsv(changedSurvey, responses)).toContain('[""> 20"",""< 10""]');
  });
});
