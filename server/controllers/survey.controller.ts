/**
 * Survey Controller — thin handlers that delegate to the service layer.
 */
import type { Request, Response, NextFunction } from 'express';
import * as surveyService from '../services/survey.service';

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const survey = await surveyService.createSurvey(req.body);
    res.status(201).json(survey);
  } catch (err) { next(err); }
}

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    const surveys = await surveyService.listSurveys();
    res.json(surveys);
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const survey = await surveyService.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    res.json(survey);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const survey = await surveyService.updateSurvey(req.params.id, req.body);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    res.json(survey);
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const deleted = await surveyService.deleteSurvey(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    res.json({ success: true });
  } catch (err) { next(err); }
}
