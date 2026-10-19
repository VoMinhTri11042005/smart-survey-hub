/**
 * Chat Routes
 * POST /api/chat — AI chatbot endpoint
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.middleware';
import { createRateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { chatWithContext } from '../services/gemini.service';
import { getSurveyById } from '../services/survey.service';

const router = Router();
const limitPublicChat = createRateLimit({ windowMs: 60_000, maxRequests: 10 });
const PublicChatSchema = z.object({ message: z.string().trim().min(1).max(1000) });

// Never accept arbitrary survey context from an unauthenticated client. The
// public endpoint loads a published survey and passes only question text/type
// to the model, with a per-IP limit to reduce accidental or abusive AI usage.
router.post('/surveys/:id/chat', limitPublicChat, validate(PublicChatSchema), async (req, res, next) => {
  try {
    const survey = await getSurveyById(String(req.params.id));
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    if (survey.status !== 'live' || (survey.closesAt && new Date(survey.closesAt).getTime() <= Date.now())) {
      return res.status(410).json({ error: 'Khảo sát đã đóng hoặc chưa được phát hành.' });
    }

    const questions = (Array.isArray(survey.questions) ? survey.questions : [])
      .slice(0, 100)
      .map((question: any) => ({
        type: String(question.type || '').slice(0, 50),
        text: String(question.text || '').slice(0, 2000),
      }));
    const reply = await chatWithContext(
      req.body.message,
      String(survey.title || '').slice(0, 255),
      String(survey.description || '').slice(0, 5000),
      questions,
    );
    res.json({ reply });
  } catch (error) {
    // Do not return upstream errors or configuration details to public users.
    console.error('Public chat error:', error);
    if (!res.headersSent) res.status(502).json({ error: 'Không thể kết nối với trợ lý AI. Vui lòng thử lại sau.' });
    else next(error);
  }
});

router.post('/chat', requireAdmin, async (req, res) => {
  try {
    const { message, surveyTitle, surveyDescription, questions, currentQuestionIndex } = req.body;

    const reply = await chatWithContext(
      message,
      surveyTitle,
      surveyDescription,
      questions || [],
      currentQuestionIndex
    );

    res.json({ reply });
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ reply: `Xin lỗi, đã xảy ra lỗi: ${error.message || 'Lỗi không xác định'}` });
  }
});

export default router;
