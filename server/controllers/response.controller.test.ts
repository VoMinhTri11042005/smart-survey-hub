import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as responseController from './response.controller';

const { submitMock, getMineMock, getSurveyMock } = vi.hoisted(() => ({
  submitMock: vi.fn(), getMineMock: vi.fn(), getSurveyMock: vi.fn(),
}));
vi.mock('../services/survey.service', () => ({
  submitResponse: submitMock, getMyResponse: getMineMock, getSurveyById: getSurveyMock,
}));

const app = express();
app.use(express.json());
app.post('/surveys/:id/responses', responseController.submit);
app.get('/surveys/:id/responses/my/:respondentId', responseController.getMine);

const storedResponse = {
  id: 'response-1', surveyId: 'survey-1', respondentId: 'device-one-attempt-1',
  answers: { q1: 'secret' }, surveySnapshot: { questions: [{ correctAnswer: 'secret' }] },
  score: 4, totalQuizQuestions: 5, screenedOut: false,
};

describe('public response privacy', () => {
  beforeEach(() => {
    submitMock.mockReset(); getMineMock.mockReset(); getSurveyMock.mockReset();
    submitMock.mockResolvedValue(storedResponse);
    getMineMock.mockResolvedValue(storedResponse);
  });

  it('does not expose scores, answer keys, or raw answers when score display is disabled', async () => {
    getSurveyMock.mockResolvedValue({ showScore: false });
    const submitted = await request(app).post('/surveys/survey-1/responses').send({});
    const reopened = await request(app).get('/surveys/survey-1/responses/my/device-one-attempt-1');
    for (const response of [submitted, reopened]) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: 'response-1', surveyId: 'survey-1', screenedOut: false });
    }
  });

  it('returns scores when enabled, while still hiding sensitive fields', async () => {
    getSurveyMock.mockResolvedValue({ showScore: true });
    const response = await request(app).post('/surveys/survey-1/responses').send({});
    expect(response.body).toEqual({
      id: 'response-1', surveyId: 'survey-1', screenedOut: false, score: 4, totalQuizQuestions: 5,
    });
  });

  it('fails closed if the survey disappears before the response is returned', async () => {
    getSurveyMock.mockResolvedValue(null);
    const response = await request(app).get('/surveys/survey-1/responses/my/device-one-attempt-1');
    expect(response.body).not.toHaveProperty('score');
  });
});
