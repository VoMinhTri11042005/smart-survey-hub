import type { Survey, SurveyQuestion, SurveyResponse } from '../types';
import { stripHtml, cleanHtmlWhitespace } from './stringUtils';
import { roundLegacyStarRating } from '../../shared/starRating';

export interface ChoiceDistribution {
  questionId: string;
  questionText: string;
  totalAnswered: number;
  options: { label: string; count: number; percent: number }[];
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

export interface SurveyAnalytics {
  totalResponses: number;
  completionRate: number;
  nps: NpsResult | null;
  choiceDistributions: ChoiceDistribution[];
  starRatings: StarRatingResult[];
  textResponses: { questionText: string; responses: string[] }[];
  recentResponses: SurveyResponse[];
  averageScore?: number;
  quizTotalQuestions?: number;
  medianScore?: number;
  passRate?: number;
  scoreDistribution?: { label: string; count: number }[];
  scoredResponseCount?: number;
  npsByQuestion: (NpsResult & { questionId: string; questionText: string; totalAnswered: number })[];
  questionMetrics: { questionId: string; questionText: string; type: string; required: boolean; answered: number; missing: number; answerRate: number; correctCount?: number; correctRate?: number }[];
}

function hasAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return stripHtml(cleanHtmlWhitespace(value)).trim().length > 0;
  return value !== undefined && value !== null;
}

export function calculateNps(scores: number[]): NpsResult | null {
  if (scores.length === 0) return null;

  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const score of scores) {
    if (typeof score !== 'number' || isNaN(score)) continue;
    if (score >= 9) promoters++;
    else if (score >= 7) passives++;
    else if (score >= 0) detractors++;
  }

  const total = promoters + passives + detractors;
  if (total === 0) return null;

  const promoterPercent = Math.round((promoters / total) * 100);
  const passivePercent = Math.round((passives / total) * 100);
  const detractorPercent = Math.round((detractors / total) * 100);
  // Calculate direct NPS to avoid cumulative rounding errors
  const score = Math.round(((promoters - detractors) / total) * 100);

  return { score, promoters, passives, detractors, promoterPercent, passivePercent, detractorPercent };
}

export function computeSurveyAnalytics(survey: Survey, responses: SurveyResponse[]): SurveyAnalytics {
  const totalResponses = responses.length;

  let totalScore = 0;
  let quizCount = 0;
  let lastRecordedTotal = 0;

  // Calculate maximum possible quiz score directly from survey questions
  const calculatedTotalPossible = survey.isQuiz
    ? survey.questions.reduce((sum, q) => {
        if ((q.type === 'single_choice' || q.type === 'multiple_choice') && q.correctAnswer) {
          const hasCorrect =
            typeof q.correctAnswer === 'string'
              ? q.correctAnswer.trim().length > 0
              : Array.isArray(q.correctAnswer) && q.correctAnswer.length > 0;
          if (hasCorrect) {
            const points = typeof q.points === 'number' && q.points > 0 ? q.points : 1;
            return sum + points;
          }
        }
        return sum;
      }, 0)
    : 0;

  if (survey.isQuiz) {
    responses.forEach(r => {
      if (r.score !== undefined && r.score !== null && !isNaN(Number(r.score))) {
        totalScore += Number(r.score);
        if (r.totalQuizQuestions !== undefined && r.totalQuizQuestions !== null) {
          lastRecordedTotal = Number(r.totalQuizQuestions);
        }
        quizCount++;
      }
    });
  }

  const quizTotalQuestions =
    calculatedTotalPossible > 0
      ? calculatedTotalPossible
      : lastRecordedTotal > 0
      ? lastRecordedTotal
      : undefined;

  let fullyAnswered = 0;
  for (const resp of responses) {
    const answeredRequired = survey.questions
      .filter(q => q.required)
      .every(q => {
        const ans = resp.answers[q.id];
        return hasAnswer(ans);
      });
    if (answeredRequired) fullyAnswered++;
  }

  const completionRate = totalResponses > 0 ? Math.round((fullyAnswered / totalResponses) * 100) : 0;

  const npsByQuestion = survey.questions
    .filter(q => q.type === 'nps')
    .flatMap(question => {
      const scores = responses
        .map(r => r.answers[question.id])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 10);
      const result = calculateNps(scores);
      return result ? [{ ...result, questionId: question.id, questionText: question.text, totalAnswered: scores.length }] : [];
    });
  const nps = npsByQuestion[0] || null;

  const questionMetrics = survey.questions.map(question => {
    let answered = 0;
    let correctCount = 0;
    for (const response of responses) {
      const answer = response.answers[question.id];
      if (!hasAnswer(answer)) continue;
      answered++;
      if (question.type === 'single_choice' && typeof question.correctAnswer === 'string' && answer === question.correctAnswer) correctCount++;
      if (question.type === 'multiple_choice' && Array.isArray(question.correctAnswer) && Array.isArray(answer)) {
        const actual = [...answer].sort();
        const expected = [...question.correctAnswer].sort();
        if (actual.length === expected.length && actual.every((value, index) => value === expected[index])) correctCount++;
      }
    }
    const canScore = (question.type === 'single_choice' && typeof question.correctAnswer === 'string' && question.correctAnswer.trim()) || (question.type === 'multiple_choice' && Array.isArray(question.correctAnswer) && question.correctAnswer.length > 0);
    return {
      questionId: question.id,
      questionText: question.text,
      type: question.type,
      required: Boolean(question.required),
      answered,
      missing: totalResponses - answered,
      answerRate: totalResponses ? Math.round((answered / totalResponses) * 100) : 0,
      ...(canScore ? { correctCount, correctRate: answered ? Math.round((correctCount / answered) * 100) : 0 } : {}),
    };
  });

  const scoredResponses = survey.isQuiz
    ? responses.filter(response => response.score !== undefined && response.score !== null && !isNaN(Number(response.score)))
    : [];
  const scorePercents = scoredResponses.map(response => {
    const total = Number(response.totalQuizQuestions) || calculatedTotalPossible;
    return total > 0 ? (Number(response.score) / total) * 100 : 0;
  });
  const sortedScores = [...scoredResponses].map(response => Number(response.score)).sort((a, b) => a - b);
  const midpoint = Math.floor(sortedScores.length / 2);
  const medianScore = sortedScores.length ? (sortedScores.length % 2 ? sortedScores[midpoint] : (sortedScores[midpoint - 1] + sortedScores[midpoint]) / 2) : undefined;
  const scoreDistribution = survey.isQuiz && scorePercents.length ? [
    { label: '0–49%', count: scorePercents.filter(value => value < 50).length },
    { label: '50–69%', count: scorePercents.filter(value => value >= 50 && value < 70).length },
    { label: '70–84%', count: scorePercents.filter(value => value >= 70 && value < 85).length },
    { label: '85–100%', count: scorePercents.filter(value => value >= 85).length },
  ] : undefined;

  const choiceDistributions: ChoiceDistribution[] = [];
  for (const q of survey.questions.filter(q => q.type === 'single_choice' || q.type === 'multiple_choice')) {
    const counts: Record<string, number> = {};
    for (const opt of q.options || []) counts[opt] = 0;

    let answeredForThisQ = 0;
    for (const resp of responses) {
      const ans = resp.answers[q.id];
      if (hasAnswer(ans)) {
        answeredForThisQ++;
        if (Array.isArray(ans)) {
          for (const a of ans) {
            if (counts[a] === undefined) counts[a] = 0;
            counts[a]++;
          }
        } else if (typeof ans === 'string') {
          if (counts[ans] === undefined) counts[ans] = 0;
          counts[ans]++;
        }
      }
    }

    const baseTotal = answeredForThisQ > 0 ? answeredForThisQ : (totalResponses > 0 ? totalResponses : 1);
    choiceDistributions.push({
      questionId: q.id,
      questionText: q.text,
      totalAnswered: answeredForThisQ,
      options: Object.entries(counts)
        .map(([label, count]) => ({
          label,
          count,
          percent: Math.round((count / baseTotal) * 100),
        }))
        .sort((a, b) => b.count - a.count),
    });
  }

  const starRatings: StarRatingResult[] = [];
  for (const q of survey.questions.filter(q => q.type === 'star_rating')) {
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const scores: number[] = [];

    for (const resp of responses) {
      const rating = roundLegacyStarRating(resp.answers[q.id]);
      if (rating !== null) {
        scores.push(rating);
        distribution[rating]++;
      }
    }

    starRatings.push({
      questionId: q.id,
      questionText: q.text,
      average: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
      totalAnswered: scores.length,
      distribution,
    });
  }

  const textResponses: { questionText: string; responses: string[] }[] = [];
  for (const q of survey.questions.filter(q => q.type === 'text')) {
    const texts = responses
      .map(r => r.answers[q.id])
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (texts.length > 0) {
      textResponses.push({ questionText: q.text, responses: texts });
    }
  }

  return {
    totalResponses,
    completionRate,
    nps,
    choiceDistributions,
    starRatings,
    textResponses,
    recentResponses: [...responses]
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    averageScore: quizCount > 0 ? Number((totalScore / quizCount).toFixed(1)) : undefined,
    quizTotalQuestions: quizTotalQuestions && quizTotalQuestions > 0 ? quizTotalQuestions : undefined,
    medianScore,
    passRate: scorePercents.length ? Math.round((scorePercents.filter(value => value >= 50).length / scorePercents.length) * 100) : undefined,
    scoreDistribution,
    scoredResponseCount: scoredResponses.length || undefined,
    npsByQuestion,
    questionMetrics,
  };
}

export function exportResponsesToCsv(survey: Survey, responses: SurveyResponse[]): string {
  const headers = ['ID', 'Ngày gửi'];
  if (survey.isQuiz) headers.push('Điểm số', 'Tổng số câu', 'Tỷ lệ %');
  headers.push(...survey.questions.map(q => stripHtml(cleanHtmlWhitespace(q.text))));

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
      cells.push(hasScore && hasTotal ? Math.round((Number(r.score) / Number(r.totalQuizQuestions)) * 100) + '%' : '');
    }

    cells.push(
      ...survey.questions.map(q => {
        const ans = r.answers[q.id];
        if (Array.isArray(ans)) return stripHtml(cleanHtmlWhitespace(ans.join('; ')));
        return ans !== undefined && ans !== null ? stripHtml(cleanHtmlWhitespace(String(ans))) : '';
      })
    );

    return cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
  });
  return [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','), ...rows].join('\n');
}
