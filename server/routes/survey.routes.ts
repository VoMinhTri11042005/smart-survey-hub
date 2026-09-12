/**
 * Survey Routes — thin route definitions delegating to controllers.
 * All business logic lives in services/survey.service.ts
 */
import { Router } from 'express';
import { validate } from '../middleware/validate';
import { CreateSurveySchema, UpdateSurveySchema, SubmitResponseSchema, SaveDraftSchema } from '../validators/survey.validator';
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

// ─── Surveys CRUD ───
router.post('/surveys', validate(CreateSurveySchema), surveyCtrl.create);
router.get('/surveys', surveyCtrl.list);

// Specific draft paths must be registered before /surveys/:id.
router.get('/surveys/drafts', draftCtrl.list);
router.post('/surveys/drafts', validate(SaveDraftSchema), draftCtrl.save);
router.delete('/surveys/drafts/:id', requireDestructiveConfirmation('delete-draft'), draftCtrl.remove);

// ─── Responses ───
router.post('/surveys/:id/responses', validate(SubmitResponseSchema), responseCtrl.submit);
router.get('/surveys/:id/responses', responseCtrl.list);
router.get('/surveys/:id/responses/my/:respondentId', responseCtrl.getMine);
router.delete('/surveys/:id/responses', requireDestructiveConfirmation('reset-responses'), responseCtrl.reset);

router.get('/surveys/:id', surveyCtrl.getById);
router.put('/surveys/:id', validate(UpdateSurveySchema), surveyCtrl.update);
router.delete('/surveys/:id', requireDestructiveConfirmation('delete-survey'), surveyCtrl.remove);

// ─── Backup ───
router.get('/backup/export', backupCtrl.exportData);
router.post('/backup/import', requireDestructiveConfirmation('import-backup'), backupCtrl.importData);

export default router;
