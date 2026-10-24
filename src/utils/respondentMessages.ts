import type { SurveyQuestion } from '../types';

export const DEFAULT_SCREEN_OUT_MESSAGE = 'Cảm ơn bạn đã tham gia. Dựa trên câu trả lời của bạn, bạn không thuộc đối tượng khảo sát này.';
export const DEFAULT_THANK_YOU_MESSAGE = 'Phản hồi của bạn đã được ghi nhận. Những đóng góp quý báu này sẽ giúp chúng tôi nâng cao chất lượng dịch vụ.';

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function getStarRatingLabels(question: Pick<SurveyQuestion, 'scaleMinLabel' | 'scaleMaxLabel'>) {
  return {
    min: nonEmptyText(question.scaleMinLabel) ?? 'Cần cải thiện',
    max: nonEmptyText(question.scaleMaxLabel) ?? 'Tuyệt vời',
  };
}

interface CompletionMessageOptions {
  isScreenedOut: boolean;
  isQuiz: boolean;
  screenOutNotice?: string;
  thankYouMessage?: string;
}

/** Return the message shown in addition to any quiz score, if applicable. */
export function getCompletionMessage({ isScreenedOut, isQuiz, screenOutNotice, thankYouMessage }: CompletionMessageOptions) {
  if (isScreenedOut) return nonEmptyText(screenOutNotice) ?? DEFAULT_SCREEN_OUT_MESSAGE;
  return nonEmptyText(thankYouMessage) ?? (isQuiz ? undefined : DEFAULT_THANK_YOU_MESSAGE);
}
