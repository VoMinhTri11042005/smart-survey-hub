import type { Survey, SurveyQuestion, SurveyResponse } from '../types';
import { stripHtml, cleanHtmlWhitespace } from './stringUtils';

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
        return ans !== undefined && ans !== null && ans !== '' && !(Array.isArray(ans) && ans.length === 0);
      });
    if (answeredRequired) fullyAnswered++;
  }

  const completionRate = totalResponses > 0 ? Math.round((fullyAnswered / totalResponses) * 100) : 0;

  const npsQuestion = survey.questions.find(q => q.type === 'nps');
  const npsScores = npsQuestion
    ? responses
        .map(r => r.answers[npsQuestion.id])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 10)
    : [];
  const nps = calculateNps(npsScores);

  const choiceDistributions: ChoiceDistribution[] = [];
  for (const q of survey.questions.filter(q => q.type === 'single_choice' || q.type === 'multiple_choice')) {
    const counts: Record<string, number> = {};
    for (const opt of q.options || []) counts[opt] = 0;

    let answeredForThisQ = 0;
    for (const resp of responses) {
      const ans = resp.answers[q.id];
      if (ans !== undefined && ans !== null && ans !== '' && !(Array.isArray(ans) && ans.length === 0)) {
        answeredForThisQ++;
        if (Array.isArray(ans)) {
          for (const a of ans) if (counts[a] !== undefined) counts[a]++;
        } else if (typeof ans === 'string' && counts[ans] !== undefined) {
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
      const ans = resp.answers[q.id];
      if (typeof ans === 'number' && !isNaN(ans) && ans >= 0.5 && ans <= 5) {
        scores.push(ans);
        // Categorize into nearest star bucket 1..5
        const starBucket = Math.min(5, Math.max(1, Math.ceil(ans)));
        distribution[starBucket] = (distribution[starBucket] || 0) + 1;
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
      textResponses.push({ questionText: q.text, responses: texts.slice(-10) });
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
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
      .slice(0, 10),
    averageScore: quizCount > 0 ? Number((totalScore / quizCount).toFixed(1)) : undefined,
    quizTotalQuestions: quizTotalQuestions && quizTotalQuestions > 0 ? quizTotalQuestions : undefined,
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
