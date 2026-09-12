/**
 * Zod validation middleware for Express.
 */
import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Returns middleware that validates req.body against the given Zod schema.
 * On success the parsed (and type-coerced) body replaces req.body.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(result.error); // caught by errorHandler
    }
    req.body = result.data;
    next();
  };
}
