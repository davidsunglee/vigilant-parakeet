import { describe, expect, it, beforeAll } from 'bun:test';
import { Elysia } from 'elysia';
import { providersRoute } from '../providers';
import { ProviderRegistry } from '../../registry';
import type { ILlmProvider, IImageProvider, LlmResponse, ImageResponse } from '../../providers/types';

const stubLlm: ILlmProvider = { generate: async () => ({ data: {} }) as LlmResponse };
const stubImage: IImageProvider = { generate: async () => ({ imageDataUri: '' }) as ImageResponse };

function buildApp() {
  const registry = new ProviderRegistry();
  registry.registerLlm('gemini', stubLlm);
  registry.registerLlm('anthropic', stubLlm);
  registry.registerImage('gemini', stubImage);

  return new Elysia()
    .decorate('registry', registry)
    .use(providersRoute);
}

describe('GET /api/providers', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp();
  });

  it('returns registered provider lists', async () => {
    const res = await app.handle(new Request('http://localhost/api/providers'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.llm).toEqual(['gemini', 'anthropic']);
    expect(body.image).toEqual(['gemini']);
  });
});
