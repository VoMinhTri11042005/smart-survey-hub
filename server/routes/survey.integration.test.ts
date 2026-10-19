import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import surveyRoutes from './survey.routes';
import { errorHandler } from '../middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api', surveyRoutes);
app.use(errorHandler);

describe('survey HTTP flow with the development store', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('protects an in-progress form from later edits and honors hidden quiz scores', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const created = await request(app).post('/api/surveys').send({
      title: 'Bài kiểm tra', status: 'live', isQuiz: true, showScore: false, sections: [],
      questions: [{ id: 'q1', type: 'single_choice', text: 'Câu hỏi cũ', options: ['A', 'B'], correctAnswer: 'A', required: true }],
    });
    expect(created.status).toBe(201);
    const surveyId = created.body.id;
    const opened = await request(app).get(`/api/surveys/${surveyId}`);
    expect(opened.status).toBe(200);
    expect(opened.body.surveyRevision).toBeTruthy();
    expect(opened.body.questions[0]).not.toHaveProperty('correctAnswer');

    const updated = await request(app).put(`/api/surveys/${surveyId}`).send({
      questions: [{ id: 'q1', type: 'single_choice', text: 'Câu hỏi mới', options: ['A', 'B'], correctAnswer: 'B', required: true }],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.surveyRevision).not.toBe(opened.body.surveyRevision);

    const stale = await request(app).post(`/api/surveys/${surveyId}/responses`).send({
      respondentId: 'device-stale-attempt-1', answers: { q1: 'A' }, surveyRevision: opened.body.surveyRevision,
    });
    expect(stale.status).toBe(409);
    const submitted = await request(app).post(`/api/surveys/${surveyId}/responses`).send({
      respondentId: 'device-current-attempt-1', answers: { q1: 'B' }, surveyRevision: updated.body.surveyRevision,
    });
    expect(submitted.status).toBe(200);
    for (const field of ['score', 'totalQuizQuestions', 'answers', 'surveySnapshot', 'respondentId']) {
      expect(submitted.body).not.toHaveProperty(field);
    }
    const reopened = await request(app).get(`/api/surveys/${surveyId}/responses/my/device-current-attempt-1`);
    expect(reopened.status).toBe(200);
    expect(reopened.body).not.toHaveProperty('score');
    const adminResponses = await request(app).get(`/api/surveys/${surveyId}/responses`);
    expect(adminResponses.status).toBe(200);
    expect(adminResponses.body).toHaveLength(1);
    expect(adminResponses.body[0].score).toBe(1);
    expect(adminResponses.body[0].surveySnapshot.questions[0].text).toBe('Câu hỏi mới');
  });
});
