/**
 * Survey Service — all database/business logic for surveys, responses, drafts, and backups.
 * Extracted from survey.routes.ts for clean separation of concerns.
 */
import pool from '../db';
import { createHash, randomUUID } from 'node:crypto';
import { generateId } from '../utils/helpers';
import { isIntegerStarRating } from '../../shared/starRating';
import { findInvalidRankingSources, getRankingOptions, isCompleteRanking, isRankingApplicable } from '../../shared/ranking';

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
    surveyRevision: 'initial',
    createdAt: new Date().toISOString(),
    status: 'live'
  }
};
const inMemoryResponses: Record<string, any[]> = {};

// ─── Helpers ───

const roundQuizScore = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function toOptionalPositiveInteger(value: unknown, maximum: number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

function valueWhenProvided<T>(data: Record<string, unknown>, key: string, currentValue: T): T {
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] as T : currentValue;
}

export function mapRowToSurvey(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    thankYouMessage: row.thank_you_message ?? '',
    questions: row.questions,
    sections: row.sections || [],
    createdAt: row.created_at,
    status: row.status,
    surveyRevision: row.survey_revision || 'initial',
    closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
    isQuiz: row.is_quiz || false,
    displayMode: row.display_mode || 'single',
    showScore: row.show_score !== false,
    maxAttemptsPerDevice: toOptionalPositiveInteger(row.max_attempts_per_device, 100),
    timeLimitMinutes: toOptionalPositiveInteger(row.time_limit_minutes, 1_440),
    responseCount: row.responseCount !== undefined ? parseInt(row.responseCount, 10) : undefined,
  };
}

function parseSurveySnapshot(value: unknown) {
  // PostgreSQL JSONB is normally decoded by node-postgres.  A backup created
  // by an older tool can still contain JSON serialized one extra time, so do
  // not let one malformed historic value break analytics for the whole survey.
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return Array.isArray((parsed as { questions?: unknown }).questions) ? parsed : null;
}

export function mapRowToResponse(row: any) {
  return {
    id: row.id,
    surveyId: row.survey_id,
    respondentId: row.respondent_id,
    answers: row.answers,
    score: row.score !== null && row.score !== undefined ? roundQuizScore(parseFloat(row.score)) : null,
    totalQuizQuestions: row.total_quiz_questions !== null && row.total_quiz_questions !== undefined ? roundQuizScore(parseFloat(row.total_quiz_questions)) : null,
    submittedAt: row.submitted_at,
    screenedOut: Boolean(row.screened_out),
    // Legacy rows intentionally remain null. This distinguishes them from
    // responses whose question wording/options were captured at submit time.
    surveySnapshot: parseSurveySnapshot(row.survey_snapshot),
  };
}

/**
 * Preserve the exact instrument used for a response. Surveys may be edited
 * after publication, so analytics must not reinterpret an old answer through
 * a newer question/options/answer-key definition.
 */
function createSurveySnapshot(questions: unknown, isQuiz: unknown) {
  const questionSnapshot = Array.isArray(questions)
    ? JSON.parse(JSON.stringify(questions))
    : [];
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    isQuiz: Boolean(isQuiz),
    questions: questionSnapshot,
  };
}

function assertSurveyRevision(received: string | undefined, current: string | undefined) {
  if (received && received !== (current || 'initial')) {
    throw Object.assign(new Error('Khảo sát đã thay đổi trong khi bạn đang trả lời. Vui lòng tải lại trang và kiểm tra câu trả lời.'), { status: 409 });
  }
}

export function computeServerQuizScore(questions: any[], answers: Record<string, any>) {
  let score = 0;
  let totalPossible = 0;
  for (const q of questions || []) {
    if (q.type === 'single_choice' || q.type === 'dropdown') {
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
  return { score: roundQuizScore(score), totalPossible: roundQuizScore(totalPossible) };
}

/**
 * Imported responses do not pass through the normal submission path, but quiz
 * analytics must use the same server-owned answer key and denominator. Keep
 * non-quiz and screened-out responses unscored, exactly as submitResponse does.
 */
export function calculateImportedQuizScore(
  isQuiz: boolean,
  screenedOut: boolean,
  questions: any[],
  answers: Record<string, unknown>,
  recordedScore?: unknown,
  recordedTotal?: unknown,
) {
  if (!isQuiz || screenedOut) {
    return { score: null, totalQuizQuestions: null };
  }
  const computed = computeServerQuizScore(questions, answers);
  if (computed.totalPossible > 0) {
    return { score: computed.score, totalQuizQuestions: computed.totalPossible };
  }
  // Do not invent a 0/0 score for an imported quiz without answer keys. A
  // validated historical score is a better representation and keeps reports
  // from losing the result recorded by the original questionnaire.
  const score = Number(recordedScore);
  const total = Number(recordedTotal);
  if (Number.isFinite(score) && Number.isFinite(total) && total > 0 && score >= 0 && score <= total) {
    return { score: roundQuizScore(score), totalQuizQuestions: roundQuizScore(total) };
  }
  return { score: null, totalQuizQuestions: null };
}

/**
 * updateSurvey accepts PATCH payloads, so field-level validation alone cannot
 * see a section removed in one request while its questions are retained from
 * the stored survey. Validate the merged structure before persisting it.
 */
export function assertMergedSurveyStructure(questions: unknown, sections: unknown) {
  if (!Array.isArray(questions) || !Array.isArray(sections)) {
    throw Object.assign(new Error('Cấu trúc câu hỏi hoặc phần khảo sát không hợp lệ.'), { status: 400 });
  }

  const sectionIds = new Set(
    sections
      .map(section => section && typeof section === 'object' ? (section as { id?: unknown }).id : undefined)
      .filter((id): id is string => typeof id === 'string'),
  );
  for (const question of questions) {
    if (!question || typeof question !== 'object') {
      throw Object.assign(new Error('Cấu trúc câu hỏi khảo sát không hợp lệ.'), { status: 400 });
    }
    const sectionId = (question as { sectionId?: unknown }).sectionId;
    if (typeof sectionId === 'string' && sectionId.length > 0 && !sectionIds.has(sectionId)) {
      throw Object.assign(new Error('Câu hỏi đang tham chiếu đến phần không tồn tại.'), { status: 400 });
    }
  }
  if (findInvalidRankingSources(questions as any[], sections as { id: string }[]).length > 0) {
    throw Object.assign(new Error('Nguồn của câu xếp hạng phải là câu nhiều lựa chọn xuất hiện trước.'), { status: 400 });
  }
}

function assertIntegerStarRatings(questions: any[], answers: Record<string, unknown> | undefined) {
  for (const question of questions || []) {
    if (question.type !== 'star_rating') continue;
    const answer = answers?.[question.id];
    if (answer === undefined || answer === null || answer === '') continue;
    if (!isIntegerStarRating(answer)) {
      throw Object.assign(new Error('Thang điểm sao chỉ nhận các mức nguyên từ 1 đến 5.'), { status: 400 });
    }
  }
}

function assertMultipleChoiceLimits(questions: any[], answers: Record<string, unknown> | undefined) {
  for (const question of questions || []) {
    if (question.type !== 'multiple_choice') continue;
    const answer = answers?.[question.id];
    if (answer === undefined || answer === null) continue;
    if (!Array.isArray(answer) || answer.some(value => typeof value !== 'string')) {
      throw Object.assign(new Error(`Câu hỏi "${question.text}" cần có danh sách đáp án.`), { status: 400 });
    }
    if (new Set(answer).size !== answer.length || answer.some(value => question.options && !question.options.includes(value))) {
      throw Object.assign(new Error(`Câu trả lời của "${question.text}" chứa lựa chọn không hợp lệ.`), { status: 400 });
    }
    if (question.maxSelections && answer.length > question.maxSelections) {
      throw Object.assign(new Error(`Câu hỏi "${question.text}" chỉ được chọn tối đa ${question.maxSelections} đáp án.`), { status: 400 });
    }
  }
}

function assertRequiredAnswers(questions: any[], answers: Record<string, unknown> | undefined) {
  const questionIds = new Set((questions || []).map(question => question.id));
  if (Object.keys(answers || {}).some(id => !questionIds.has(id))) {
    throw Object.assign(new Error('Câu trả lời chứa câu hỏi không tồn tại.'), { status: 400 });
  }
  for (const question of questions || []) {
    const answer = answers?.[question.id];
    const empty = answer === undefined
      || answer === null
      || (typeof answer === 'string' && answer.trim() === '')
      || (Array.isArray(answer) && answer.length === 0)
      || (typeof answer === 'object' && !Array.isArray(answer) && Object.keys(answer).length === 0);
    const hiddenRanking = question.type === 'ranking' && !isRankingApplicable(question, questions, answers || {});
    if (question.required !== false && empty && !hiddenRanking) {
      throw Object.assign(new Error(`Vui lòng trả lời câu hỏi "${question.text}".`), { status: 400 });
    }
    if (empty) continue;
    if (question.required !== false && (question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid')) {
      const gridAnswers = answer as Record<string, unknown>;
      const hasEveryRow = (question.options || []).every((row: string) => {
        const rowAnswer = gridAnswers[row];
        return question.type === 'checkbox_grid'
          ? Array.isArray(rowAnswer) && rowAnswer.length > 0
          : typeof rowAnswer === 'string' && rowAnswer.length > 0;
      });
      if (!hasEveryRow) {
        throw Object.assign(new Error(`Vui lòng trả lời đầy đủ các hàng của câu hỏi "${question.text}".`), { status: 400 });
      }
    }
    if (question.type === 'text' && typeof answer !== 'string') {
      throw Object.assign(new Error(`Câu hỏi "${question.text}" chỉ nhận câu trả lời dạng văn bản.`), { status: 400 });
    }
    if ((question.type === 'single_choice' || question.type === 'dropdown')
      && (typeof answer !== 'string' || !question.options?.includes(answer))) {
      throw Object.assign(new Error(`Câu trả lời không khớp lựa chọn của câu hỏi "${question.text}".`), { status: 400 });
    }
    if (question.type === 'nps' && (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer > 10)) {
      throw Object.assign(new Error(`Câu trả lời của "${question.text}" phải là số nguyên từ 0 đến 10.`), { status: 400 });
    }
    if (question.type === 'star_rating' && !isIntegerStarRating(answer)) {
      throw Object.assign(new Error('Đánh giá sao chỉ nhận các mức nguyên từ 1 đến 5.'), { status: 400 });
    }
    if (question.type === 'single_choice' && answer === question.screenOutAnswer) break;
  }
}

function assertRankingAnswers(questions: any[], answers: Record<string, unknown> | undefined) {
  for (const question of questions || []) {
    if (question.type !== 'ranking') continue;
    const answer = answers?.[question.id];
    if (answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0)) continue;
    const options = getRankingOptions(question, questions, answers || {});
    if (!options.length || !isCompleteRanking(options, answer)) {
      throw Object.assign(new Error(`Câu xếp hạng "${question.text}" phải sắp xếp mỗi lựa chọn được phép đúng một lần.`), { status: 400 });
    }
  }
}

function assertAdditionalQuestionAnswers(questions: any[], answers: Record<string, unknown> | undefined) {
  for (const question of questions || []) {
    const answer = answers?.[question.id];
    if (answer === undefined || answer === null || answer === '') continue;
    const options: string[] = question.options || [];

    if (question.type === 'dropdown' && (typeof answer !== 'string' || !options.includes(answer))) {
      throw Object.assign(new Error(`Câu trả lời không khớp lựa chọn của câu hỏi "${question.text}".`), { status: 400 });
    }
    if (question.type === 'date') {
      const date = typeof answer === 'string' ? new Date(`${answer}T00:00:00.000Z`) : null;
      if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== answer) {
        throw Object.assign(new Error(`Câu hỏi "${question.text}" cần ngày hợp lệ theo định dạng YYYY-MM-DD.`), { status: 400 });
      }
    }
    if (question.type === 'linear_scale' && (
      typeof answer !== 'number'
      || !Number.isInteger(answer)
      || answer < (question.scaleMin ?? 1)
      || answer > (question.scaleMax ?? 5)
    )) {
      throw Object.assign(new Error(`Câu trả lời của "${question.text}" nằm ngoài thang điểm đã cấu hình.`), { status: 400 });
    }
    if (question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid') {
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
        throw Object.assign(new Error(`Câu hỏi lưới "${question.text}" cần câu trả lời theo từng hàng.`), { status: 400 });
      }
      const gridAnswers = answer as Record<string, unknown>;
      const rows: string[] = options;
      const columns: string[] = question.gridColumns || [];
      if (Object.keys(gridAnswers).some(row => !rows.includes(row))) {
        throw Object.assign(new Error(`Câu trả lời của "${question.text}" chứa hàng không tồn tại.`), { status: 400 });
      }
      for (const [row, value] of Object.entries(gridAnswers)) {
        const isValidSelection = (selection: unknown) => typeof selection === 'string' && columns.includes(selection);
        const valid = question.type === 'checkbox_grid'
          ? Array.isArray(value) && new Set(value).size === value.length && value.every(isValidSelection)
          : isValidSelection(value);
        if (!valid) {
          throw Object.assign(new Error(`Câu trả lời cho hàng "${row}" không khớp cột của câu hỏi "${question.text}".`), { status: 400 });
        }
      }
    }
  }
}

function isScreenedOut(questions: any[], answers: Record<string, unknown> | undefined) {
  return (questions || []).some(question =>
    question.type === 'single_choice'
    && typeof question.screenOutAnswer === 'string'
    && answers?.[question.id] === question.screenOutAnswer
  );
}

export function getRespondentDeviceId(respondentId: unknown): string {
  if (typeof respondentId !== 'string') {
    throw Object.assign(new Error('Thiếu định danh thiết bị hợp lệ.'), { status: 400 });
  }
  const match = respondentId.match(/^(device-[a-z0-9-]+)-attempt-[1-9]\d*$/i);
  if (!match) {
    throw Object.assign(new Error('Định danh lượt làm khảo sát không hợp lệ.'), { status: 400 });
  }
  return match[1];
}

export function assertResponseAttemptAllowed(
  maxAttempts: number | null | undefined,
  previousAttempts: number,
  isExistingAttempt: boolean,
) {
  if (!isExistingAttempt && maxAttempts && maxAttempts > 0 && previousAttempts >= maxAttempts) {
    throw Object.assign(
      new Error(`Bạn đã sử dụng hết ${maxAttempts} lượt làm khảo sát trên thiết bị này.`),
      { status: 429 },
    );
  }
}

export function validateResponseAnswers(questions: any[], answers: Record<string, unknown>) {
  assertRequiredAnswers(questions, answers);
  assertIntegerStarRatings(questions, answers);
  assertMultipleChoiceLimits(questions, answers);
  assertRankingAnswers(questions, answers);
  assertAdditionalQuestionAnswers(questions, answers);
}

// ─── Survey CRUD ───

export async function createSurvey(data: any) {
  const id = data.id || generateId();
  const { title, description, thankYouMessage, questions, sections, status, isQuiz, displayMode, showScore, closesAt, maxAttemptsPerDevice, timeLimitMinutes } = data;
  const maxAttempts = toOptionalPositiveInteger(maxAttemptsPerDevice, 100);
  const timeLimit = toOptionalPositiveInteger(timeLimitMinutes, 1_440);

  if (!process.env.DATABASE_URL) {
    const survey = {
      id, title: title || 'Untitled survey', description: description || '', thankYouMessage: thankYouMessage ?? '',
      questions: questions || [], sections: sections || [], createdAt: new Date().toISOString(),
      status: status || 'live', closesAt: closesAt || null,
      surveyRevision: 'initial',
      isQuiz: Boolean(isQuiz), displayMode: displayMode || 'single',
      showScore: showScore !== false, maxAttemptsPerDevice: maxAttempts, timeLimitMinutes: timeLimit,
    };
    inMemorySurveys[id] = survey;
    return survey;
  }

  const result = await pool.query(
    `INSERT INTO surveys (id, title, description, questions, sections, is_quiz, display_mode, show_score, closes_at, max_attempts_per_device, time_limit_minutes, status, thank_you_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [id, title, description, JSON.stringify(questions), JSON.stringify(sections || []), Boolean(isQuiz), displayMode || 'single', showScore !== false, closesAt ? new Date(closesAt).toISOString() : null, maxAttempts, timeLimit, status || 'live', thankYouMessage ?? null]
  );
  return mapRowToSurvey(result.rows[0]);
}

export async function listSurveys() {
  if (!process.env.DATABASE_URL) return Object.values(inMemorySurveys);
  const result = await pool.query(`
    SELECT s.*, (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id AND r.screened_out = FALSE) as "responseCount"
    FROM surveys s ORDER BY s.created_at DESC
  `);
  return result.rows.map(mapRowToSurvey);
}

export async function getSurveyById(id: string) {
  if (!process.env.DATABASE_URL) {
    return inMemorySurveys[id] || null;
  }
  const result = await pool.query(`
    SELECT s.*, (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id AND r.screened_out = FALSE) as "responseCount"
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
      ...existing,
      title: data.title ?? existing.title,
      description: data.description ?? existing.description,
      thankYouMessage: data.thankYouMessage ?? existing.thankYouMessage ?? '',
      questions: data.questions ?? existing.questions,
      sections: data.sections ?? existing.sections ?? [],
      status: data.status ?? existing.status,
      isQuiz: data.isQuiz ?? existing.isQuiz,
      displayMode: data.displayMode ?? existing.displayMode,
      showScore: data.showScore ?? existing.showScore,
      closesAt: valueWhenProvided(data, 'closesAt', existing.closesAt),
      maxAttemptsPerDevice: toOptionalPositiveInteger(valueWhenProvided(data, 'maxAttemptsPerDevice', existing.maxAttemptsPerDevice), 100),
      timeLimitMinutes: toOptionalPositiveInteger(valueWhenProvided(data, 'timeLimitMinutes', existing.timeLimitMinutes), 1_440),
      surveyRevision: randomUUID(),
    };
    if (data.questions !== undefined || data.sections !== undefined) {
      assertMergedSurveyStructure(survey.questions, survey.sections);
    }
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
    thankYouMessage: data.thankYouMessage ?? current.thankYouMessage ?? '',
    questions: data.questions ?? current.questions,
    sections: data.sections ?? current.sections ?? [],
    status: data.status ?? current.status,
    isQuiz: data.isQuiz ?? current.isQuiz,
    displayMode: data.displayMode ?? current.displayMode,
    showScore: data.showScore ?? current.showScore,
    closesAt: valueWhenProvided(data, 'closesAt', current.closesAt),
    maxAttemptsPerDevice: toOptionalPositiveInteger(valueWhenProvided(data, 'maxAttemptsPerDevice', current.maxAttemptsPerDevice), 100),
    timeLimitMinutes: toOptionalPositiveInteger(valueWhenProvided(data, 'timeLimitMinutes', current.timeLimitMinutes), 1_440),
  };
  if (data.questions !== undefined || data.sections !== undefined) {
    assertMergedSurveyStructure(merged.questions, merged.sections);
  }
  const maxAttempts = toOptionalPositiveInteger(merged.maxAttemptsPerDevice, 100);
  const timeLimit = toOptionalPositiveInteger(merged.timeLimitMinutes, 1_440);

  const result = await pool.query(
    `UPDATE surveys SET title = $2, description = $3, questions = $4, sections = $5, is_quiz = $6, display_mode = $7,
     show_score = $8, closes_at = $9, max_attempts_per_device = $10, time_limit_minutes = $11, status = $12, survey_revision = $13, thank_you_message = $14
     WHERE id = $1 RETURNING *`,
    [id, merged.title, merged.description, JSON.stringify(merged.questions), JSON.stringify(merged.sections || []), Boolean(merged.isQuiz), merged.displayMode || 'single', merged.showScore !== false, merged.closesAt ? new Date(merged.closesAt).toISOString() : null, maxAttempts, timeLimit, merged.status || 'live', randomUUID(), merged.thankYouMessage]
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
  const { respondentId, answers, surveyRevision } = data;
  const deviceId = getRespondentDeviceId(respondentId);

  if (!process.env.DATABASE_URL) {
    const survey = inMemorySurveys[surveyId];
    if (!survey) return null;
    if (survey.status !== 'live' || (survey.closesAt && new Date(survey.closesAt).getTime() <= Date.now())) {
      throw Object.assign(new Error('Khảo sát đã đóng hoặc chưa được phát hành.'), { status: 410 });
    }
    assertSurveyRevision(surveyRevision, survey.surveyRevision);
    validateResponseAnswers(survey.questions, answers);
    const screenedOut = isScreenedOut(survey.questions, answers);
    const surveySnapshot = surveyRevision ? createSurveySnapshot(survey.questions, survey.isQuiz) : null;
    let finalScore: number | null = null;
    let finalTotal: number | null = null;
    if (survey?.isQuiz && !screenedOut) {
      const computed = computeServerQuizScore(survey.questions, answers || {});
      finalScore = computed.score; finalTotal = computed.totalPossible;
    }
    inMemoryResponses[surveyId] = inMemoryResponses[surveyId] || [];
    const existing = inMemoryResponses[surveyId].find((r: any) => r.respondentId === respondentId);
    const deviceAttempts = inMemoryResponses[surveyId].filter((response: any) =>
      response.respondentId.startsWith(`${deviceId}-attempt-`),
    ).length;
    assertResponseAttemptAllowed(survey.maxAttemptsPerDevice, deviceAttempts, Boolean(existing));
    if (existing) {
      existing.answers = answers; existing.score = finalScore; existing.screenedOut = screenedOut;
      existing.totalQuizQuestions = finalTotal; existing.submittedAt = new Date().toISOString();
      existing.surveySnapshot = surveySnapshot;
      return existing;
    }
    const id = generateId();
    const obj = { id, surveyId, respondentId, answers, score: finalScore, totalQuizQuestions: finalTotal, submittedAt: new Date().toISOString(), screenedOut, surveySnapshot };
    inMemoryResponses[surveyId].push(obj);
    return obj;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Keep the survey row stable until the response and its snapshot commit.
    // This closes the race between reading the questionnaire and an edit.
    const surveyResult = await client.query('SELECT * FROM surveys WHERE id = $1 FOR SHARE', [surveyId]);
    if (surveyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const survey = surveyResult.rows[0];
    if (survey.status !== 'live' || (survey.closes_at && new Date(survey.closes_at).getTime() <= Date.now())) {
      throw Object.assign(new Error('Khảo sát đã đóng hoặc chưa được phát hành.'), { status: 410 });
    }
    assertSurveyRevision(surveyRevision, survey.survey_revision);
    const questions = typeof survey.questions === 'string' ? JSON.parse(survey.questions) : survey.questions;
    validateResponseAnswers(questions, answers);
    const screenedOut = isScreenedOut(questions, answers);
    // Old clients can still submit, but their version cannot be verified.
    const surveySnapshot = surveyRevision ? createSurveySnapshot(questions, survey.is_quiz) : null;
    let finalScore: number | null = null;
    let finalTotal: number | null = null;
    if (survey.is_quiz && !screenedOut) {
      const computed = computeServerQuizScore(questions, answers || {});
      finalScore = computed.score; finalTotal = computed.totalPossible;
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`response:${surveyId}:${deviceId}`]);
    const existingCheck = await client.query(
      'SELECT id FROM responses WHERE survey_id = $1 AND respondent_id = $2',
      [surveyId, respondentId],
    );
    if (!existingCheck.rows.length && survey.max_attempts_per_device > 0) {
      const attempts = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM responses WHERE survey_id = $1 AND respondent_id LIKE $2',
        [surveyId, `${deviceId}-attempt-%`],
      );
      assertResponseAttemptAllowed(survey.max_attempts_per_device, Number(attempts.rows[0].count), false);
    }

    const result = existingCheck.rows.length
      ? await client.query(
        `UPDATE responses SET answers = $3, score = $4, total_quiz_questions = $5, screened_out = $6, survey_snapshot = $7, submitted_at = CURRENT_TIMESTAMP
         WHERE survey_id = $1 AND respondent_id = $2 RETURNING *`,
        [surveyId, respondentId, JSON.stringify(answers || {}), finalScore, finalTotal, screenedOut, surveySnapshot ? JSON.stringify(surveySnapshot) : null],
      )
      : await client.query(
        `INSERT INTO responses (id, survey_id, respondent_id, answers, score, total_quiz_questions, screened_out, survey_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [generateId(), surveyId, respondentId, JSON.stringify(answers || {}), finalScore, finalTotal, screenedOut, surveySnapshot ? JSON.stringify(surveySnapshot) : null],
      );
    await client.query('COMMIT');
    return mapRowToResponse(result.rows[0]);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back response submission transaction:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// Track exact source files, not answer contents: two respondents may provide
// identical answers, and both must remain in the imported batch. The reserved
// marker is kept in the existing batch table so backups preserve it as well.
export function importSourceMarkerKey(surveyId: string, sourceFileHash: string): string {
  const digest = createHash('sha256').update(canonicalJson([surveyId, sourceFileHash])).digest('hex');
  return `source-sha256:${digest}`;
}

function validateImportedAnswers(questions: any[], answers: Record<string, unknown>) {
  const byId = new Map(questions.map(question => [question.id, question]));
  for (const [questionId, answer] of Object.entries(answers)) {
    const question = byId.get(questionId);
    if (!question) throw Object.assign(new Error(`Câu trả lời tham chiếu câu hỏi không tồn tại: ${questionId}.`), { status: 400 });
    if (question.type === 'text' && typeof answer !== 'string') {
      throw Object.assign(new Error(`Câu hỏi "${question.text}" chỉ nhận câu trả lời dạng văn bản.`), { status: 400 });
    }
    if (question.type === 'star_rating' && !isIntegerStarRating(answer)) {
      throw Object.assign(new Error(`Câu hỏi "${question.text}" chỉ nhận mức sao nguyên từ 1 đến 5.`), { status: 400 });
    }
    if (question.type === 'nps' && (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer > 10)) {
      throw Object.assign(new Error(`Câu hỏi "${question.text}" chỉ nhận điểm NPS nguyên từ 0 đến 10.`), { status: 400 });
    }
    if (question.type === 'single_choice') {
      if (typeof answer !== 'string' || !(question.options || []).includes(answer)) {
        throw Object.assign(new Error(`Câu trả lời không khớp lựa chọn của câu hỏi "${question.text}".`), { status: 400 });
      }
    }
    if (question.type === 'multiple_choice') {
      if (!Array.isArray(answer) || new Set(answer).size !== answer.length || answer.some(item => typeof item !== 'string' || !(question.options || []).includes(item))) {
        throw Object.assign(new Error(`Câu trả lời không khớp lựa chọn của câu hỏi "${question.text}".`), { status: 400 });
      }
      if (question.maxSelections && answer.length > question.maxSelections) {
        throw Object.assign(new Error(`Câu hỏi "${question.text}" chỉ được chọn tối đa ${question.maxSelections} đáp án.`), { status: 400 });
      }
    }
    if (question.type === 'dropdown' && (typeof answer !== 'string' || !(question.options || []).includes(answer))) {
      throw Object.assign(new Error(`Câu trả lời không khớp lựa chọn của câu hỏi "${question.text}".`), { status: 400 });
    }
    if (question.type === 'date') {
      const date = typeof answer === 'string' ? new Date(`${answer}T00:00:00.000Z`) : null;
      if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== answer) {
        throw Object.assign(new Error(`Câu hỏi "${question.text}" cần ngày hợp lệ theo định dạng YYYY-MM-DD.`), { status: 400 });
      }
    }
    if (question.type === 'linear_scale' && (
      typeof answer !== 'number'
      || !Number.isInteger(answer)
      || answer < (question.scaleMin ?? 1)
      || answer > (question.scaleMax ?? 5)
    )) {
      throw Object.assign(new Error(`Câu trả lời của "${question.text}" nằm ngoài thang điểm đã cấu hình.`), { status: 400 });
    }
    if (question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid') {
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
        throw Object.assign(new Error(`Câu hỏi lưới "${question.text}" cần câu trả lời theo từng hàng.`), { status: 400 });
      }
      const gridAnswers = answer as Record<string, unknown>;
      const rows: string[] = question.options || [];
      const columns: string[] = question.gridColumns || [];
      if (Object.keys(gridAnswers).some(row => !rows.includes(row))) {
        throw Object.assign(new Error(`Câu trả lời của "${question.text}" chứa hàng không tồn tại.`), { status: 400 });
      }
      for (const [row, value] of Object.entries(gridAnswers)) {
        const isValidSelection = (selection: unknown) => typeof selection === 'string' && columns.includes(selection);
        const valid = question.type === 'checkbox_grid'
          ? Array.isArray(value) && new Set(value).size === value.length && value.every(isValidSelection)
          : isValidSelection(value);
        if (!valid) {
          throw Object.assign(new Error(`Câu trả lời cho hàng "${row}" không khớp cột của câu hỏi "${question.text}".`), { status: 400 });
        }
      }
    }
  }
  assertRankingAnswers(questions, answers);
}

export async function importResponses(data: any) {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error('Cần kết nối cơ sở dữ liệu để nhập dữ liệu an toàn.'), { status: 503 });
  }

  const client = await pool.connect();
  const requestHash = createHash('sha256').update(canonicalJson({
    mode: data.mode,
    surveyId: data.surveyId || null,
    newSurvey: data.newSurvey || null,
    responses: data.responses,
    ...(data.sourceFileHash ? {
      sourceFileHash: data.sourceFileHash,
      allowDuplicateFile: Boolean(data.allowDuplicateFile),
    } : {}),
  })).digest('hex');

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [data.idempotencyKey]);
    const previousBatch = await client.query(
      'SELECT request_hash, survey_id, imported_count, skipped_count FROM survey_import_batches WHERE idempotency_key = $1',
      [data.idempotencyKey],
    );
    if (previousBatch.rows.length) {
      const previous = previousBatch.rows[0];
      if (previous.request_hash !== requestHash) {
        throw Object.assign(new Error('Mã nhập này đã được dùng cho một nội dung khác. Hãy tải lại file để tạo lượt nhập mới.'), { status: 409 });
      }
      await client.query('COMMIT');
      return {
        surveyId: previous.survey_id,
        imported: previous.imported_count,
        skipped: previous.skipped_count,
        replayed: true,
      };
    }

    let surveyId = data.surveyId;
    let sourceMarker = data.sourceFileHash && data.mode === 'existing'
      ? importSourceMarkerKey(surveyId, data.sourceFileHash)
      : null;
    if (sourceMarker) {
      // Use a separate advisory-lock namespace from request-key locks so two
      // different requests for the same file cannot both pass this check.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['survey-import-source', sourceMarker]);
      const previousSource = await client.query(
        'SELECT idempotency_key FROM survey_import_batches WHERE idempotency_key = $1',
        [sourceMarker],
      );
      if (previousSource.rows.length && !data.allowDuplicateFile) {
        await client.query('COMMIT');
        return { surveyId, imported: 0, skipped: 0, replayed: false, duplicateSource: true };
      }
    }
    let questions = data.newSurvey?.questions;
    let isQuiz = false;
    if (data.mode === 'create') {
      surveyId = generateId();
      const survey = data.newSurvey;
      isQuiz = Boolean(survey.isQuiz);
      await client.query(
        `INSERT INTO surveys (id, title, description, questions, is_quiz, display_mode, show_score, status, thank_you_message)
         VALUES ($1, $2, $3, $4, $5, 'single', TRUE, 'live', $6)`,
        [surveyId, survey.title, survey.description || '', JSON.stringify(survey.questions), isQuiz, survey.thankYouMessage ?? null],
      );
      if (data.sourceFileHash) {
        sourceMarker = importSourceMarkerKey(surveyId, data.sourceFileHash);
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['survey-import-source', sourceMarker]);
      }
    } else {
      const surveyResult = await client.query('SELECT questions, is_quiz FROM surveys WHERE id = $1 FOR SHARE', [surveyId]);
      if (!surveyResult.rows.length) {
        await client.query('ROLLBACK');
        return null;
      }
      questions = typeof surveyResult.rows[0].questions === 'string'
        ? JSON.parse(surveyResult.rows[0].questions)
        : surveyResult.rows[0].questions;
      isQuiz = Boolean(surveyResult.rows[0].is_quiz);
    }

    let imported = 0;
    let skipped = 0;
    for (const [index, response] of data.responses.entries()) {
      if (Object.keys(response.answers || {}).length === 0) {
        skipped++;
        continue;
      }
      validateImportedAnswers(questions, response.answers);
      const respondentId = `import-${createHash('sha256')
        .update(`${data.idempotencyKey}:${index}`)
        .digest('hex')}`;
      const screenedOut = isScreenedOut(questions, response.answers);
      const surveySnapshot = createSurveySnapshot(questions, isQuiz);
      const quizScore = calculateImportedQuizScore(
        isQuiz,
        screenedOut,
        questions,
        response.answers,
        response.score,
        response.totalQuizQuestions,
      );
      const inserted = await client.query(
        `INSERT INTO responses (id, survey_id, respondent_id, answers, score, total_quiz_questions, submitted_at, screened_out, survey_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, CURRENT_TIMESTAMP), $8, $9)
         RETURNING id`,
        [generateId(), surveyId, respondentId, JSON.stringify(response.answers), quizScore.score, quizScore.totalQuizQuestions, response.submittedAt || null, screenedOut, JSON.stringify(surveySnapshot)],
      );
      if (inserted.rowCount) imported++;
    }

    await client.query(
      `INSERT INTO survey_import_batches (idempotency_key, request_hash, survey_id, imported_count, skipped_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [data.idempotencyKey, requestHash, surveyId, imported, skipped],
    );
    if (sourceMarker) {
      await client.query(
        `INSERT INTO survey_import_batches (idempotency_key, request_hash, survey_id, imported_count, skipped_count)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
        [sourceMarker, requestHash, surveyId, imported, skipped],
      );
    }
    await client.query('COMMIT');
    return { surveyId, imported, skipped, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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
    id: row.id, title: row.title, description: row.description, thankYouMessage: row.thank_you_message ?? '',
    questions: row.questions || [], isQuiz: Boolean(row.is_quiz),
    sections: row.sections || [],
    showScore: row.show_score !== false, displayMode: row.display_mode || 'single',
    closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
    maxAttemptsPerDevice: toOptionalPositiveInteger(row.max_attempts_per_device, 100),
    timeLimitMinutes: toOptionalPositiveInteger(row.time_limit_minutes, 1_440),
    updatedAt: row.updated_at,
  }));
}

export async function saveDraft(data: any) {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('Database not configured'), { status: 503 });
  const { id, title, description, thankYouMessage, questions, sections, isQuiz, showScore, displayMode, closesAt, maxAttemptsPerDevice, timeLimitMinutes } = data;
  const draftId = id || generateId();
  const maxAttempts = toOptionalPositiveInteger(maxAttemptsPerDevice, 100);
  const timeLimit = toOptionalPositiveInteger(timeLimitMinutes, 1_440);

  const result = await pool.query(
    `INSERT INTO survey_drafts (id, user_id, title, description, questions, sections, is_quiz, show_score, display_mode, closes_at, max_attempts_per_device, time_limit_minutes, thank_you_message, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
     ON CONFLICT (id)
     DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, questions = EXCLUDED.questions, sections = EXCLUDED.sections, is_quiz = EXCLUDED.is_quiz, show_score = EXCLUDED.show_score, display_mode = EXCLUDED.display_mode, closes_at = EXCLUDED.closes_at, max_attempts_per_device = EXCLUDED.max_attempts_per_device, time_limit_minutes = EXCLUDED.time_limit_minutes, thank_you_message = COALESCE(EXCLUDED.thank_you_message, survey_drafts.thank_you_message), updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [draftId, 'admin', title || 'Khảo sát nháp', description || '', JSON.stringify(questions || []), JSON.stringify(sections || []), Boolean(isQuiz), showScore !== false, displayMode || 'single', closesAt ? new Date(closesAt).toISOString() : null, maxAttempts, timeLimit, thankYouMessage ?? null]
  );
  const row = result.rows[0];
  return {
    id: row.id, title: row.title, description: row.description, thankYouMessage: row.thank_you_message ?? '',
    questions: row.questions || [], isQuiz: Boolean(row.is_quiz),
    sections: row.sections || [],
    showScore: row.show_score !== false, displayMode: row.display_mode || 'single',
    closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
    maxAttemptsPerDevice: toOptionalPositiveInteger(row.max_attempts_per_device, 100),
    timeLimitMinutes: toOptionalPositiveInteger(row.time_limit_minutes, 1_440),
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
  const [surveys, responses, teams, users, drafts, surveyImportBatches] = await Promise.all([
    pool.query('SELECT * FROM surveys ORDER BY created_at DESC'),
    pool.query('SELECT * FROM responses ORDER BY submitted_at DESC'),
    pool.query('SELECT * FROM teams ORDER BY joined_at DESC'),
    pool.query('SELECT * FROM users ORDER BY created_at DESC'),
    pool.query('SELECT * FROM survey_drafts WHERE user_id = $1 ORDER BY updated_at DESC', ['admin']),
    pool.query('SELECT * FROM survey_import_batches ORDER BY created_at DESC'),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    surveys: surveys.rows,
    responses: responses.rows,
    teams: teams.rows,
    users: users.rows,
    drafts: drafts.rows,
    surveyImportBatches: surveyImportBatches.rows,
  };
}

export async function importBackup(data: any) {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('Database not configured'), { status: 503 });
  const { surveys = [], responses = [], teams = [], users = [], drafts = [], surveyImportBatches = [] } = data ?? {};

  if (![surveys, responses, teams, users, drafts, surveyImportBatches].every(Array.isArray)) {
    throw Object.assign(new Error('Tệp sao lưu không đúng định dạng.'), { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

  for (const row of surveys) {
    await client.query(
      `INSERT INTO surveys (id, title, description, questions, sections, is_quiz, display_mode, show_score, closes_at, max_attempts_per_device, time_limit_minutes, status, created_at, thank_you_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, CURRENT_TIMESTAMP), $14)
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.title, row.description, JSON.stringify(row.questions || []), JSON.stringify(row.sections || []), Boolean(row.is_quiz), row.display_mode || 'single', row.show_score !== false, row.closes_at ? new Date(row.closes_at).toISOString() : null, row.max_attempts_per_device ?? null, row.time_limit_minutes ?? null, row.status || 'live', row.created_at, row.thank_you_message ?? null]
    );
  }
  for (const row of responses) {
    await client.query(
      `INSERT INTO responses (id, survey_id, respondent_id, answers, score, total_quiz_questions, submitted_at, screened_out, survey_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.survey_id, row.respondent_id, JSON.stringify(row.answers || {}), row.score ?? null, row.total_quiz_questions ?? null, row.submitted_at || new Date().toISOString(), Boolean(row.screened_out), row.survey_snapshot ? JSON.stringify(row.survey_snapshot) : null]
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
      `INSERT INTO survey_drafts (id, user_id, title, description, questions, sections, is_quiz, show_score, display_mode, closes_at, max_attempts_per_device, time_limit_minutes, updated_at, thank_you_message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.user_id || 'admin', row.title || 'Khảo sát nháp', row.description || '', JSON.stringify(row.questions || []), JSON.stringify(row.sections || []), Boolean(row.is_quiz), row.show_score !== false, row.display_mode || 'single', row.closes_at ? new Date(row.closes_at).toISOString() : null, row.max_attempts_per_device ?? null, row.time_limit_minutes ?? null, row.updated_at || new Date().toISOString(), row.thank_you_message ?? null]
    );
  }
  for (const batch of surveyImportBatches) {
    await client.query(
      `INSERT INTO survey_import_batches (idempotency_key, request_hash, survey_id, imported_count, skipped_count, created_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_TIMESTAMP))
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [batch.idempotency_key, batch.request_hash, batch.survey_id, batch.imported_count, batch.skipped_count || 0, batch.created_at],
    );
  }
  await client.query('COMMIT');
  return {
    surveys: surveys.length,
    responses: responses.length,
    teams: teams.length,
    users: users.length,
    drafts: drafts.length,
    surveyImportBatches: surveyImportBatches.length,
  };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
