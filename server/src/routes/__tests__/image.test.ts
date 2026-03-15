import { describe, expect, it, beforeAll } from 'bun:test';
import { Elysia } from 'elysia';
import { imageRoute } from '../image';
import { ProviderRegistry } from '../../registry';
import type { IImageProvider, ImageRequest, ImageResponse } from '../../providers/types';

let lastRequest: ImageRequest | null = null;

const mockProvider: IImageProvider = {
  generate: async (req: ImageRequest): Promise<ImageResponse> => {
    lastRequest = req;
    return { imageDataUri: `data:image/png;base64,${btoa(req.prompt)}` };
  },
};

function buildApp() {
  const registry = new ProviderRegistry();
  registry.registerImage('mock', mockProvider);

  return new Elysia()
    .decorate('registry', registry)
    .use(imageRoute);
}

describe('POST /api/image/generate', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp();
  });

  it('returns image data URI for a valid provider', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'mock', prompt: 'a cat' }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imageDataUri).toStartWith('data:image/png;base64,');
  });

  it('returns 400 for unknown provider', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'nope', prompt: 'a cat' }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('UNKNOWN_PROVIDER');
  });

  it('passes model, aspectRatio, and resolution to the adapter', async () => {
    lastRequest = null;
    const res = await app.handle(
      new Request('http://localhost/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'mock',
          prompt: 'a cat',
          model: 'gemini-3.1-flash-image-preview',
          aspectRatio: '4:3',
          resolution: '1K',
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(lastRequest!.model).toBe('gemini-3.1-flash-image-preview');
    expect(lastRequest!.aspectRatio).toBe('4:3');
    expect(lastRequest!.resolution).toBe('1K');
  });

  it('works without optional fields (backwards compatible)', async () => {
    lastRequest = null;
    const res = await app.handle(
      new Request('http://localhost/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'mock', prompt: 'a dog' }),
      })
    );
    expect(res.status).toBe(200);
    expect(lastRequest!.model).toBeUndefined();
    expect(lastRequest!.aspectRatio).toBeUndefined();
    expect(lastRequest!.resolution).toBeUndefined();
  });

  it('returns 502 with GENERATION_FAILED when adapter throws an Error', async () => {
    const failingProvider: IImageProvider = {
      generate: async () => { throw new Error('rate limited'); },
    };
    const registry = new ProviderRegistry();
    registry.registerImage('fail', failingProvider);
    const failApp = new Elysia().decorate('registry', registry).use(imageRoute);

    const res = await failApp.handle(
      new Request('http://localhost/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'fail', prompt: 'a cat' }),
      })
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('GENERATION_FAILED');
    expect(body.error).toBe('rate limited');
  });

  it('returns 502 with Unknown error when adapter throws a non-Error', async () => {
    const failingProvider: IImageProvider = {
      generate: async () => { throw 42; },
    };
    const registry = new ProviderRegistry();
    registry.registerImage('fail', failingProvider);
    const failApp = new Elysia().decorate('registry', registry).use(imageRoute);

    const res = await failApp.handle(
      new Request('http://localhost/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'fail', prompt: 'a cat' }),
      })
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('GENERATION_FAILED');
    expect(body.error).toBe('Unknown error');
  });

  it('returns 422 when required body fields are missing', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(422);
  });
});
