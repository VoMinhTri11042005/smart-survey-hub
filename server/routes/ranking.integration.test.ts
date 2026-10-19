import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import surveyRoutes from './survey.routes';
import { errorHandler } from '../middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api', surveyRoutes);
app.use(errorHandler);

describe('ranking HTTP flow', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('publishes the source link, rejects unselected choices, and stores the respondent order', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const questions = [
      { id: 'source', type: 'multiple_choice', text: 'Chọn kênh', options: ['A', 'B', 'C'], required: false },
      { id: 'rank', type: 'ranking', text: 'Xếp hạng', carryForwardFromQuestionId: 'source', required: true },
    ];
    const created = await request(app).post('/api/surveys').send({ title: 'Khảo sát xếp hạng', questions });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const opened = await request(app).get(`/api/surveys/${id}`);
    expect(opened.body.questions[1].carryForwardFromQuestionId).toBe('source');
    const invalid = await request(app).post(`/api/surveys/${id}/responses`).send({
      respondentId: 'device-invalid-attempt-1', surveyRevision: opened.body.surveyRevision,
      answers: { source: ['A', 'C'], rank: ['A', 'B'] },
    });
    expect(invalid.status).toBe(400);
    const valid = await request(app).post(`/api/surveys/${id}/responses`).send({
      respondentId: 'device-valid-attempt-1', surveyRevision: opened.body.surveyRevision,
      answers: { source: ['A', 'C'], rank: ['C', 'A'] },
    });
    expect(valid.status).toBe(200);
    const skipped = await request(app).post(`/api/surveys/${id}/responses`).send({
      respondentId: 'device-skip-attempt-1', surveyRevision: opened.body.surveyRevision, answers: { source: [] },
    });
    expect(skipped.status).toBe(200);
    const stored = await request(app).get(`/api/surveys/${id}/responses`);
    const ranked = stored.body.find((item: any) => item.respondentId === 'device-valid-attempt-1');
    expect(ranked.answers.rank).toEqual(['C', 'A']);
    expect(ranked.surveySnapshot.questions[1].carryForwardFromQuestionId).toBe('source');
    expect(stored.body).toHaveLength(2);
  });
});
