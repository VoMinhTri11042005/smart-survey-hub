/**
 * Survey Service — all database/business logic for surveys, responses, drafts, and backups.
 * Extracted from survey.routes.ts for clean separation of concerns.
 */
import pool from '../db';
import { generateId } from '../utils/helpers';

// ─── In-memory fallback for development without DATABASE_URL ───
const inMemorySurveys: Record<string, any> = {
  test: {
    id: 'test',
    title: 'Bản demo: Khảo sát mẫu',
    description: 'Khảo sát mẫu để thử nghiệm',
    questions: [
      { id: 'q1', type: 'single_choice', text: 'Bạn thích màu nào?', options: ['Đỏ','Xanh','Vàng'], required: true },
      { id: 'q2', type: 'text', text: 'Lý do?', required: false }
    ],
    isQuiz: false,
    displayMode: 'single',
    showScore: true,
    createdAt: new Date().toISOString(),
    status: 'live'
  }
};
const inMemoryResponses: Record<string, any[]> = {};

// ─── Helpers ───

export function mapRowToSurvey(row: any) {
  return {
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
    maxAttemptsPerDevice: row.max_attempts_per_device ?? null,
    timeLimitMinutes: row.time_limit_minutes ?? null,
    responseCount: row.responseCount !== undefined ? parseInt(row.responseCount, 10) : undefined,
  };
}

export function mapRowToResponse(row: any) {
  return {
    id: row.id,
    surveyId: row.survey_id,
    respondentId: row.respondent_id,
    answers: row.answers,
    score: row.score !== null && row.score !== undefined ? parseFloat(row.score) : null,
    totalQuizQuestions: row.total_quiz_questions !== null && row.total_quiz_questions !== undefined ? parseFloat(row.total_quiz_questions) : null,
    submittedAt: row.submitted_at,
  };
}

export function computeServerQuizScore(questions: any[], answers: Record<string, any>) {
  let score = 0;
  let totalPossible = 0;
  for (const q of questions || []) {
    if (q.type === 'single_choice') {
      const hasCorrect = typeof q.correctAnswer === 'string' && q.correctAnswer.trim().length > 0;
      if (hasCorrect) {
        const pts = typeof q.points === 'number' && q.points > 0 ? q.points : 1;
        totalPossible += pts;
        const userAns = answers?.[q.id];
        if (typeof userAns === 'string' && userAns === q.correctAnswer) {
          score += pts;
        }
      }
    } else if (q.type === 'multiple_choice') {
      const hasCorrect = Array.isArray(q.correctAnswer) && q.correctAnswer.length > 0;
      if (hasCorrect) {
        const pts = typeof q.points === 'number' && q.points > 0 ? q.points : 1;
        totalPossible += pts;
        const userAns = answers?.[q.id];
        if (Array.isArray(userAns) && userAns.length === q.correctAnswer.length) {
          const sortedUser = [...userAns].sort();
          const sortedCorrect = [...q.correctAnswer].sort();
          if (sortedUser.every((val: string, idx: number) => val === sortedCorrect[idx])) {
            score += pts;
          }
        }
      }
    }
  }
  return { score, totalPossible };
}

// ─── Survey CRUD ───

export async function createSurvey(data: any) {
  const id = data.id || generateId();
  const { title, description, questions, status, isQuiz, displayMode, showScore, closesAt, maxAttemptsPerDevice, timeLimitMinutes } = data;
  const maxAttempts = Number.isFinite(Number(maxAttemptsPerDevice)) ? Number(maxAttemptsPerDevice) : null;
  const timeLimit = Number.isFinite(Number(timeLimitMinutes)) ? Number(timeLimitMinutes) : null;

  if (!process.env.DATABASE_URL) {
    const survey = {
      id, title: title || 'Untitled survey', description: description || '',
      questions: questions || [], createdAt: new Date().toISOString(),
      status: status || 'live', closesAt: closesAt || null,
      isQuiz: Boolean(isQuiz), displayMode: displayMode || 'single',
      showScore: showScore !== false, maxAttemptsPerDevice: maxAttempts, timeLimitMinutes: timeLimit,
    };
    inMemorySurveys[id] = survey;
    return survey;
  }

  const result = await pool.query(
    `INSERT INTO surveys (id, title, description, questions, is_quiz, display_mode, show_score, closes_at, max_attempts_per_device, time_limit_minutes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [id, title, description, JSON.stringify(questions), Boolean(isQuiz), displayMode || 'single', showScore !== false, closesAt ? new Date(closesAt).toISOString() : null, maxAttempts, timeLimit, status || 'live']
  );
  return mapRowToSurvey(result.rows[0]);
}

export async function listSurveys() {
  if (!process.env.DATABASE_URL) return Object.values(inMemorySurveys);
  const result = await pool.query(`
    SELECT s.*, (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) as "responseCount"
    FROM surveys s ORDER BY s.created_at DESC
  `);
  return result.rows.map(mapRowToSurvey);
}

export async function getSurveyById(id: string) {
  if (!process.env.DATABASE_URL) {
    return inMemorySurveys[id] || null;
  }
  const result = await pool.query(`
    SELECT s.*, (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) as "responseCount"
    FROM surveys s WHERE s.id = $1
  `, [id]);
  if (result.rows.length === 0) return null;
  return mapRowToSurvey(result.rows[0]);
}

export async function updateSurvey(id: string, data: any) {
  if (!process.env.DATABASE_URL) {
    const existing = inMemorySurveys[id];
    if (!existing) return null;
    const survey = {
      ...existing, title: title ?? existing.title, description: description ?? existing.description,
      questions: questions ?? existing.questions, status: status ?? existing.status,
      isQuiz: isQuiz ?? existing.isQuiz, displayMode: displayMode ?? existing.displayMode,
      showScore: showScore ?? existing.showScore, closesAt: closesAt ?? existing.closesAt,
      maxAttemptsPerDevice: maxAttemptsPerDevice ?? existing.maxAttemptsPerDevice,
      timeLimitMinutes: timeLimitMinutes ?? existing.timeLimitMinutes,
    };
    inMemorySurveys[id] = survey;
    return survey;
  }

  // UpdateSchema permits PATCH-style payloads. Read then merge so an omitted
  // field can never replace existing survey data with NULL/default values.
  const currentResult = await pool.query('SELECT * FROM surveys WHERE id = $1', [id]);
  if (currentResult.rows.length === 0) return null;
  const current = mapRowToSurvey(currentResult.rows[0]);
  const merged = {
    title: data.title ?? current.title,
    description: data.description ?? current.description,
    questions: data.questions ?? current.questions,
    status: data.status ?? current.status,
    isQuiz: data.isQuiz ?? current.isQuiz,
    displayMode: data.displayMode ?? current.displayMode,
    showScore: data.showScore ?? current.showScore,
    closesAt: data.closesAt ?? current.closesAt,
    maxAttemptsPerDevice: data.maxAttemptsPerDevice ?? current.maxAttemptsPerDevice,
    timeLimitMinutes: data.timeLimitMinutes ?? current.timeLimitMinutes,
  };
  const maxAttempts = Number.isFinite(Number(merged.maxAttemptsPerDevice)) ? Number(merged.maxAttemptsPerDevice) : null;
  const timeLimit = Number.isFinite(Number(merged.timeLimitMinutes)) ? Number(merged.timeLimitMinutes) : null;

  const result = await pool.query(
    `UPDATE surveys SET title = $2, description = $3, questions = $4, is_quiz = $5, display_mode = $6,
     show_score = $7, closes_at = $8, max_attempts_per_device = $9, time_limit_minutes = $10, status = $11
     WHERE id = $1 RETURNING *`,
    [id, merged.title, merged.description, JSON.stringify(merged.questions), Boolean(merged.isQuiz), merged.displayMode || 'single', merged.showScore !== false, merged.closesAt ? new Date(merged.closesAt).toISOString() : null, maxAttempts, timeLimit, merged.status || 'live']
  );
  if (result.rows.length === 0) return null;
  return mapRowToSurvey(result.rows[0]);
}

export async function deleteSurvey(id: string) {
  if (!process.env.DATABASE_URL) return false;
  const result = await pool.query('DELETE FROM surveys WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}

// ─── Responses ───

export async function submitResponse(surveyId: string, data: any) {
  const { respondentId, answers, score, totalQuizQuestions } = data;

  if (!process.env.DATABASE_URL) {
    const survey = inMemorySurveys[surveyId];
    let finalScore: number | null = null;
    let finalTotal: number | null = null;
    if (survey?.isQuiz) {
      const computed = computeServerQuizScore(survey.questions, answers || {});
      finalScore = computed.score; finalTotal = computed.totalPossible;
    } else if (score !== undefined && score !== null && Number.isFinite(Number(score))) {
      finalScore = Number(score);
      finalTotal = totalQuizQuestions !== undefined && totalQuizQuestions !== null && Number.isFinite(Number(totalQuizQuestions)) ? Number(totalQuizQuestions) : null;
    }
    inMemoryResponses[surveyId] = inMemoryResponses[surveyId] || [];
    const existing = inMemoryResponses[surveyId].find((r: any) => r.respondentId === respondentId);
    if (existing) {
      existing.answers = answers; existing.score = finalScore;
      existing.totalQuizQuestions = finalTotal; existing.submittedAt = new Date().toISOString();
      return existing;
    }
    const id = generateId();
    const obj = { id, surveyId, respondentId, answers, score: finalScore, totalQuizQuestions: finalTotal, submittedAt: new Date().toISOString() };
    inMemoryResponses[surveyId].push(obj);
    return obj;
  }

  // DB path
  const surveyResult = await pool.query('SELECT * FROM surveys WHERE id = $1', [surveyId]);
  if (surveyResult.rows.length === 0) return null; // survey not found

  const survey = surveyResult.rows[0];
  let finalScore: number | null = null;
  let finalTotal: number | null = null;
  if (survey.is_quiz) {
    const questions = typeof survey.questions === 'string' ? JSON.parse(survey.questions) : survey.questions;
    const computed = computeServerQuizScore(questions, answers || {});
    finalScore = computed.score; finalTotal = computed.totalPossible;
  } else if (score !== undefined && score !== null && Number.isFinite(Number(score))) {
    finalScore = Number(score);
    finalTotal = totalQuizQuestions !== undefined && totalQuizQuestions !== null && Number.isFinite(Number(totalQuizQuestions)) ? Number(totalQuizQuestions) : null;
  }

  const existingCheck = await pool.query('SELECT id FROM responses WHERE survey_id = $1 AND respondent_id = $2', [surveyId, respondentId]);
  let row;
  if (existingCheck.rows.length > 0) {
    const result = await pool.query(
      `UPDATE responses SET answers = $3, score = $4, total_quiz_questions = $5, submitted_at = CURRENT_TIMESTAMP
       WHERE survey_id = $1 AND respondent_id = $2 RETURNING *`,
      [surveyId, respondentId, JSON.stringify(answers || {}), finalScore, finalTotal]
    );
    row = result.rows[0];
  } else {
    const id = generateId();
    const result = await pool.query(
      `INSERT INTO responses (id, survey_id, respondent_id, answers, score, total_quiz_questions) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, surveyId, respondentId, JSON.stringify(answers || {}), finalScore, finalTotal]
    );
    row = result.rows[0];
  }
  return mapRowToResponse(row);
}

export async function getResponses(surveyId: string) {
  if (!process.env.DATABASE_URL) return inMemoryResponses[surveyId] || [];
  const result = await pool.query('SELECT * FROM responses WHERE survey_id = $1 ORDER BY submitted_at DESC', [surveyId]);
  return result.rows.map(mapRowToResponse);
}

export async function getMyResponse(surveyId: string, respondentId: string) {
  if (!process.env.DATABASE_URL) {
    const arr = inMemoryResponses[surveyId] || [];
    return arr.find((r: any) => r.respondentId === respondentId) || null;
  }
  const result = await pool.query('SELECT * FROM responses WHERE survey_id = $1 AND respondent_id = $2', [surveyId, respondentId]);
  if (result.rows.length === 0) return null;
  return mapRowToResponse(result.rows[0]);
}

export async function resetResponses(surveyId: string) {
  if (!process.env.DATABASE_URL) return 0;
  const surveyCheck = await pool.query('SELECT id FROM surveys WHERE id = $1', [surveyId]);
  if (surveyCheck.rows.length === 0) return -1; // not found
  const result = await pool.query('DELETE FROM responses WHERE survey_id = $1', [surveyId]);
  return result.rowCount ?? 0;
}

// ─── Drafts ───

export async function getDrafts() {
  if (!process.env.DATABASE_URL) return [];
  const result = await pool.query('SELECT * FROM survey_drafts WHERE user_id = $1 ORDER BY updated_at DESC', ['admin']);
  return result.rows.map(row => ({
    id: row.id, title: row.title, description: row.description,
    questions: row.questions || [], isQuiz: Boolean(row.is_quiz),
    showScore: row.show_score !== false, displayMode: row.display_mode || 'single',
    closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
    maxAttemptsPerDevice: row.max_attempts_per_device ?? null,
    timeLimitMinutes: row.time_limit_minutes ?? null,
    updatedAt: row.updated_at,
  }));
}

export async function saveDraft(data: any) {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('Database not configured'), { status: 503 });
  const { id, title, description, questions, isQuiz, showScore, displayMode, closesAt, maxAttemptsPerDevice, timeLimitMinutes } = data;
  const draftId = id || generateId();
  const maxAttempts = Number.isFinite(Number(maxAttemptsPerDevice)) ? Number(maxAttemptsPerDevice) : null;
  const timeLimit = Number.isFinite(Number(timeLimitMinutes)) ? Number(timeLimitMinutes) : null;

  const result = await pool.query(
    `INSERT INTO survey_drafts (id, user_id, title, description, questions, is_quiz, show_score, display_mode, closes_at, max_attempts_per_device, time_limit_minutes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
     ON CONFLICT (id)
     DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, questions = EXCLUDED.questions, is_quiz = EXCLUDED.is_quiz, show_score = EXCLUDED.show_score, display_mode = EXCLUDED.display_mode, closes_at = EXCLUDED.closes_at, max_attempts_per_device = EXCLUDED.max_attempts_per_device, time_limit_minutes = EXCLUDED.time_limit_minutes, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [draftId, 'admin', title || 'Khảo sát nháp', description || '', JSON.stringify(questions || []), Boolean(isQuiz), showScore !== false, displayMode || 'single', closesAt ? new Date(closesAt).toISOString() : null, maxAttempts, timeLimit]
  );
  const row = result.rows[0];
  return {
    id: row.id, title: row.title, description: row.description,
    questions: row.questions || [], isQuiz: Boolean(row.is_quiz),
    showScore: row.show_score !== false, displayMode: row.display_mode || 'single',
    closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
    maxAttemptsPerDevice: row.max_attempts_per_device ?? null,
    timeLimitMinutes: row.time_limit_minutes ?? null,
    updatedAt: row.updated_at,
  };
}

export async function deleteDraft(id: string) {
  if (!process.env.DATABASE_URL) return false;
  const result = await pool.query('DELETE FROM survey_drafts WHERE id = $1 AND user_id = $2 RETURNING id', [id, 'admin']);
  return result.rows.length > 0;
}

// ─── Backup ───

export async function exportBackup() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('Database not configured'), { status: 503 });
  const [surveys, responses, teams, users, drafts] = await Promise.all([
    pool.query('SELECT * FROM surveys ORDER BY created_at DESC'),
    pool.query('SELECT * FROM responses ORDER BY submitted_at DESC'),
    pool.query('SELECT * FROM teams ORDER BY joined_at DESC'),
    pool.query('SELECT * FROM users ORDER BY created_at DESC'),
    pool.query('SELECT * FROM survey_drafts WHERE user_id = $1 ORDER BY updated_at DESC', ['admin']),
  ]);
  return { exportedAt: new Date().toISOString(), surveys: surveys.rows, responses: responses.rows, teams: teams.rows, users: users.rows, drafts: drafts.rows };
}

export async function importBackup(data: any) {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('Database not configured'), { status: 503 });
  const { surveys = [], responses = [], teams = [], users = [], drafts = [] } = data ?? {};

  if (![surveys, responses, teams, users, drafts].every(Array.isArray)) {
    throw Object.assign(new Error('Tệp sao lưu không đúng định dạng.'), { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

  for (const row of surveys) {
    await client.query(
      `INSERT INTO surveys (id, title, description, questions, is_quiz, display_mode, show_score, closes_at, max_attempts_per_device, time_limit_minutes, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, CURRENT_TIMESTAMP))
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.title, row.description, JSON.stringify(row.questions || []), Boolean(row.is_quiz), row.display_mode || 'single', row.show_score !== false, row.closes_at ? new Date(row.closes_at).toISOString() : null, row.max_attempts_per_device ?? null, row.time_limit_minutes ?? null, row.status || 'live', row.created_at]
    );
  }
  for (const row of responses) {
    await client.query(
      `INSERT INTO responses (id, survey_id, respondent_id, answers, score, total_quiz_questions, submitted_at) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.survey_id, row.respondent_id, JSON.stringify(row.answers || {}), row.score ?? null, row.total_quiz_questions ?? null, row.submitted_at || new Date().toISOString()]
    );
  }
  for (const row of teams) {
    await client.query(
      `INSERT INTO teams (id, name, email, role, joined_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.name, row.email, row.role || 'viewer', row.joined_at || new Date().toISOString()]
    );
  }
  for (const row of users) {
    await client.query(
      `INSERT INTO users (id, name, email, photo_url, tagline, created_at) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.name, row.email, row.photo_url, row.tagline, row.created_at || new Date().toISOString()]
    );
  }
  for (const row of drafts) {
    await client.query(
      `INSERT INTO survey_drafts (id, user_id, title, description, questions, is_quiz, show_score, display_mode, closes_at, max_attempts_per_device, time_limit_minutes, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.user_id || 'admin', row.title || 'Khảo sát nháp', row.description || '', JSON.stringify(row.questions || []), Boolean(row.is_quiz), row.show_score !== false, row.display_mode || 'single', row.closes_at ? new Date(row.closes_at).toISOString() : null, row.max_attempts_per_device ?? null, row.time_limit_minutes ?? null, row.updated_at || new Date().toISOString()]
    );
  }
  await client.query('COMMIT');
  return { surveys: surveys.length, responses: responses.length, teams: teams.length, users: users.length, drafts: drafts.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
