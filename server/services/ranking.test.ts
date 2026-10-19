import { describe, expect, it } from 'vitest';
import { CreateSurveySchema, UpdateSurveySchema } from '../validators/survey.validator';
import { assertMergedSurveyStructure, validateResponseAnswers } from './survey.service';

const source = { id: 'source', type: 'multiple_choice', text: 'Chọn kênh', options: ['A', 'B', 'C'], required: false };
const rank = { id: 'rank', type: 'ranking', text: 'Xếp hạng', carryForwardFromQuestionId: 'source', required: true };

describe('ranking survey validation', () => {
  it('accepts and preserves a valid link, and rejects invalid links or empty static rankings', () => {
    const valid = CreateSurveySchema.safeParse({ title: 'Khảo sát', questions: [source, rank] });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.questions[1].carryForwardFromQuestionId).toBe('source');
    expect(CreateSurveySchema.safeParse({ title: 'Khảo sát', questions: [rank, source] }).success).toBe(false);
    expect(CreateSurveySchema.safeParse({ title: 'Khảo sát', questions: [{ ...source, type: 'single_choice' }, rank] }).success).toBe(false);
    expect(CreateSurveySchema.safeParse({ title: 'Khảo sát', questions: [{ ...rank, carryForwardFromQuestionId: 'missing' }] }).success).toBe(false);
    expect(CreateSurveySchema.safeParse({ title: 'Khảo sát', questions: [{ ...rank, carryForwardFromQuestionId: undefined }] }).success).toBe(false);
    expect(CreateSurveySchema.safeParse({ title: 'Khảo sát', questions: [{ ...rank, carryForwardFromQuestionId: undefined, options: ['A', 'B'] }] }).success).toBe(true);
    expect(UpdateSurveySchema.safeParse({ title: 'Đổi tên' }).success).toBe(true);
  });

  it('rejects a source that is displayed in a later section', () => {
    const questions = [{ ...source, sectionId: 'later' }, { ...rank, sectionId: 'first' }];
    const sections = [{ id: 'first', title: 'Phần 1' }, { id: 'later', title: 'Phần 2' }];
    expect(CreateSurveySchema.safeParse({ title: 'Khảo sát', questions, sections }).success).toBe(false);
    expect(() => assertMergedSurveyStructure(questions, sections)).toThrow(/xuất hiện trước/);
  });

  it('requires precisely the selected items once, and skips the question when no source is selected', () => {
    const questions = [source, rank];
    expect(() => validateResponseAnswers(questions, { source: ['A', 'C'], rank: ['C', 'A'] })).not.toThrow();
    expect(() => validateResponseAnswers(questions, { source: [] })).not.toThrow();
    expect(() => validateResponseAnswers(questions, { source: ['A', 'C'] })).toThrow(/Vui lòng trả lời/);
    expect(() => validateResponseAnswers(questions, { source: ['A', 'C'], rank: ['A', 'B'] })).toThrow(/xếp hạng/);
    expect(() => validateResponseAnswers(questions, { source: ['A', 'C'], rank: ['A', 'A'] })).toThrow(/xếp hạng/);
    expect(() => validateResponseAnswers(questions, { source: ['A', 'C'], rank: ['A'] })).toThrow(/xếp hạng/);
    expect(() => validateResponseAnswers(questions, { source: [], rank: ['A'] })).toThrow(/xếp hạng/);
    expect(() => validateResponseAnswers([source, { ...rank, required: false }], { source: ['A'] })).not.toThrow();
  });
});
