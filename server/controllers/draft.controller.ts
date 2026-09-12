/**
 * Draft Controller — handlers for survey draft operations.
 */
import type { Request, Response, NextFunction } from 'express';
import * as surveyService from '../services/survey.service';

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    const drafts = await surveyService.getDrafts();
    res.json(drafts);
  } catch (err) { next(err); }
}

export async function save(req: Request, res: Response, next: NextFunction) {
  try {
    const draft = await surveyService.saveDraft(req.body);
    res.json(draft);
  } catch (err) { next(err); }
}

export async function remove(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const deleted = await surveyService.deleteDraft(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Draft not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
}
