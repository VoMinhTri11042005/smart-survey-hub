import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/errorHandler';
import chatRoutes from './chat.routes';

const { getSurveyMock, chatMock } = vi.hoisted(() => ({
  getSurveyMock: vi.fn(),
  chatMock: vi.fn(),
}));

vi.mock('../services/survey.service', () => ({ getSurveyById: getSurveyMock }));
vi.mock('../services/gemini.service', () => ({ chatWithContext: chatMock }));
vi.mock('../middleware/auth.middleware', () => ({
  requireAdmin: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.get('Authorization') === 'Bearer admin-test') return next();
    return res.status(401).json({ error: 'Yêu cầu đăng nhập.' });
  },
}));

const app = express();
app.use(express.json());
app.use('/api', chatRoutes);
app.use(errorHandler);

const liveSurvey = {
  id: 'survey-1',
  status: 'live',
  title: 'Khảo sát',
  description: 'Mô tả',
  questions: [{ id: 'q1', type: 'single_choice', text: 'Câu hỏi?', correctAnswer: 'B', points: 3 }],
};

describe('chat routes', () => {
  beforeEach(() => {
    getSurveyMock.mockReset();
    chatMock.mockReset();
    getSurveyMock.mockResolvedValue(liveSurvey);
    chatMock.mockResolvedValue('Giải thích câu hỏi.');
  });

  it('lets a participant chat using only server-loaded, non-secret context', async () => {
    const response = await request(app).post('/api/surveys/survey-1/chat').send({
      message: '  Giải thích giúp tôi  ',
      surveyTitle: 'client-controlled title',
      questions: [{ text: 'client-controlled context' }],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: 'Giải thích câu hỏi.' });
    expect(getSurveyMock).toHaveBeenCalledWith('survey-1');
    expect(chatMock).toHaveBeenCalledWith('Giải thích giúp tôi', 'Khảo sát', 'Mô tả', [
      { type: 'single_choice', text: 'Câu hỏi?' },
    ]);
  });

  it('rejects nonexistent surveys and surveys that are not open', async () => {
    getSurveyMock.mockResolvedValueOnce(null);
    expect((await request(app).post('/api/surveys/missing/chat').send({ message: 'Xin chào' })).status).toBe(404);
    getSurveyMock.mockResolvedValueOnce({ ...liveSurvey, status: 'draft' });
    expect((await request(app).post('/api/surveys/survey-1/chat').send({ message: 'Xin chào' })).status).toBe(410);
    getSurveyMock.mockResolvedValueOnce({ ...liveSurvey, closesAt: '2020-01-01T00:00:00Z' });
    expect((await request(app).post('/api/surveys/survey-1/chat').send({ message: 'Xin chào' })).status).toBe(410);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('rejects empty and excessively long public messages', async () => {
    expect((await request(app).post('/api/surveys/survey-1/chat').send({ message: '  ' })).status).toBe(400);
    expect((await request(app).post('/api/surveys/survey-1/chat').send({ message: 'x'.repeat(1001) })).status).toBe(400);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('keeps the administrative chat endpoint behind authentication', async () => {
    expect((await request(app).post('/api/chat').send({ message: 'Xin chào' })).status).toBe(401);
    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer admin-test')
      .send({ message: 'Xin chào', surveyTitle: 'Test', questions: [] });
    expect(response.status).toBe(200);
    expect(chatMock).toHaveBeenCalledOnce();
  });

  it('limits public AI requests from the same IP', async () => {
    let lastResponse;
    for (let i = 0; i < 11; i++) {
      lastResponse = await request(app).post('/api/surveys/survey-1/chat').send({ message: 'Xin chào' });
    }
    expect(lastResponse?.status).toBe(429);
    expect(lastResponse?.headers['retry-after']).toBeTruthy();
  });
});
