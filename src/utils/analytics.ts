import type { Survey, SurveyResponse } from '../types';
import { stripHtml, cleanHtmlWhitespace } from './stringUtils';
import { parseStoredStarRating } from '../../shared/starRating';
import { allocateExclusivePercents, roundPercent, sanitizeSpreadsheetValue } from './percent';
import { cleanTextAnswer, getTextAnalyticsEligibility, isPersonalIdentifierQuestion, summarizeTextCategories, type TextCategoryOption } from './textAnalytics';

export interface ChoiceDistribution {
  questionId: string;
  questionText: string;
  /** All responses with a non-empty answer for this question. */
  totalAnswered: number;
  /** Answers whose captured question schema matches the current schema. */
  currentVersionAnswered: number;
  /** Answers captured with a different but compatible choice-question schema. */
  historicalVersionAnswered: number;
  /** Answers created before question snapshots were retained. */
  legacyUnversionedAnswered: number;
  /** Answered rows whose old question type is incompatible with the current one. */
  incompatibleVersionAnswered: number;
  options: ChoiceDistributionOption[];
}

/**
 * `id` is deliberately separate from `label`. Survey answers historically use
 * the option text as their value, so duplicate labels cannot be distinguished
 * retrospectively. Keeping a stable id prevents the dashboard from dropping a
 * category while the `isAmbiguous` flag makes that legacy-data limitation clear.
 */
export interface ChoiceDistributionOption {
  id: string;
  label: string;
  count: number;
  percent: number;
  /** The answer no longer exists in the question's current option list. */
  isUnknown?: boolean;
  /** More than one configured option has the same stored label. */
  isAmbiguous?: boolean;
  /** Answer comes from an older schema or a row with no captured schema. */
  isHistorical?: boolean;
}

export interface NpsResult {
  score: number;
  promoters: number;
  passives: number;
  detractors: number;
  promoterPercent: number;
  passivePercent: number;
  detractorPercent: number;
}

export interface StarRatingResult {
  questionId: string;
  questionText: string;
  average: number;
  totalAnswered: number;
  distribution: Record<number, number>;
}

export interface LinearScaleResult {
  questionId: string;
  questionText: string;
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
  average: number;
  totalAnswered: number;
  distribution: Record<number, number>;
}

export interface GridRowDistribution {
  label: string;
  totalAnswered: number;
  options: { label: string; count: number; percent: number }[];
}

export interface GridDistribution {
  questionId: string;
  questionText: string;
  rows: GridRowDistribution[];
}

export interface TextResponseResult {
  questionId: string;
  questionText: string;
  responses: string[];
}

export interface TextCategoryDistribution {
  questionId: string;
  questionText: string;
  totalAnswered: number;
  uniqueCategories: number;
  source: 'automatic' | 'manual';
  options: TextCategoryOption[];
}

export interface SurveyAnalytics {
  totalResponses: number;
  /** Number of responses that contain every required answer. */
  completedResponses: number;
  completionRate: number;
  /** Responses created before the server began retaining question snapshots. */
  legacyResponsesWithoutSnapshot: number;
  /** Snapshot-backed responses whose question schema differs from the current survey. */
  responsesWithSchemaDifferences: number;
  /** Responses whose completion was evaluated using their captured schema. */
  snapshotCompletionResponses: number;
  /** Legacy responses whose completion can only be estimated from current schema. */
  legacyCompletionResponses: number;
  nps: NpsResult | null;
  choiceDistributions: ChoiceDistribution[];
  starRatings: StarRatingResult[];
  linearScales: LinearScaleResult[];
  gridDistributions: GridDistribution[];
  textResponses: TextResponseResult[];
  textCategoryDistributions: TextCategoryDistribution[];
  recentResponses: SurveyResponse[];
  averageScore?: number;
  quizTotalQuestions?: number;
  medianScore?: number;
  averageScorePercent?: number;
  medianScorePercent?: number;
  passRate?: number;
  scoreDistribution?: { label: string; count: number }[];
  scoredResponseCount?: number;
  invalidScoreCount?: number;
  npsByQuestion: (NpsResult & { questionId: string; questionText: string; totalAnswered: number })[];
  questionMetrics: {
    questionId: string;
    questionText: string;
    type: string;
    required: boolean;
    answered: number;
    missing: number;
    answerRate: number;
    /** Responses whose captured schema contained this question. */
    applicableResponses: number;
    /** Responses whose captured question type is comparable to the current type. */
    comparableResponses: number;
    /** Snapshot-backed responses from a different version of this question. */
    versionDifferentResponses: number;
    /** Snapshot-backed responses whose question type changed and are not comparable. */
    incompatibleVersionResponses: number;
    /** Responses without a captured schema; their coverage uses the current schema. */
    legacyUnversionedResponses: number;
    correctCount?: number;
    /** Number of answered rows eligible for the correctness denominator. */
    correctSampleSize?: number;
    correctRate?: number;
  }[];
}

function hasAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.values(value).some(hasAnswer);
  if (typeof value === 'string') return stripHtml(cleanHtmlWhitespace(value)).trim().length > 0;
  return value !== undefined && value !== null;
}

function hasQuestionAnswer(question: Survey['questions'][number], answer: unknown): boolean {
  if (question.type !== 'multiple_choice_grid' && question.type !== 'checkbox_grid') return hasAnswer(answer);
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
  // A partially completed grid is still an answered question for coverage
  // reporting. Required-grid completion is checked separately below.
  return Object.values(answer).some(hasAnswer);
}

function hasRequiredQuestionAnswer(question: Survey['questions'][number], answer: unknown): boolean {
  if (question.type !== 'multiple_choice_grid' && question.type !== 'checkbox_grid') return hasAnswer(answer);
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
  return (question.options ?? []).every(row => hasAnswer((answer as Record<string, unknown>)[row]));
}

function questionSchemaSignature(question: Survey['questions'][number]): string {
  // Keep only fields that change how an answer is interpreted. Presentation-only
  // fields such as labels do not make an existing response statistically
  // incompatible.
  return JSON.stringify({
    id: question.id,
    type: question.type,
    text: question.text,
    required: Boolean(question.required),
    options: question.options ?? [],
    gridColumns: question.gridColumns ?? [],
    scaleMin: question.scaleMin ?? null,
    scaleMax: question.scaleMax ?? null,
    correctAnswer: question.correctAnswer ?? null,
    points: question.points ?? null,
  });
}

/**
 * A backup/import can contain malformed JSON even though regular database rows
 * are JSONB. Treat an unusable snapshot exactly like a legacy row instead of
 * letting analysis crash or pretend it is versioned data.
 */
function getSnapshotQuestions(response: SurveyResponse): Survey['questions'] | null {
  const questions = response.surveySnapshot?.questions;
  return Array.isArray(questions) ? questions : null;
}

function getSnapshotQuestion(response: SurveyResponse, questionId: string): Survey['questions'][number] | undefined {
  return getSnapshotQuestions(response)?.find(question => question && question.id === questionId);
}

function responseUsesSnapshot(response: SurveyResponse): boolean {
  return getSnapshotQuestions(response) !== null;
}

/**
 * A questionnaire can be switched into quiz mode after earlier survey
 * responses have already been collected.  Use the captured mode for those
 * responses so a newly-added answer key never retroactively grades them.
 */
function responseWasCollectedAsQuiz(response: SurveyResponse): boolean {
  // Snapshot-less legacy rows do not contain durable evidence that quiz mode
  // (and this exact answer key) was active at submission time. Excluding them
  // from per-question correctness is safer than retroactively grading them
  // after a survey is later converted to a quiz.
  return responseUsesSnapshot(response) && Boolean(response.surveySnapshot?.isQuiz);
}

function isQuestionSchemaDifferent(
  snapshotQuestion: Survey['questions'][number] | undefined,
  currentQuestion: Survey['questions'][number],
): boolean {
  return !snapshotQuestion || questionSchemaSignature(snapshotQuestion) !== questionSchemaSignature(currentQuestion);
}

function hasSchemaDifference(response: SurveyResponse, currentQuestions: Survey['questions']): boolean {
  const snapshotQuestions = getSnapshotQuestions(response);
  if (!snapshotQuestions) return false;
  const currentById = new Map(currentQuestions.map(question => [question.id, question]));
  const snapshotById = new Map(snapshotQuestions.map(question => [question.id, question]));
  if (currentById.size !== snapshotById.size) return true;
  for (const [id, current] of currentById) {
    const captured = snapshotById.get(id);
    if (!captured || questionSchemaSignature(current) !== questionSchemaSignature(captured)) return true;
  }
  return false;
}

function isChoiceQuestion(question: Survey['questions'][number]): boolean {
  return question.type === 'single_choice' || question.type === 'multiple_choice' || question.type === 'dropdown';
}

function isScoreableQuestion(question: Survey['questions'][number]): boolean {
  return ((question.type === 'single_choice' || question.type === 'dropdown')
    && typeof question.correctAnswer === 'string'
    && question.correctAnswer.trim().length > 0)
    || (question.type === 'multiple_choice'
      && Array.isArray(question.correctAnswer)
      && question.correctAnswer.length > 0);
}

function isCorrectAnswer(question: Survey['questions'][number], answer: unknown): boolean {
  if ((question.type === 'single_choice' || question.type === 'dropdown')
    && typeof question.correctAnswer === 'string') {
    return answer === question.correctAnswer;
  }
  if (question.type === 'multiple_choice'
    && Array.isArray(question.correctAnswer)
    && Array.isArray(answer)) {
    const actual = [...answer].sort();
    const expected = [...question.correctAnswer].sort();
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
  }
  return false;
}

/**
 * Charts that are labelled with the current wording/configuration may only
 * include responses from that exact instrument (or legacy rows that predate
 * snapshots and are explicitly labelled as such in the UI).
 */
function usesCurrentQuestionSchema(response: SurveyResponse, currentQuestion: Survey['questions'][number]): boolean {
  if (!responseUsesSnapshot(response)) return true;
  const captured = getSnapshotQuestion(response, currentQuestion.id);
  return Boolean(captured)
    && questionSchemaSignature(captured) === questionSchemaSignature(currentQuestion);
}

export function calculateNps(scores: number[]): NpsResult | null {
  if (scores.length === 0) return null;

  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const score of scores) {
    // NPS is defined only for integral answers from 0 through 10. Ignoring
    // malformed legacy values is safer than silently classifying them.
    if (typeof score !== 'number' || !Number.isInteger(score) || isNaN(score) || score < 0 || score > 10) continue;
    if (score >= 9) promoters++;
    else if (score >= 7) passives++;
    else detractors++;
  }

  const total = promoters + passives + detractors;
  if (total === 0) return null;

  const [promoterPercent, passivePercent, detractorPercent] = allocateExclusivePercents(
    [promoters, passives, detractors],
    total,
  );
  const score = Math.round(((promoters - detractors) / total) * 100);

  return { score, promoters, passives, detractors, promoterPercent, passivePercent, detractorPercent };
}

export function computeSurveyAnalytics(survey: Survey, responses: SurveyResponse[]): SurveyAnalytics {
  const totalResponses = responses.length;
  const legacyResponsesWithoutSnapshot = responses.filter(response => !responseUsesSnapshot(response)).length;
  const responsesWithSchemaDifferences = responses.filter(response => hasSchemaDifference(response, survey.questions)).length;

  let fullyAnswered = 0;
  let snapshotCompletionResponses = 0;
  let legacyCompletionResponses = 0;
  for (const resp of responses) {
    // A required flag (and the structure of grid questions) belongs to the
    // version the respondent actually saw. Applying today's schema to an old
    // response silently changes its completion status after publication.
    const responseQuestions = getSnapshotQuestions(resp) ?? survey.questions;
    if (responseUsesSnapshot(resp)) snapshotCompletionResponses++;
    else legacyCompletionResponses++;
    const answeredRequired = responseQuestions
      .filter(q => q.required)
      .every(q => {
        const ans = resp.answers[q.id];
        return hasRequiredQuestionAnswer(q, ans);
      });
    if (answeredRequired) fullyAnswered++;
  }

  const completionRate = totalResponses > 0 ? roundPercent((fullyAnswered / totalResponses) * 100) : 0;

  const npsByQuestion = survey.questions
    .filter(q => q.type === 'nps')
    .flatMap(question => {
      const scores = responses
        .filter(response => {
          if (!responseUsesSnapshot(response)) return true;
          const captured = getSnapshotQuestion(response, question.id);
          // A changed NPS prompt can measure a different construct even though
          // it shares the same 0–10 scale. Do not silently pool those cohorts.
          return Boolean(captured)
            && captured.type === 'nps'
            && questionSchemaSignature(captured) === questionSchemaSignature(question);
        })
        .map(response => response.answers[question.id])
        .filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && !isNaN(v) && v >= 0 && v <= 10);
      const result = calculateNps(scores);
      return result ? [{ ...result, questionId: question.id, questionText: question.text, totalAnswered: scores.length }] : [];
    });
  const nps = npsByQuestion[0] || null;

  const questionMetrics = survey.questions.map(question => {
    let answered = 0;
    let correctCount = 0;
    let correctSampleSize = 0;
    let applicableResponses = 0;
    let comparableResponses = 0;
    let versionDifferentResponses = 0;
    let incompatibleVersionResponses = 0;
    let legacyUnversionedResponses = 0;
    // A leftover answer key on an ordinary survey must not turn a coverage
    // table into a quiz report.  Correctness is meaningful only when this
    // survey is currently a quiz, and for snapshot-backed rows that were
    // submitted while quiz mode was enabled.
    let hasScoringSchema = Boolean(survey.isQuiz && isScoreableQuestion(question));
    for (const response of responses) {
      const snapshotBacked = responseUsesSnapshot(response);
      const snapshotQuestion = getSnapshotQuestion(response, question.id);
      // A snapshot-backed submission predating this question should not be
      // reported as a skipped answer. It was never shown that question.
      if (snapshotBacked && !snapshotQuestion) continue;
      const responseQuestion = snapshotQuestion ?? question;
      applicableResponses++;
      const schemaDifferent = snapshotBacked && isQuestionSchemaDifferent(snapshotQuestion, question);
      if (schemaDifferent) {
        versionDifferentResponses++;
      } else if (!snapshotBacked) {
        legacyUnversionedResponses++;
      }
      if (responseQuestion.type !== question.type) {
        if (snapshotBacked) incompatibleVersionResponses++;
        continue;
      }
      comparableResponses++;
      const answer = response.answers[question.id];
      if (!hasQuestionAnswer(responseQuestion, answer)) continue;
      answered++;
      if (survey.isQuiz && responseWasCollectedAsQuiz(response) && isScoreableQuestion(responseQuestion)) {
        hasScoringSchema = true;
        correctSampleSize++;
        if (isCorrectAnswer(responseQuestion, answer)) correctCount++;
      }
    }
    return {
      questionId: question.id,
      questionText: question.text,
      type: question.type,
      required: Boolean(question.required),
      answered,
      // A question added after some responses is not a skipped answer. Its
      // denominator therefore contains only responses that actually saw a
      // compatible version of that question.
      missing: comparableResponses - answered,
      answerRate: comparableResponses ? roundPercent((answered / comparableResponses) * 100) : 0,
      applicableResponses,
      comparableResponses,
      versionDifferentResponses,
      incompatibleVersionResponses,
      legacyUnversionedResponses,
      ...(hasScoringSchema ? {
        correctCount,
        correctSampleSize,
        ...(correctSampleSize ? { correctRate: roundPercent((correctCount / correctSampleSize) * 100) } : {}),
      } : {}),
    };
  });

  // Scores are normalized against the maximum stored with each response, not
  // the *current* questionnaire. This is essential after a published quiz is
  // edited and old attempts have a different point total.
  const recordedScoreRows = survey.isQuiz
    ? responses.flatMap(response => {
        const hasScore = response.score !== undefined && response.score !== null;
        const hasTotal = response.totalQuizQuestions !== undefined && response.totalQuizQuestions !== null;
        // Preserve a malformed stored score in the audit count. It must never
        // affect averages, but hiding it would make the displayed denominator
        // look more reliable than the source data actually is.
        if (!hasScore && !hasTotal) return [];
        const score = Number(response.score);
        const total = Number(response.totalQuizQuestions);
        return [{ score, total, percent: (score / total) * 100 }];
      })
    : [];
  const validScoreRows = recordedScoreRows.filter(row =>
    Number.isFinite(row.score)
    && Number.isFinite(row.total)
    && row.total > 0
    && Number.isFinite(row.percent)
    && row.percent >= 0
    && row.percent <= 100
  );
  const scorePercents = validScoreRows.map(row => row.percent);
  const sortedScorePercents = [...scorePercents].sort((a, b) => a - b);
  const scoreMidpoint = Math.floor(sortedScorePercents.length / 2);
  const medianScorePercent = sortedScorePercents.length
    ? roundPercent(sortedScorePercents.length % 2
      ? sortedScorePercents[scoreMidpoint]
      : (sortedScorePercents[scoreMidpoint - 1] + sortedScorePercents[scoreMidpoint]) / 2)
    : undefined;
  const averageScorePercent = scorePercents.length
    ? roundPercent(scorePercents.reduce((sum, score) => sum + score, 0) / scorePercents.length)
    : undefined;
  const totals = [...new Set(validScoreRows.map(row => row.total))];
  const quizTotalQuestions = totals.length === 1 ? totals[0] : undefined;
  const rawScores = validScoreRows.map(row => row.score).sort((a, b) => a - b);
  const rawScoreMidpoint = Math.floor(rawScores.length / 2);
  const medianScore = quizTotalQuestions && rawScores.length
    ? (rawScores.length % 2 ? rawScores[rawScoreMidpoint] : (rawScores[rawScoreMidpoint - 1] + rawScores[rawScoreMidpoint]) / 2)
    : undefined;
  const averageScore = quizTotalQuestions && rawScores.length
    ? Number((rawScores.reduce((sum, score) => sum + score, 0) / rawScores.length).toFixed(1))
    : undefined;
  const scoreDistribution = survey.isQuiz && scorePercents.length ? [
    { label: '0–49%', count: scorePercents.filter(value => value < 50).length },
    { label: '50–69%', count: scorePercents.filter(value => value >= 50 && value < 70).length },
    { label: '70–84%', count: scorePercents.filter(value => value >= 70 && value < 85).length },
    { label: '85–100%', count: scorePercents.filter(value => value >= 85 && value <= 100).length },
  ] : undefined;

  const choiceDistributions: ChoiceDistribution[] = [];
  for (const q of survey.questions.filter(isChoiceQuestion)) {
    const configuredGroups = new Map<string, { id: string; label: string; count: number; isAmbiguous: boolean }>();
    for (const [index, label] of (q.options || []).entries()) {
      const existing = configuredGroups.get(label);
      if (existing) {
        existing.isAmbiguous = true;
      } else {
        configuredGroups.set(label, { id: `option-${index}`, label, count: 0, isAmbiguous: false });
      }
    }
    const unknownCounts = new Map<string, number>();
    const historicalCounts = new Map<string, { id: string; label: string; count: number }>();
    const historicalVersions = new Map<string, number>();
    let nextHistoricalVersion = 1;

    let answeredForThisQ = 0;
    let currentVersionAnswered = 0;
    let historicalVersionAnswered = 0;
    let legacyUnversionedAnswered = 0;
    let incompatibleVersionAnswered = 0;
    for (const resp of responses) {
      const snapshotBacked = responseUsesSnapshot(resp);
      const snapshotQuestion = getSnapshotQuestion(resp, q.id);
      // The question did not exist in this older survey version, so it must
      // not be counted as a skipped answer for today's question.
      if (snapshotBacked && !snapshotQuestion) continue;
      const responseQuestion = snapshotQuestion ?? q;
      const ans = resp.answers[q.id];
      if (!hasAnswer(ans)) continue;

      // A type change (for example, text → single choice) is a different
      // measurement instrument. Preserve it in raw/exported data but never
      // render it as a choice from the newer question.
      if (!isChoiceQuestion(responseQuestion) || responseQuestion.type !== q.type) {
        if (snapshotBacked) incompatibleVersionAnswered++;
        continue;
      }

      const rawSelections = q.type === 'multiple_choice'
        ? (Array.isArray(ans) ? ans : [])
        : (typeof ans === 'string' ? [ans] : []);
      // A malformed old response may repeat a selection. Count one respondent
      // once per option, exactly as a valid submission does.
      const selections = [...new Set(rawSelections.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
      if (!selections.length) continue;

      answeredForThisQ++;
      const schemaDifferent = snapshotBacked && isQuestionSchemaDifferent(snapshotQuestion, q);
      if (!snapshotBacked) {
        legacyUnversionedAnswered++;
        for (const selection of selections) {
          // Legacy rows have no captured instrument. Use the current labels as
          // a best-effort display only, while exposing their count separately
          // so this unavoidable uncertainty is never hidden from the reader.
          const configured = configuredGroups.get(selection);
          if (configured) {
            configured.count++;
          } else {
            unknownCounts.set(selection, (unknownCounts.get(selection) ?? 0) + 1);
          }
        }
      } else if (schemaDifferent) {
        historicalVersionAnswered++;
        const signature = questionSchemaSignature(responseQuestion);
        let version = historicalVersions.get(signature);
        if (!version) {
          version = nextHistoricalVersion++;
          historicalVersions.set(signature, version);
        }
        for (const selection of selections) {
          const key = `${signature}\u0000${selection}`;
          const existing = historicalCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            historicalCounts.set(key, {
              id: `historical-${historicalCounts.size}`,
              label: `Phiên bản cũ #${version}: ${selection}`,
              count: 1,
            });
          }
        }
      } else {
        currentVersionAnswered++;
        for (const selection of selections) {
          const configured = configuredGroups.get(selection);
          if (configured) {
            configured.count++;
          } else {
            unknownCounts.set(selection, (unknownCounts.get(selection) ?? 0) + 1);
          }
        }
      }
    }

    const baseTotal = answeredForThisQ > 0 ? answeredForThisQ : (totalResponses > 0 ? totalResponses : 1);
    const configuredOptions: ChoiceDistributionOption[] = [...configuredGroups.values()].map(option => ({
      id: option.id,
      label: option.label,
      count: option.count,
      percent: 0,
      ...(option.isAmbiguous ? { isAmbiguous: true } : {}),
    }));
    const unknownOptions: ChoiceDistributionOption[] = [...unknownCounts.entries()].map(([label, count], index) => ({
      id: `unknown-${index}`,
      label: `Lựa chọn cũ/không còn trong cấu hình: ${label}`,
      count,
      percent: 0,
      isUnknown: true,
    }));
    const historicalOptions: ChoiceDistributionOption[] = [...historicalCounts.values()].map(option => ({
      ...option,
      percent: 0,
      isHistorical: true,
    }));
    const unroundedOptions = [...configuredOptions, ...unknownOptions, ...historicalOptions]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));
    const percents = q.type === 'multiple_choice'
      ? unroundedOptions.map(option => roundPercent((option.count / baseTotal) * 100))
      : allocateExclusivePercents(unroundedOptions.map(option => option.count), answeredForThisQ);
    choiceDistributions.push({
      questionId: q.id,
      questionText: q.text,
      totalAnswered: answeredForThisQ,
      currentVersionAnswered,
      historicalVersionAnswered,
      legacyUnversionedAnswered,
      incompatibleVersionAnswered,
      options: unroundedOptions.map((option, index) => ({ ...option, percent: percents[index] ?? 0 })),
    });
  }

  const linearScales: LinearScaleResult[] = [];
  for (const question of survey.questions.filter(question => question.type === 'linear_scale')) {
    const min = question.scaleMin ?? 1;
    const max = question.scaleMax ?? 5;
    const distribution: Record<number, number> = {};
    for (let value = min; value <= max; value++) distribution[value] = 0;
    const scores = responses
      .filter(response => usesCurrentQuestionSchema(response, question))
      .map(response => response.answers[question.id])
      .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max);
    for (const score of scores) distribution[score] = (distribution[score] ?? 0) + 1;
    linearScales.push({
      questionId: question.id,
      questionText: question.text,
      min,
      max,
      minLabel: question.scaleMinLabel,
      maxLabel: question.scaleMaxLabel,
      average: scores.length ? roundPercent(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
      totalAnswered: scores.length,
      distribution,
    });
  }

  const gridDistributions: GridDistribution[] = survey.questions
    .filter(question => question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid')
    .map(question => ({
      questionId: question.id,
      questionText: question.text,
      rows: (question.options ?? []).map(row => {
        const counts = new Map((question.gridColumns ?? []).map(column => [column, 0]));
        let totalAnswered = 0;
        for (const response of responses) {
          if (!usesCurrentQuestionSchema(response, question)) continue;
          const raw = response.answers[question.id];
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
          const rowAnswer = (raw as Record<string, unknown>)[row];
          const selections = Array.isArray(rowAnswer) ? rowAnswer : [rowAnswer];
          const validSelections = [...new Set(selections.filter((selection): selection is string => typeof selection === 'string' && counts.has(selection)))];
          if (!validSelections.length) continue;
          totalAnswered++;
          for (const selection of validSelections) counts.set(selection, (counts.get(selection) ?? 0) + 1);
        }
        return {
          label: row,
          totalAnswered,
          options: [...counts].map(([label, count]) => ({
            label,
            count,
            percent: totalAnswered ? roundPercent((count / totalAnswered) * 100) : 0,
          })),
        };
      }),
    }));

  const starRatings: StarRatingResult[] = [];
  for (const q of survey.questions.filter(q => q.type === 'star_rating')) {
    // Earlier form versions accepted half stars. Keep those levels visible in
    // historical reports rather than silently rounding them to a whole star.
    const distribution: Record<number, number> = {};
    for (let level = 0.5; level <= 5; level += 0.5) distribution[level] = 0;
    const scores: number[] = [];

    for (const resp of responses) {
      if (!usesCurrentQuestionSchema(resp, q)) continue;
      const rating = parseStoredStarRating(resp.answers[q.id]);
      if (rating !== null) {
        scores.push(rating);
        distribution[rating]++;
      }
    }

    starRatings.push({
      questionId: q.id,
      questionText: q.text,
      average: scores.length > 0 ? roundPercent(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      totalAnswered: scores.length,
      distribution,
    });
  }

  const textResponses: TextResponseResult[] = [];
  const textCategoryDistributions: TextCategoryDistribution[] = [];
  for (const q of survey.questions.filter(q => q.type === 'text')) {
    const texts = responses
      .filter(response => usesCurrentQuestionSchema(response, q))
      .map(r => r.answers[q.id])
      .map(cleanTextAnswer)
      .filter((value): value is string => value.length > 0);
    if (texts.length > 0) {
      textResponses.push({ questionId: q.id, questionText: q.text, responses: texts });

      const eligibility = getTextAnalyticsEligibility(q);
      if (eligibility.enabled && eligibility.source) {
        const summary = summarizeTextCategories(texts);
        textCategoryDistributions.push({
          questionId: q.id,
          questionText: q.text,
          totalAnswered: summary.totalAnswered,
          uniqueCategories: summary.options.length,
          source: eligibility.source,
          options: summary.options,
        });
      }
    }
  }

  return {
    totalResponses,
    completedResponses: fullyAnswered,
    completionRate,
    legacyResponsesWithoutSnapshot,
    responsesWithSchemaDifferences,
    snapshotCompletionResponses,
    legacyCompletionResponses,
    nps,
    choiceDistributions,
    starRatings,
    linearScales,
    gridDistributions,
    textResponses,
    textCategoryDistributions,
    recentResponses: [...responses]
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    averageScore,
    quizTotalQuestions,
    medianScore,
    averageScorePercent,
    medianScorePercent,
    passRate: scorePercents.length ? roundPercent((scorePercents.filter(value => value >= 50).length / scorePercents.length) * 100) : undefined,
    scoreDistribution,
    scoredResponseCount: validScoreRows.length || undefined,
    invalidScoreCount: recordedScoreRows.length - validScoreRows.length || undefined,
    npsByQuestion,
    questionMetrics,
  };
}

/**
 * The standard data export deliberately omits text fields that the builder
 * recognises as direct identifiers (name, email, phone, student ID, …).
 * They remain unchanged in the database; this only keeps a normal analytics
 * download from becoming an accidental PII disclosure.
 */
export function exportResponsesToCsv(survey: Survey, responses: SurveyResponse[], includePersonalData = false): string {
  const exportQuestions = survey.questions.filter(question => includePersonalData || !isPersonalIdentifierQuestion(question));
  const headers = ['ID', 'Ngày gửi'];
  if (survey.isQuiz) headers.push('Điểm số', 'Điểm tối đa', 'Tỷ lệ %');
  headers.push(...exportQuestions.map(q => stripHtml(cleanHtmlWhitespace(q.text))));

  const rows = responses.map(r => {
    const d = new Date(r.submittedAt);
    const dateStr = new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);

    const cells: (string | number)[] = [r.id, dateStr];

    if (survey.isQuiz) {
      const hasScore = r.score !== undefined && r.score !== null && !isNaN(Number(r.score));
      const hasTotal = r.totalQuizQuestions !== undefined && r.totalQuizQuestions !== null && Number(r.totalQuizQuestions) > 0;
      cells.push(hasScore ? r.score! : '');
      cells.push(hasTotal ? r.totalQuizQuestions! : '');
      cells.push(hasScore && hasTotal ? roundPercent((Number(r.score) / Number(r.totalQuizQuestions)) * 100) + '%' : '');
    }

    cells.push(
      ...exportQuestions.map(q => {
        const ans = r.answers[q.id];
        if (Array.isArray(ans)) return stripHtml(cleanHtmlWhitespace(ans.join('; ')));
        if (ans && typeof ans === 'object') {
          return stripHtml(cleanHtmlWhitespace(Object.entries(ans)
            .map(([row, selection]) => `${row}: ${Array.isArray(selection) ? selection.join(', ') : selection}`)
            .join('; ')));
        }
        return ans !== undefined && ans !== null ? stripHtml(cleanHtmlWhitespace(String(ans))) : '';
      })
    );

    return cells.map(cell => `"${String(sanitizeSpreadsheetValue(cell)).replace(/"/g, '""')}"`).join(',');
  });
  return [headers.map(header => `"${String(sanitizeSpreadsheetValue(header)).replace(/"/g, '""')}"`).join(','), ...rows].join('\n');
}
