import { describe, expect, it, beforeAll } from 'bun:test';
import { Elysia } from 'elysia';
import { imageRoute } from '../image';
import { ProviderRegistry } from '../../registry';
import type { IImageProvider, ImageRequest, ImageResponse } from '../../providers/types';

const mockProvider: IImageProvider = {
  generate: async (req: ImageRequest): Promise<ImageResponse> => {
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
});
