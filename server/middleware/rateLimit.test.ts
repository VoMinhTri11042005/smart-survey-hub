import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createRateLimit } from './rateLimit';

describe('createRateLimit', () => {
  it('rejects requests after the configured limit', async () => {
    const app = express();
    app.use(createRateLimit({ windowMs: 60_000, maxRequests: 1 }));
    app.get('/', (_req, res) => res.json({ ok: true }));

    expect((await request(app).get('/')).status).toBe(200);
    const blocked = await request(app).get('/');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.body.error).toMatch(/quá nhiều/);
  });
});
