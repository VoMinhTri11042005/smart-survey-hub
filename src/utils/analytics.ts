import type { Survey, SurveyQuestion, SurveyResponse } from '../types';

export interface ChoiceDistribution {
  questionId: string;
  questionText: string;
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
}

export function calculateNps(scores: number[]): NpsResult | null {
  if (scores.length === 0) return null;

  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const score of scores) {
    if (score >= 9) promoters++;
    else if (score >= 7) passives++;
    else detractors++;
  }

  const total = scores.length;
  const promoterPercent = Math.round((promoters / total) * 100);
  const passivePercent = Math.round((passives / total) * 100);
  const detractorPercent = Math.round((detractors / total) * 100);
  const score = promoterPercent - detractorPercent;

  return { score, promoters, passives, detractors, promoterPercent, passivePercent, detractorPercent };
}

export function computeSurveyAnalytics(survey: Survey, responses: SurveyResponse[]): SurveyAnalytics {
  const totalResponses = responses.length;
  const requiredCount = survey.questions.filter(q => q.required).length;

  let fullyAnswered = 0;
  for (const resp of responses) {
    const answeredRequired = survey.questions
      .filter(q => q.required)
      .every(q => {
        const ans = resp.answers[q.id];
        return ans !== undefined && ans !== '' && !(Array.isArray(ans) && ans.length === 0);
      });
    if (answeredRequired) fullyAnswered++;
  }

  const completionRate = totalResponses > 0 ? Math.round((fullyAnswered / totalResponses) * 100) : 0;

  const npsQuestion = survey.questions.find(q => q.type === 'nps');
  const npsScores = npsQuestion
    ? responses.map(r => r.answers[npsQuestion.id]).filter((v): v is number => typeof v === 'number')
    : [];
  const nps = calculateNps(npsScores);

  const choiceDistributions: ChoiceDistribution[] = [];
  for (const q of survey.questions.filter(q => q.type === 'single_choice' || q.type === 'multiple_choice')) {
    const counts: Record<string, number> = {};
    for (const opt of q.options || []) counts[opt] = 0;

    for (const resp of responses) {
      const ans = resp.answers[q.id];
      if (Array.isArray(ans)) {
        for (const a of ans) if (counts[a] !== undefined) counts[a]++;
      } else if (typeof ans === 'string' && counts[ans] !== undefined) {
        counts[ans]++;
      }
    }

    const maxCount = Math.max(...Object.values(counts), 1);
    choiceDistributions.push({
      questionId: q.id,
      questionText: q.text,
      options: Object.entries(counts).map(([label, count]) => ({
        label,
        count,
        percent: totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0,
      })).sort((a, b) => b.count - a.count),
    });
  }

  const starRatings: StarRatingResult[] = [];
  for (const q of survey.questions.filter(q => q.type === 'star_rating')) {
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const scores: number[] = [];

    for (const resp of responses) {
      const ans = resp.answers[q.id];
      if (typeof ans === 'number' && ans >= 1 && ans <= 5) {
        scores.push(ans);
        distribution[ans]++;
      }
    }

    starRatings.push({
      questionId: q.id,
      questionText: q.text,
      average: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
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
    recentResponses: [...responses].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).slice(0, 10),
  };
}

export function exportResponsesToCsv(survey: Survey, responses: SurveyResponse[]): string {
  const headers = ['ID', 'Ngày gửi', ...survey.questions.map(q => q.text)];
  const rows = responses.map(r => {
      const d = new Date(r.submittedAt);
      const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      
      const cells = [
        r.id,
        dateStr,
      ...survey.questions.map(q => {
        const ans = r.answers[q.id];
        if (Array.isArray(ans)) return ans.join('; ');
        return ans !== undefined ? String(ans) : '';
      }),
    ];
    return cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
  });
  return [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','), ...rows].join('\n');
}
