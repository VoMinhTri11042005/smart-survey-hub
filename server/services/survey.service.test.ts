import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { SubmitResponseSchema } from '../validators/survey.validator';
import {
  assertResponseAttemptAllowed,
  computeServerQuizScore,
  getRespondentDeviceId,
  validateResponseAnswers,
} from './survey.service';

describe('response validation', () => {
  it('accepts valid required and optional answers', () => {
    expect(() => validateResponseAnswers([
      { id: 'choice', type: 'single_choice', text: 'Pick one', options: ['A', 'B'], required: true },
      { id: 'comment', type: 'text', text: 'Comment', required: false },
    ], { choice: 'A', comment: '' })).not.toThrow();
  });

  describe('spreadsheet export dependency', () => {
    it('can build an xlsx workbook with the patched uuid runtime', async () => {
      const workbook = new ExcelJS.Workbook();
      workbook.addWorksheet('Responses').addRow(['Response']);
      const output = await workbook.xlsx.writeBuffer();
      expect(output.byteLength).toBeGreaterThan(0);
    });
  });

  it('rejects missing required answers and unknown question ids', () => {
    const questions = [{ id: 'required', type: 'text', text: 'Required', required: true }];
    expect(() => validateResponseAnswers(questions, {})).toThrow(/Vui lòng trả lời/);
    expect(() => validateResponseAnswers(questions, { other: 'injected' })).toThrow(/không tồn tại/);
  });

  it('rejects invalid choices and multiple-choice limits', () => {
    expect(() => validateResponseAnswers([
      { id: 'choice', type: 'single_choice', text: 'Pick one', options: ['A'], required: true },
    ], { choice: 'not-an-option' })).toThrow(/không khớp lựa chọn/);
    expect(() => validateResponseAnswers([
      { id: 'multi', type: 'multiple_choice', text: 'Pick up to one', options: ['A', 'B'], maxSelections: 1, required: true },
    ], { multi: ['A', 'B'] })).toThrow(/tối đa 1/);
  });

  it('requires every mandatory grid row and text responses to be strings', () => {
    const grid = [{ id: 'grid', type: 'multiple_choice_grid', text: 'Grid', options: ['R1', 'R2'], gridColumns: ['A', 'B'], required: true }];
    expect(() => validateResponseAnswers(grid, { grid: { R1: 'A' } })).toThrow(/đầy đủ các hàng/);
    expect(() => validateResponseAnswers([
      { id: 'comment', type: 'text', text: 'Comment', required: true },
    ], { comment: 123 })).toThrow(/dạng văn bản/);
  });

  it('rejects malformed respondent identifiers at the API boundary', () => {
    expect(SubmitResponseSchema.safeParse({
      respondentId: 'device-browser-123-attempt-1',
      answers: {},
    }).success).toBe(true);
    expect(SubmitResponseSchema.safeParse({
      respondentId: 'admin',
      answers: {},
    }).success).toBe(false);
    expect(getRespondentDeviceId('device-browser-123-attempt-2')).toBe('device-browser-123');
    expect(() => getRespondentDeviceId('attempt-2')).toThrow(/không hợp lệ/);
  });

  it('enforces attempt caps but allows retrying an already-created attempt', () => {
    expect(() => assertResponseAttemptAllowed(2, 1, false)).not.toThrow();
    expect(() => assertResponseAttemptAllowed(2, 2, false)).toThrow(/hết 2 lượt/);
    expect(() => assertResponseAttemptAllowed(2, 2, true)).not.toThrow();
    expect(() => assertResponseAttemptAllowed(null, 20, false)).not.toThrow();
  });

  it('calculates quiz points from the server-side answer key', () => {
    expect(computeServerQuizScore([
      { id: 'one', type: 'single_choice', correctAnswer: 'A', points: 2 },
      { id: 'many', type: 'multiple_choice', correctAnswer: ['B', 'C'], points: 3 },
    ], { one: 'A', many: ['C', 'B'] })).toEqual({ score: 5, totalPossible: 5 });
  });
});
