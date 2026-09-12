/**
 * Response Controller — handlers for survey response operations.
 */
import type { Request, Response, NextFunction } from 'express';
import * as surveyService from '../services/survey.service';

export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await surveyService.submitResponse(req.params.id, req.body);
    if (result === null) return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    res.json(result);
  } catch (err) { next(err); }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const responses = await surveyService.getResponses(req.params.id);
    res.json(responses);
  } catch (err) { next(err); }
}

export async function getMine(req: Request, res: Response, next: NextFunction) {
  try {
    const response = await surveyService.getMyResponse(req.params.id, req.params.respondentId);
    res.json(response);
  } catch (err) { next(err); }
}

export async function reset(req: Request, res: Response, next: NextFunction) {
  try {
    const count = await surveyService.resetResponses(req.params.id);
    if (count === -1) return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    res.json({ success: true, deletedCount: count });
  } catch (err) { next(err); }
}
