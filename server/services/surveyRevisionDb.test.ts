import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitResponse } from './survey.service';

const { connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  connectMock: vi.fn(), queryMock: vi.fn(), releaseMock: vi.fn(),
}));
vi.mock('../db', () => ({ default: { connect: connectMock } }));

const surveyRow = {
  id: 'survey-1', status: 'live', survey_revision: 'version-2',
  questions: [{ id: 'q1', type: 'text', text: 'Nội dung mới', required: true }],
  is_quiz: false, max_attempts_per_device: null,
};

describe('survey revision database transaction', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgres://unit-test.invalid/never-connect');
    connectMock.mockReset(); queryMock.mockReset(); releaseMock.mockReset();
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    queryMock.mockImplementation(async (sql: string, args: unknown[] = []) => {
      if (sql.startsWith('SELECT * FROM surveys')) return { rows: [surveyRow] };
      if (sql.startsWith('SELECT id FROM responses')) return { rows: [] };
      if (sql.includes('INSERT INTO responses')) return { rows: [{
        id: args[0], survey_id: args[1], respondent_id: args[2], answers: JSON.parse(String(args[3])),
        score: args[4], total_quiz_questions: args[5], screened_out: args[6],
        survey_snapshot: args[7] ? JSON.parse(String(args[7])) : null, submitted_at: '2026-01-01T00:00:00Z',
      }] };
      return { rows: [] };
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('locks the survey before saving a verified snapshot', async () => {
    const result = await submitResponse('survey-1', {
      respondentId: 'device-one-attempt-1', answers: { q1: 'A' }, surveyRevision: 'version-2',
    });
    expect(result?.surveySnapshot?.questions[0].text).toBe('Nội dung mới');
    expect(queryMock.mock.calls[0][0]).toBe('BEGIN');
    expect(queryMock.mock.calls[1][0]).toMatch(/FOR SHARE/);
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it('rolls back a stale version without inserting any response', async () => {
    await expect(submitResponse('survey-1', {
      respondentId: 'device-one-attempt-1', answers: { q1: 'A' }, surveyRevision: 'version-1',
    })).rejects.toMatchObject({ status: 409 });
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO responses'))).toBe(false);
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(releaseMock).toHaveBeenCalledOnce();
  });
});
