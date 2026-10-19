import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('../db', () => ({ default: database }));

import { ImportResponsesSchema } from '../validators/survey.validator';
import { importResponses, importSourceMarkerKey } from './survey.service';

type Batch = { request_hash: string; survey_id: string; imported_count: number; skipped_count: number };
type FakeSurvey = { questions: { id: string; type: string; text: string }[]; is_quiz: boolean };

describe('file imports', () => {
  const sourceFileHash = 'a'.repeat(64);
  const question = { id: 'q1', type: 'text', text: 'Answer' };
  let surveys: Map<string, FakeSurvey>;
  let batches: Map<string, Batch>;
  let responses: { surveyId: string; respondentId: string; answers: unknown }[];
  let query: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgres://mock');
    surveys = new Map([['s1', { questions: [question], is_quiz: false }], ['s2', { questions: [question], is_quiz: false }]]);
    batches = new Map();
    responses = [];
    query = vi.fn(async (sql: string, args: unknown[] = []) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('SELECT request_hash')) {
        const batch = batches.get(String(args[0]));
        return { rows: batch ? [batch] : [], rowCount: batch ? 1 : 0 };
      }
      if (sql.startsWith('SELECT idempotency_key FROM survey_import_batches')) {
        const exists = batches.has(String(args[0]));
        return { rows: exists ? [{ idempotency_key: args[0] }] : [], rowCount: exists ? 1 : 0 };
      }
      if (sql.startsWith('SELECT questions, is_quiz FROM surveys')) {
        const survey = surveys.get(String(args[0]));
        return { rows: survey ? [survey] : [], rowCount: survey ? 1 : 0 };
      }
      if (sql.includes('INSERT INTO surveys')) {
        surveys.set(String(args[0]), { questions: JSON.parse(String(args[3])), is_quiz: Boolean(args[4]) });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO responses')) {
        responses.push({ surveyId: String(args[1]), respondentId: String(args[2]), answers: JSON.parse(String(args[3])) });
        return { rows: [{ id: args[0] }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO survey_import_batches')) {
        const key = String(args[0]);
        if (!batches.has(key)) batches.set(key, { request_hash: String(args[1]), survey_id: String(args[2]), imported_count: Number(args[3]), skipped_count: Number(args[4]) });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    database.connect.mockResolvedValue({ query, release: vi.fn() });
  });

  afterEach(() => {
    database.connect.mockReset();
    vi.unstubAllEnvs();
  });

  const request = (idempotencyKey: string, surveyId = 's1', hash = sourceFileHash) => ({
    idempotencyKey,
    mode: 'existing',
    surveyId,
    sourceFileHash: hash,
    responses: [{ answers: { q1: 'same answer' } }, { answers: { q1: 'same answer' } }],
  });

  it('keeps identical rows, but detects the same exact file on a later request', async () => {
    expect(await importResponses(request('initial-key-123456'))).toMatchObject({ imported: 2, replayed: false });
    expect(responses).toHaveLength(2);
    expect(responses[0].respondentId).not.toBe(responses[1].respondentId);
    expect(batches.has(importSourceMarkerKey('s1', sourceFileHash))).toBe(true);
    expect(await importResponses(request('initial-key-123456'))).toMatchObject({ imported: 2, replayed: true });
    expect(responses).toHaveLength(2);
    expect(await importResponses(request('another-key-123456'))).toMatchObject({ imported: 0, duplicateSource: true });
    expect(responses).toHaveLength(2);
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['survey-import-source', importSourceMarkerKey('s1', sourceFileHash)]);
  });

  it('allows different files or destination surveys and an explicitly confirmed reimport', async () => {
    await importResponses(request('first-key-12345678'));
    await importResponses(request('other-file-1234567', 's1', 'b'.repeat(64)));
    await importResponses(request('other-survey-12345', 's2'));
    expect(responses).toHaveLength(6);

    const confirmed = { ...request('confirmed-key-12345'), allowDuplicateFile: true };
    expect(await importResponses(confirmed)).toMatchObject({ imported: 2, replayed: false });
    expect(await importResponses(confirmed)).toMatchObject({ imported: 2, replayed: true });
    expect(responses).toHaveLength(8);
    await expect(importResponses({ ...confirmed, responses: [{ answers: { q1: 'different' } }] })).rejects.toMatchObject({ status: 409 });
  });

  it('tracks the file when it creates a survey, too', async () => {
    const created = await importResponses({
      idempotencyKey: 'create-key-1234567', mode: 'create', sourceFileHash,
      newSurvey: { title: 'Imported', questions: [question] },
      responses: [{ answers: { q1: 'same answer' } }],
    });
    expect(await importResponses(request('repeat-key-12345678', created!.surveyId))).toMatchObject({ duplicateSource: true });
    expect(responses).toHaveLength(1);
  });

  it('reserves marker keys and validates fingerprints and explicit reimports', () => {
    expect(ImportResponsesSchema.safeParse(request('source-sha256:' + 'f'.repeat(64))).success).toBe(false);
    expect(ImportResponsesSchema.safeParse(request('valid-key-12345678', 's1', 'not-a-hash')).success).toBe(false);
    const noFile = { ...request('valid-key-12345678'), sourceFileHash: undefined, allowDuplicateFile: true };
    expect(ImportResponsesSchema.safeParse(noFile).success).toBe(false);
  });
});
