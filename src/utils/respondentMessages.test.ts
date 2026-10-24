import { describe, expect, it } from 'vitest';
import { DEFAULT_SCREEN_OUT_MESSAGE, DEFAULT_THANK_YOU_MESSAGE, getCompletionMessage, getStarRatingLabels } from './respondentMessages';

describe('star rating labels', () => {
  it('keeps the old labels when the survey has no custom labels', () => {
    expect(getStarRatingLabels({})).toEqual({ min: 'Cần cải thiện', max: 'Tuyệt vời' });
  });

  it('uses each custom label independently and treats whitespace as empty', () => {
    expect(getStarRatingLabels({ scaleMinLabel: '  Chưa hài lòng  ', scaleMaxLabel: 'Rất hài lòng' }))
      .toEqual({ min: 'Chưa hài lòng', max: 'Rất hài lòng' });
    expect(getStarRatingLabels({ scaleMinLabel: '   ', scaleMaxLabel: 'Tốt' }))
      .toEqual({ min: 'Cần cải thiện', max: 'Tốt' });
    expect(getStarRatingLabels({ scaleMinLabel: 'Kém', scaleMaxLabel: '  ' }))
      .toEqual({ min: 'Kém', max: 'Tuyệt vời' });
  });
});

describe('completion messages', () => {
  const normal = { isScreenedOut: false, isQuiz: false };

  it('retains the existing message when no custom message exists', () => {
    expect(getCompletionMessage(normal)).toBe(DEFAULT_THANK_YOU_MESSAGE);
    expect(getCompletionMessage({ ...normal, thankYouMessage: ' \n ' })).toBe(DEFAULT_THANK_YOU_MESSAGE);
  });

  it('preserves the content and internal line breaks of a custom message', () => {
    expect(getCompletionMessage({ ...normal, thankYouMessage: ' Cảm ơn bạn!\nChúc bạn một ngày vui. ' }))
      .toBe('Cảm ơn bạn!\nChúc bạn một ngày vui.');
  });

  it('only adds a custom message to a quiz without replacing its existing score display', () => {
    expect(getCompletionMessage({ ...normal, isQuiz: true })).toBeUndefined();
    expect(getCompletionMessage({ ...normal, isQuiz: true, thankYouMessage: 'Chúc mừng bạn!' }))
      .toBe('Chúc mừng bạn!');
  });

  it('always keeps the screening notice instead of the custom completion message', () => {
    const screened = { ...normal, isScreenedOut: true, thankYouMessage: 'Thông điệp sau khi hoàn thành' };
    expect(getCompletionMessage({ ...screened, screenOutNotice: 'Thông báo sàng lọc' })).toBe('Thông báo sàng lọc');
    expect(getCompletionMessage({ ...screened, screenOutNotice: ' ' })).toBe(DEFAULT_SCREEN_OUT_MESSAGE);
  });
});
