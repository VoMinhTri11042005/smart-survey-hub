/**
 * Upload Routes
 * POST /api/parse-docx — Upload file Word, parse bằng mammoth + Gemini AI
 */

import { Router } from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { parseQuestionsFromText } from '../services/gemini.service';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.match(/\.(docx|doc|txt)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ hỗ trợ file .docx, .doc, .txt'));
    }
  },
});

router.post('/parse-docx', upload.single('file'), async (req, res) => {
  try {
    const topic = req.body.topic || '';
    let extractedText = '';

    if (req.file) {
      if (req.file.originalname.match(/\.txt$/i)) {
        extractedText = req.file.buffer.toString('utf-8');
      } else {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        extractedText = result.value;
      }
    }

    if (!extractedText && !topic) {
      return res.status(400).json({ error: 'Vui lòng upload file hoặc nhập chủ đề khảo sát.' });
    }

    const parsed = await parseQuestionsFromText(extractedText, topic);
    res.json(parsed);
  } catch (error: any) {
    console.error('Parse docx error:', error);
    res.status(500).json({ error: error.message || 'Lỗi server khi xử lý file.' });
  }
});

export default router;
