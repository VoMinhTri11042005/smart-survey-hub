/**
 * Survey Routes
 * CRUD operations cho surveys và responses.
 */

import { Router } from 'express';
import { surveys, responses, generateId } from '../store';
import type { StoredSurvey, StoredResponse } from '../store';

const router = Router();

// ─── Create Survey ───
router.post('/surveys', (req, res) => {
  const survey: StoredSurvey = {
    id: req.body.id || generateId(),
    title: req.body.title,
    description: req.body.description,
    questions: req.body.questions,
    createdAt: new Date().toISOString(),
    status: req.body.status || 'live',
  };
  surveys.set(survey.id, survey);
  responses.set(survey.id, []);
  res.json(survey);
});

// ─── List Surveys ───
router.get('/surveys', (_req, res) => {
  const allSurveys = Array.from(surveys.values()).map(s => ({
    ...s,
    responseCount: (responses.get(s.id) || []).length,
  }));
  res.json(allSurveys);
});

// ─── Get Survey by ID ───
router.get('/surveys/:id', (req, res) => {
  const survey = surveys.get(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
  }
  res.json({
    ...survey,
    responseCount: (responses.get(survey.id) || []).length,
  });
});

// ─── Delete Survey ───
router.delete('/surveys/:id', (req, res) => {
  if (!surveys.has(req.params.id)) {
    return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
  }
  surveys.delete(req.params.id);
  responses.delete(req.params.id);
  res.json({ success: true });
});

// ─── Submit Response ───
router.post('/surveys/:id/responses', (req, res) => {
  const survey = surveys.get(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
  }

  const newResponse: StoredResponse = {
    id: generateId(),
    surveyId: req.params.id,
    answers: req.body.answers,
    submittedAt: new Date().toISOString(),
  };

  const surveyResponses = responses.get(req.params.id) || [];
  surveyResponses.push(newResponse);
  responses.set(req.params.id, surveyResponses);

  res.json(newResponse);
});

// ─── Get Responses ───
router.get('/surveys/:id/responses', (req, res) => {
  const survey = surveys.get(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
  }
  res.json(responses.get(req.params.id) || []);
});

export default router;
