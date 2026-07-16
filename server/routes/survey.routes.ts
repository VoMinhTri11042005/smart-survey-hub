import { Router } from 'express';
import pool from '../db';

const router = Router();

// generateId helper
function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ─── Create Survey ───
router.post('/surveys', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Database not configured' });
  try {
    const id = req.body.id || generateId();
    const { title, description, questions, status, isQuiz } = req.body;
    
    const result = await pool.query(
      `INSERT INTO surveys (id, title, description, questions, is_quiz, status) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, title, description, JSON.stringify(questions), Boolean(isQuiz), status || 'live']
    );
    
    // PostgreSQL usually returns camelCase if specified or snake_case
    // Map it to frontend expectations
    const row = result.rows[0];
    res.json({
      id: row.id,
      title: row.title,
      description: row.description,
      questions: row.questions,
      createdAt: row.created_at,
      status: row.status
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

// ─── List Surveys ───
router.get('/surveys', async (_req, res) => {
  if (!process.env.DATABASE_URL) return res.json([]);
  try {
    const result = await pool.query(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) as "responseCount"
      FROM surveys s
      ORDER BY s.created_at DESC
    `);
    
    // Convert to expected format
    const surveys = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      questions: row.questions,
      createdAt: row.created_at,
      status: row.status,
      isQuiz: row.is_quiz || false,
      responseCount: parseInt(row.responseCount, 10)
    }));
    res.json(surveys);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch surveys' });
  }
});

// ─── Get Survey by ID ───
router.get('/surveys/:id', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(404).json({ error: 'Database not configured' });
  try {
    const result = await pool.query(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) as "responseCount"
      FROM surveys s
      WHERE s.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    }
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      title: row.title,
      description: row.description,
      questions: row.questions,
      createdAt: row.created_at,
      status: row.status,
      isQuiz: row.is_quiz || false,
      responseCount: parseInt(row.responseCount, 10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch survey' });
  }
});

// ─── Delete Survey ───
router.delete('/surveys/:id', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Database not configured' });
  try {
    const result = await pool.query('DELETE FROM surveys WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete survey' });
  }
});

// ─── Submit Response ───
router.post('/surveys/:id/responses', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Database not configured' });
  try {
    const surveyCheck = await pool.query('SELECT id FROM surveys WHERE id = $1', [req.params.id]);
    if (surveyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy khảo sát.' });
    }

    const { respondentId, answers, score, totalQuizQuestions } = req.body;
    if (!respondentId) {
      return res.status(400).json({ error: 'Thiếu định danh người dùng.' });
    }

    const id = generateId();
    const result = await pool.query(
      `INSERT INTO responses (id, survey_id, respondent_id, answers, score, total_quiz_questions) 
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (survey_id, respondent_id) 
       DO UPDATE SET answers = EXCLUDED.answers, score = EXCLUDED.score, total_quiz_questions = EXCLUDED.total_quiz_questions, submitted_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [id, req.params.id, respondentId, JSON.stringify(answers), score ?? null, totalQuizQuestions ?? null]
    );
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      surveyId: row.survey_id,
      respondentId: row.respondent_id,
      answers: row.answers,
      score: row.score,
      totalQuizQuestions: row.total_quiz_questions,
      submittedAt: row.submitted_at
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

// ─── Get My Response ───
router.get('/surveys/:id/responses/my/:respondentId', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json(null);
  try {
    const result = await pool.query(
      'SELECT * FROM responses WHERE survey_id = $1 AND respondent_id = $2',
      [req.params.id, req.params.respondentId]
    );
    if (result.rows.length === 0) {
      return res.json(null);
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      surveyId: row.survey_id,
      respondentId: row.respondent_id,
      answers: row.answers,
      score: row.score,
      totalQuizQuestions: row.total_quiz_questions,
      submittedAt: row.submitted_at
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch my response' });
  }
});

// ─── Get Responses ───
router.get('/surveys/:id/responses', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json([]);
  try {
    const result = await pool.query('SELECT * FROM responses WHERE survey_id = $1 ORDER BY submitted_at DESC', [req.params.id]);
    const responses = result.rows.map(row => ({
      id: row.id,
      surveyId: row.survey_id,
      answers: row.answers,
      score: row.score,
      totalQuizQuestions: row.total_quiz_questions,
      submittedAt: row.submitted_at
    }));
    res.json(responses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch responses' });
  }
});

export default router;
