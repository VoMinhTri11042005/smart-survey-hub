/**
 * Global Express error handler middleware.
 * Must be registered AFTER all routes.
 */
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Dữ liệu không hợp lệ.',
      details: err.issues.map(e => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  console.error(`[ERROR] ${status} — ${message}`, err.stack ? `\n${err.stack}` : '');

  res.status(status).json({ error: message });
}
