import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';

describe('GET /api/health', () => {
  it('returns { status: "ok" } with 200', async () => {
    const app = new Elysia().get('/api/health', () => ({ status: 'ok' }));

    const res = await app.handle(
      new Request('http://localhost/api/health', { method: 'GET' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
