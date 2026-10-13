/**
 * Response Controller — handlers for survey response operations.
 */
import type { Request, Response, NextFunction } from 'express';
import * as surveyService from '../services/survey.service';

// A response snapshot may contain the quiz answer key that was active at
// submission time. The full answer set can also contain direct identifiers.
// Administrators need both for historical analysis; a public participant only
// needs completion/screen-out/score state to reopen their result page.
function toPublicResponse(response: Record<string, unknown>) {
  const {
    surveySnapshot: _surveySnapshot,
    answers: _answers,
    respondentId: _respondentId,
    ...safeResponse
  } = response;
  return safeResponse;
}

export async function submit(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const result = await surveyService.submitResponse(req.params.id, req.body);
    if (result === null) return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    res.json(toPublicResponse(result));
  } catch (err) { next(err); }
}

export async function importBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await surveyService.importResponses(req.body);
    if (result === null) return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (err) { next(err); }
}

export async function list(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const responses = await surveyService.getResponses(req.params.id);
    res.json(responses);
  } catch (err) { next(err); }
}

export async function getMine(req: Request<{ id: string; respondentId: string }>, res: Response, next: NextFunction) {
  try {
    const response = await surveyService.getMyResponse(req.params.id, req.params.respondentId);
    res.json(response ? toPublicResponse(response) : null);
  } catch (err) { next(err); }
}

export async function reset(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const count = await surveyService.resetResponses(req.params.id);
    if (count === -1) return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    res.json({ success: true, deletedCount: count });
  } catch (err) { next(err); }
}
