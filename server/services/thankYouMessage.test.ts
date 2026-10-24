import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock('../db', () => ({ default: database }));

import { CreateSurveySchema, ImportResponsesSchema, SaveDraftSchema, UpdateSurveySchema } from '../validators/survey.validator';
import { createSurvey, exportBackup, getDrafts, importBackup, importResponses, saveDraft, updateSurvey } from './survey.service';

const question = { id: 'q1', type: 'text', text: 'Ý kiến của bạn?', required: false };
const message = 'Cảm ơn bạn rất nhiều!\nChúc bạn một ngày vui.';

describe('thank-you message validation', () => {
  it('accepts a custom, empty, or absent message, and limits it to 2000 characters', () => {
    expect(CreateSurveySchema.parse({ title: 'Khảo sát', questions: [question], thankYouMessage: message }).thankYouMessage).toBe(message);
    expect(CreateSurveySchema.parse({ title: 'Khảo sát', questions: [question] }).thankYouMessage).toBeUndefined();
    expect(UpdateSurveySchema.parse({ thankYouMessage: '' }).thankYouMessage).toBe('');
    expect(SaveDraftSchema.parse({}).thankYouMessage).toBeUndefined();
    expect(CreateSurveySchema.safeParse({ title: 'Khảo sát', questions: [question], thankYouMessage: 'a'.repeat(2000) }).success).toBe(true);
    expect(CreateSurveySchema.safeParse({ title: 'Khảo sát', questions: [question], thankYouMessage: 'a'.repeat(2001) }).success).toBe(false);
    expect(UpdateSurveySchema.safeParse({ thankYouMessage: 'a'.repeat(2001) }).success).toBe(false);
    expect(SaveDraftSchema.safeParse({ thankYouMessage: 'a'.repeat(2001) }).success).toBe(false);
    expect(UpdateSurveySchema.safeParse({ thankYouMessage: null }).success).toBe(false);
  });

  it('preserves a message when creating a survey during response import', () => {
    const input = {
      idempotencyKey: 'unique-test-key-12345', mode: 'create',
      newSurvey: { title: 'Nhập dữ liệu', questions: [question], thankYouMessage: message },
      responses: [{ answers: { q1: 'Tốt' } }],
    };
    expect(ImportResponsesSchema.parse(input).newSurvey?.thankYouMessage).toBe(message);
    expect(ImportResponsesSchema.safeParse({ ...input, newSurvey: { ...input.newSurvey, thankYouMessage: 'a'.repeat(2001) } }).success).toBe(false);
  });
});

describe('thank-you message database persistence', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgres://mock');
    database.query.mockReset();
    database.connect.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('stores, updates, clears, and keeps an existing message on unrelated survey updates', async () => {
    let row: any;
    database.query.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes('INSERT INTO surveys')) {
        row = {
          id: args[0], title: args[1], description: args[2], questions: JSON.parse(String(args[3])),
          sections: JSON.parse(String(args[4])), status: args[11], thank_you_message: args[12],
        };
      } else if (sql.startsWith('UPDATE surveys')) {
        row = { ...row, title: args[1], thank_you_message: args[13] };
      }
      return { rows: row ? [row] : [] };
    });

    const created = await createSurvey({ id: 'survey', title: 'Bản đầu', questions: [question], thankYouMessage: message });
    expect(created.thankYouMessage).toBe(message);
    const renamed = await updateSurvey('survey', { title: 'Đổi tên' });
    expect(renamed?.thankYouMessage).toBe(message);
    const cleared = await updateSurvey('survey', { thankYouMessage: '' });
    expect(cleared?.thankYouMessage).toBe('');
    const sql = database.query.mock.calls.find(([statement]) => String(statement).startsWith('UPDATE surveys'))?.[0];
    expect(sql).toContain('thank_you_message = $14');
  });

  it('round-trips a draft and leaves the message unchanged when an older client omits it', async () => {
    let stored: string | null = null;
    database.query.mockImplementation(async (sql: string, args: unknown[] = []) => {
      if (sql.includes('INSERT INTO survey_drafts') && args[12] !== null) stored = String(args[12]);
      return { rows: [{ id: 'draft', title: 'Nháp', description: '', questions: [], sections: [], thank_you_message: stored }] };
    });
    expect((await saveDraft({ id: 'draft', title: 'Nháp', thankYouMessage: message })).thankYouMessage).toBe(message);
    expect((await getDrafts())[0].thankYouMessage).toBe(message);
    expect((await saveDraft({ id: 'draft', title: 'Nháp' })).thankYouMessage).toBe(message);
    expect((await saveDraft({ id: 'draft', title: 'Nháp', thankYouMessage: '' })).thankYouMessage).toBe('');
    const statements = database.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO survey_drafts'));
    expect(statements[1][1][12]).toBeNull();
    expect(statements[2][1][12]).toBe('');
    expect(statements[0][0]).toContain('COALESCE(EXCLUDED.thank_you_message, survey_drafts.thank_you_message)');
  });

  it('exports and restores survey and draft messages, including backups from before this feature', async () => {
    const survey = { id: 'survey', title: 'Khảo sát', questions: [], thank_you_message: message };
    const draft = { id: 'draft', questions: [], thank_you_message: message };
    database.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FROM surveys') ? [survey] : sql.includes('FROM survey_drafts') ? [draft] : [],
    }));
    const backup = await exportBackup();
    expect(backup.surveys[0].thank_you_message).toBe(message);
    expect(backup.drafts[0].thank_you_message).toBe(message);

    const transactionQuery = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    database.connect.mockResolvedValue({ query: transactionQuery, release });
    await importBackup({ surveys: [survey, { id: 'old-survey', title: 'Cũ', questions: [] }], drafts: [draft, { id: 'old-draft', questions: [] }] });
    const surveyCalls = transactionQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO surveys'));
    const draftCalls = transactionQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO survey_drafts'));
    expect(surveyCalls.map(([, args]) => args[13])).toEqual([message, null]);
    expect(draftCalls.map(([, args]) => args[13])).toEqual([message, null]);
    expect(surveyCalls[0][0]).toContain('thank_you_message');
    expect(draftCalls[0][0]).toContain('thank_you_message');
    expect(release).toHaveBeenCalledOnce();
  });

  it('writes the custom message when importing responses into a new survey', async () => {
    const transactionQuery = vi.fn(async (sql: string, _args: unknown[] = []) => {
      if (sql.includes('INSERT INTO responses')) return { rows: [{ id: 'response' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    database.connect.mockResolvedValue({ query: transactionQuery, release: vi.fn() });
    await importResponses({
      idempotencyKey: 'unique-test-key-12345', mode: 'create',
      newSurvey: { title: 'Nhập dữ liệu', questions: [question], thankYouMessage: message },
      responses: [{ answers: { q1: 'Tốt' } }],
    });
    const call = transactionQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO surveys'));
    expect(call?.[0]).toContain('thank_you_message');
    expect(call?.[1]?.[5]).toBe(message);
  });
});
