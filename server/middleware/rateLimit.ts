import type { NextFunction, Request, Response } from 'express';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

interface WindowCounter {
  resetAt: number;
  count: number;
}

export function createRateLimit({ windowMs, maxRequests }: RateLimitOptions) {
  const counters = new Map<string, WindowCounter>();
  let requestsSinceCleanup = 0;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let counter = counters.get(key);

    if (!counter || counter.resetAt <= now) {
      counter = { resetAt: now + windowMs, count: 0 };
      counters.set(key, counter);
    }
    counter.count++;

    requestsSinceCleanup++;
    if (requestsSinceCleanup >= 100) {
      requestsSinceCleanup = 0;
      for (const [entryKey, entry] of counters) {
        if (entry.resetAt <= now) counters.delete(entryKey);
      }
      while (counters.size > 10_000) {
        const oldestKey = counters.keys().next().value;
        if (oldestKey === undefined) break;
        counters.delete(oldestKey);
      }
    }

    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - counter.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(counter.resetAt / 1000)));
    if (counter.count > maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((counter.resetAt - now) / 1000))));
      res.status(429).json({ error: 'Bạn gửi quá nhiều phản hồi trong thời gian ngắn. Vui lòng thử lại sau.' });
      return;
    }
    next();
  };
}

export const limitPublicResponseSubmissions = createRateLimit({
  windowMs: 60_000,
  maxRequests: 15,
});
