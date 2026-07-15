/**
 * Chat Routes
 * POST /api/chat — AI chatbot endpoint
 */

import { Router } from 'express';
import { chatWithContext } from '../services/gemini.service';

const router = Router();

router.post('/chat', async (req, res) => {
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
