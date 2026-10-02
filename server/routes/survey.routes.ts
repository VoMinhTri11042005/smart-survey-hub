/**
 * Survey Routes — thin route definitions delegating to controllers.
 * All business logic lives in services/survey.service.ts
 */
import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware';
import { limitPublicResponseSubmissions } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { CreateSurveySchema, UpdateSurveySchema, SubmitResponseSchema, SaveDraftSchema, ImportResponsesSchema } from '../validators/survey.validator';
import * as surveyCtrl from '../controllers/survey.controller';
import * as responseCtrl from '../controllers/response.controller';
import * as draftCtrl from '../controllers/draft.controller';
import * as backupCtrl from '../controllers/backup.controller';

const router = Router();

function requireDestructiveConfirmation(action: string) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    if (req.get('X-Confirm-Action') !== action) {
      return res.status(400).json({ error: 'Cần xác nhận thao tác trước khi thay đổi dữ liệu.' });
    }
    next();
  };
}

// Specific draft paths must be registered before /surveys/:id.
router.get('/surveys/drafts', requireAdmin, draftCtrl.list);
router.post('/surveys/drafts', requireAdmin, validate(SaveDraftSchema), draftCtrl.save);
router.delete('/surveys/drafts/:id', requireAdmin, requireDestructiveConfirmation('delete-draft'), draftCtrl.remove);

// Public survey read strips quiz answer keys. Response reads remain admin-only.
router.get('/surveys/:id', surveyCtrl.getPublicById);
router.post('/surveys/:id/responses', limitPublicResponseSubmissions, validate(SubmitResponseSchema), responseCtrl.submit);
router.get('/surveys/:id/responses/my/:respondentId', responseCtrl.getMine);

// ─── Admin management ───
router.post('/surveys', requireAdmin, validate(CreateSurveySchema), surveyCtrl.create);
router.get('/surveys', requireAdmin, surveyCtrl.list);
router.get('/admin/surveys/:id', requireAdmin, surveyCtrl.getById);
router.put('/surveys/:id', requireAdmin, validate(UpdateSurveySchema), surveyCtrl.update);
router.delete('/surveys/:id', requireAdmin, requireDestructiveConfirmation('delete-survey'), surveyCtrl.remove);
router.post('/surveys/import-responses', requireAdmin, validate(ImportResponsesSchema), responseCtrl.importBatch);
router.get('/surveys/:id/responses', requireAdmin, responseCtrl.list);
router.delete('/surveys/:id/responses', requireAdmin, requireDestructiveConfirmation('reset-responses'), responseCtrl.reset);

// ─── Backup ───
router.get('/backup/export', requireAdmin, backupCtrl.exportData);
router.post('/backup/import', requireAdmin, requireDestructiveConfirmation('import-backup'), backupCtrl.importData);

export default router;
