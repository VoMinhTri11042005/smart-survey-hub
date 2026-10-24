import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import surveyRoutes from './survey.routes';
import { errorHandler } from '../middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api', surveyRoutes);
app.use(errorHandler);

describe('custom thank-you message HTTP flow', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('exposes each survey message publicly while preserving old and cleared messages', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const questions = [
      { id: 'q1', type: 'text', text: 'Bạn nghĩ gì?', required: false },
      { id: 'q2', type: 'star_rating', text: 'Đánh giá', required: true, scaleMinLabel: 'Không hài lòng', scaleMaxLabel: 'Rất hài lòng' },
    ];
    const created = await request(app).post('/api/surveys').send({ title: 'Bản riêng', questions, thankYouMessage: 'Cảm ơn rất nhiều!\nHẹn gặp lại.' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const opened = await request(app).get(`/api/surveys/${id}`);
    expect(opened.body.thankYouMessage).toBe('Cảm ơn rất nhiều!\nHẹn gặp lại.');
    expect(opened.body.questions[1]).toMatchObject({ scaleMinLabel: 'Không hài lòng', scaleMaxLabel: 'Rất hài lòng' });
    expect((await request(app).put(`/api/surveys/${id}`).send({ title: 'Đổi tên' })).body.thankYouMessage).toBe('Cảm ơn rất nhiều!\nHẹn gặp lại.');
    expect((await request(app).put(`/api/surveys/${id}`).send({ thankYouMessage: '' })).body.thankYouMessage).toBe('');
    expect((await request(app).get(`/api/surveys/${id}`)).body.thankYouMessage).toBe('');
    expect((await request(app).put(`/api/surveys/${id}`).send({ thankYouMessage: 'a'.repeat(2001) })).status).toBe(400);
    expect((await request(app).put(`/api/surveys/${id}`).send({ questions: [questions[0], { ...questions[1], scaleMinLabel: 'a'.repeat(101) }] })).status).toBe(400);
    expect((await request(app).put(`/api/surveys/${id}`).send({ questions: [questions[0], { ...questions[1], scaleMaxLabel: 'a'.repeat(101) }] })).status).toBe(400);

    const legacyQuestions = [questions[0], { id: 'q2', type: 'star_rating', text: 'Đánh giá', required: true }];
    const legacy = await request(app).post('/api/surveys').send({ title: 'Bản cũ', questions: legacyQuestions });
    expect(legacy.status).toBe(201);
    const legacyOpened = await request(app).get(`/api/surveys/${legacy.body.id}`);
    expect(legacyOpened.body.thankYouMessage).toBe('');
    expect(legacyOpened.body.questions[1].scaleMinLabel).toBeUndefined();
    expect(legacyOpened.body.questions[1].scaleMaxLabel).toBeUndefined();
  });
});
