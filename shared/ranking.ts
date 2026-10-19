/** The minimum questionnaire shape shared by the browser and server. */
export interface RankingQuestion {
  id: string;
  type: string;
  options?: string[];
  carryForwardFromQuestionId?: string;
  sectionId?: string;
}

export interface RankingSection {
  id: string;
}

/**
 * Display carried options in their original questionnaire order. Values are
 * stored exactly as configured; only choices actually selected at the source
 * are included. This also ignores stale values from an old browser draft.
 */
export function getRankingOptions(
  question: RankingQuestion,
  questions: RankingQuestion[],
  answers: Record<string, unknown>,
): string[] {
  if (!question.carryForwardFromQuestionId) return question.options ?? [];
  const source = questions.find(item => item.id === question.carryForwardFromQuestionId && item.type === 'multiple_choice');
  const selected = answers[question.carryForwardFromQuestionId];
  if (!source || !Array.isArray(selected)) return [];
  const chosen = new Set(selected.filter((value): value is string => typeof value === 'string'));
  return (source.options ?? []).filter(option => chosen.has(option));
}

export function isRankingApplicable(question: RankingQuestion, questions: RankingQuestion[], answers: Record<string, unknown>): boolean {
  return !question.carryForwardFromQuestionId || getRankingOptions(question, questions, answers).length > 0;
}

/** Every displayed item must appear exactly once, in the respondent's order. */
export function isCompleteRanking(options: string[], value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length === options.length
    && new Set(value).size === value.length
    && value.every(item => typeof item === 'string' && options.includes(item));
}

/** Clear a saved ranking whenever its source changes; it must be confirmed again. */
export function clearDependentRankings(
  questions: RankingQuestion[],
  answers: Record<string, unknown>,
  changedQuestionId: string,
): Record<string, unknown> {
  const next = { ...answers };
  for (const question of questions) {
    if (question.type === 'ranking' && question.carryForwardFromQuestionId === changedQuestionId) {
      delete next[question.id];
    }
  }
  return next;
}

/** A restored draft can refer to options removed from the source since saving. */
export function removeInvalidRankingAnswers(questions: RankingQuestion[], answers: Record<string, unknown>): Record<string, unknown> {
  let next = { ...answers };
  const sourceIds = new Set(questions
    .filter(question => question.type === 'ranking' && question.carryForwardFromQuestionId)
    .map(question => question.carryForwardFromQuestionId));
  for (const source of questions) {
    if (source.type !== 'multiple_choice' || !sourceIds.has(source.id)) continue;
    const selected = next[source.id];
    if (!Array.isArray(selected)) continue;
    const validOptions = new Set(source.options ?? []);
    const seen = new Set<string>();
    const valid = selected.filter((value): value is string => {
      if (typeof value !== 'string' || !validOptions.has(value) || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
    if (valid.length !== selected.length) {
      next[source.id] = valid;
      next = clearDependentRankings(questions, next, source.id);
    }
  }
  for (const question of questions) {
    if (question.type !== 'ranking' || next[question.id] === undefined) continue;
    const options = getRankingOptions(question, questions, next);
    if (!options.length || !isCompleteRanking(options, next[question.id])) delete next[question.id];
  }
  return next;
}

export function moveRankingOption(options: string[], from: number, to: number): string[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= options.length || to >= options.length) return [...options];
  const next = [...options];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Find invalid references, including sources shown on a later section page. */
export function findInvalidRankingSources(questions: RankingQuestion[], sections: RankingSection[] = []): number[] {
  const sectionIndex = (question: RankingQuestion) => {
    const index = sections.findIndex(section => section.id === question.sectionId);
    return index < 0 ? 0 : index;
  };
  return questions.flatMap((question, index) => {
    if (!question.carryForwardFromQuestionId) return [];
    const sourceIndex = questions.findIndex(item => item.id === question.carryForwardFromQuestionId);
    const source = questions[sourceIndex];
    const invalid = question.type !== 'ranking'
      || sourceIndex < 0
      || sourceIndex >= index
      || source?.type !== 'multiple_choice'
      || (sections.length > 1 && sectionIndex(source) > sectionIndex(question));
    return invalid ? [index] : [];
  });
}
