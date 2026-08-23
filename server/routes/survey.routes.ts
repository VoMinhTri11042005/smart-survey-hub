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
    const { title, description, questions, status, isQuiz, displayMode, showScore, closesAt } = req.body;
    
    const result = await pool.query(
      `INSERT INTO surveys (id, title, description, questions, is_quiz, display_mode, show_score, closes_at, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, title, description, JSON.stringify(questions), Boolean(isQuiz), displayMode || 'single', showScore !== false, closesAt ? new Date(closesAt).toISOString() : null, status || 'live']
    );
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      title: row.title,
      description: row.description,
      questions: row.questions,
      createdAt: row.created_at,
      status: row.status,
      closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
      displayMode: row.display_mode || 'single',
      showScore: row.show_score !== false
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
      closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
      isQuiz: row.is_quiz || false,
      displayMode: row.display_mode || 'single',
      showScore: row.show_score !== false,
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
      closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
      isQuiz: row.is_quiz || false,
      displayMode: row.display_mode || 'single',
      showScore: row.show_score !== false,
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

// ─── Survey Drafts ───
router.get('/surveys/drafts', async (_req, res) => {
  if (!process.env.DATABASE_URL) return res.json([]);

  try {
    const result = await pool.query(
      'SELECT * FROM survey_drafts WHERE user_id = $1 ORDER BY updated_at DESC',
      ['admin']
    );

    const drafts = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      questions: row.questions || [],
      isQuiz: Boolean(row.is_quiz),
      showScore: row.show_score !== false,
      displayMode: row.display_mode || 'single',
      closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
      updatedAt: row.updated_at,
    }));

    res.json(drafts);
  } catch (err) {
    console.error('Failed to fetch drafts:', err);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

router.post('/surveys/drafts', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Database not configured' });

  try {
    const { id, title, description, questions, isQuiz, showScore, displayMode, closesAt } = req.body ?? {};
    const draftId = id || generateId();

    const result = await pool.query(
      `INSERT INTO survey_drafts (id, user_id, title, description, questions, is_quiz, show_score, display_mode, closes_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
       ON CONFLICT (id)
       DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, questions = EXCLUDED.questions, is_quiz = EXCLUDED.is_quiz, show_score = EXCLUDED.show_score, display_mode = EXCLUDED.display_mode, closes_at = EXCLUDED.closes_at, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [draftId, 'admin', title || 'Khảo sát nháp', description || '', JSON.stringify(questions || []), Boolean(isQuiz), showScore !== false, displayMode || 'single', closesAt ? new Date(closesAt).toISOString() : null]
    );

    const row = result.rows[0];
    res.json({
      id: row.id,
      title: row.title,
      description: row.description,
      questions: row.questions || [],
      isQuiz: Boolean(row.is_quiz),
      showScore: row.show_score !== false,
      displayMode: row.display_mode || 'single',
      closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('Failed to save draft:', err);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

router.delete('/surveys/drafts/:id', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Database not configured' });

  try {
    const result = await pool.query('DELETE FROM survey_drafts WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, 'admin']);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete draft:', err);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// ─── Backup and Restore ───
router.get('/backup/export', async (_req, res) => {
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Database not configured' });

  try {
    const [surveys, responses, teams, users, drafts] = await Promise.all([
      pool.query('SELECT * FROM surveys ORDER BY created_at DESC'),
      pool.query('SELECT * FROM responses ORDER BY submitted_at DESC'),
      pool.query('SELECT * FROM teams ORDER BY joined_at DESC'),
      pool.query('SELECT * FROM users ORDER BY created_at DESC'),
      pool.query('SELECT * FROM survey_drafts WHERE user_id = $1 ORDER BY updated_at DESC', ['admin'])
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      surveys: surveys.rows,
      responses: responses.rows,
      teams: teams.rows,
      users: users.rows,
      drafts: drafts.rows,
    });
  } catch (err) {
    console.error('Backup export failed:', err);
    res.status(500).json({ error: 'Backup export failed' });
  }
});

router.post('/backup/import', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Database not configured' });

  try {
    const { surveys = [], responses = [], teams = [], users = [], drafts = [] } = req.body ?? {};

    for (const row of surveys) {
      await pool.query(
        `INSERT INTO surveys (id, title, description, questions, is_quiz, display_mode, show_score, closes_at, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, CURRENT_TIMESTAMP))
         ON CONFLICT (id)
         DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, questions = EXCLUDED.questions, is_quiz = EXCLUDED.is_quiz, display_mode = EXCLUDED.display_mode, show_score = EXCLUDED.show_score, closes_at = EXCLUDED.closes_at, status = EXCLUDED.status, created_at = COALESCE(EXCLUDED.created_at, surveys.created_at)`,
        [row.id, row.title, row.description, JSON.stringify(row.questions || []), Boolean(row.is_quiz), row.display_mode || 'single', row.show_score !== false, row.closes_at ? new Date(row.closes_at).toISOString() : null, row.status || 'live', row.created_at]
      );
    }

    for (const row of responses) {
      await pool.query(
        `INSERT INTO responses (id, survey_id, respondent_id, answers, score, total_quiz_questions, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id)
         DO UPDATE SET survey_id = EXCLUDED.survey_id, respondent_id = EXCLUDED.respondent_id, answers = EXCLUDED.answers, score = EXCLUDED.score, total_quiz_questions = EXCLUDED.total_quiz_questions, submitted_at = EXCLUDED.submitted_at`,
        [row.id, row.survey_id, row.respondent_id, JSON.stringify(row.answers || {}), row.score ?? null, row.total_quiz_questions ?? null, row.submitted_at || new Date().toISOString()]
      );
    }

    for (const row of teams) {
      await pool.query(
        `INSERT INTO teams (id, name, email, role, joined_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id)
         DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role, joined_at = EXCLUDED.joined_at`,
        [row.id, row.name, row.email, row.role || 'viewer', row.joined_at || new Date().toISOString()]
      );
    }

    for (const row of users) {
      await pool.query(
        `INSERT INTO users (id, name, email, photo_url, tagline, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id)
         DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, photo_url = EXCLUDED.photo_url, tagline = EXCLUDED.tagline, created_at = COALESCE(EXCLUDED.created_at, users.created_at)`,
        [row.id, row.name, row.email, row.photo_url, row.tagline, row.created_at || new Date().toISOString()]
      );
    }

    for (const row of drafts) {
      await pool.query(
        `INSERT INTO survey_drafts (id, user_id, title, description, questions, is_quiz, show_score, display_mode, closes_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id)
         DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, questions = EXCLUDED.questions, is_quiz = EXCLUDED.is_quiz, show_score = EXCLUDED.show_score, display_mode = EXCLUDED.display_mode, closes_at = EXCLUDED.closes_at, updated_at = EXCLUDED.updated_at`,
        [row.id, row.user_id || 'admin', row.title || 'Khảo sát nháp', row.description || '', JSON.stringify(row.questions || []), Boolean(row.is_quiz), row.show_score !== false, row.display_mode || 'single', row.closes_at ? new Date(row.closes_at).toISOString() : null, row.updated_at || new Date().toISOString()]
      );
    }

    res.json({ success: true, imported: { surveys: surveys.length, responses: responses.length, teams: teams.length, users: users.length, drafts: drafts.length } });
  } catch (err) {
    console.error('Backup import failed:', err);
    res.status(500).json({ error: 'Backup import failed' });
  }
});

export default router;
