/**
 * Browsers only allow scripts to close windows they opened themselves. Try the
 * real close first, then let the host replace the public survey when the tab
 * remains open.
 */
export function leavePublicSurvey(
  onFallback: () => void,
  browser: Pick<Window, 'close' | 'closed' | 'setTimeout'> = window,
) {
  try {
    browser.close();
  } catch {
    // A browser may reject close() for a user-opened tab; use the fallback.
  }

  browser.setTimeout(() => {
    if (!browser.closed) onFallback();
  }, 250);
}
