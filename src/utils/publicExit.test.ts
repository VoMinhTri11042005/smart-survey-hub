import { afterEach, describe, expect, it, vi } from 'vitest';
import { leavePublicSurvey } from './publicExit';

function makeBrowser(closed: boolean, close: () => void): Pick<Window, 'close' | 'closed' | 'setTimeout'> {
  return {
    close,
    get closed() { return closed; },
    setTimeout: ((handler: TimerHandler, timeout?: number) => globalThis.setTimeout(handler, timeout) as unknown as number) as Window['setTimeout'],
  };
}

describe('leavePublicSurvey', () => {
  afterEach(() => vi.useRealTimers());

  it('attempts to close a script-opened tab before taking the fallback', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const fallback = vi.fn();

    leavePublicSurvey(fallback, makeBrowser(false, close));

    expect(close).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('does not redirect a tab that closed successfully', () => {
    vi.useFakeTimers();
    const fallback = vi.fn();

    leavePublicSurvey(fallback, makeBrowser(true, vi.fn()));
    vi.advanceTimersByTime(250);

    expect(fallback).not.toHaveBeenCalled();
  });

  it('still leaves the survey when closing a regular tab is rejected', () => {
    vi.useFakeTimers();
    const fallback = vi.fn();

    leavePublicSurvey(fallback, makeBrowser(false, () => { throw new Error('blocked'); }));
    vi.advanceTimersByTime(250);

    expect(fallback).toHaveBeenCalledOnce();
  });
});
