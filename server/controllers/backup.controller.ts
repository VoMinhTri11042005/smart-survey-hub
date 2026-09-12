/**
 * Backup Controller — handlers for backup/restore operations.
 */
import type { Request, Response, NextFunction } from 'express';
import * as surveyService from '../services/survey.service';

export async function exportData(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await surveyService.exportBackup();
    res.json(data);
  } catch (err) { next(err); }
}

export async function importData(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await surveyService.importBackup(req.body);
    res.json({ success: true, imported: result });
  } catch (err) { next(err); }
}
