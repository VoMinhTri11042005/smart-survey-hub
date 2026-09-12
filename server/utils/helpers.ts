/**
 * Shared utility helpers for the backend.
 */

/** Generate a short random ID suitable for primary keys. */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}
