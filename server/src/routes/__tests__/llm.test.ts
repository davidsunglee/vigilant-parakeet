import { describe, expect, it, beforeAll } from 'bun:test';
import { Elysia } from 'elysia';
import { llmRoute } from '../llm';
import { ProviderRegistry } from '../../registry';
import type { ILlmProvider, LlmRequest, LlmResponse } from '../../providers/types';

const mockProvider: ILlmProvider = {
  generate: async (req: LlmRequest): Promise<LlmResponse> => {
    return { data: { echo: req.prompt, model: req.model ?? 'default' } };
  },
};

function buildApp() {
  const registry = new ProviderRegistry();
  registry.registerLlm('mock', mockProvider);

  return new Elysia()
    .decorate('registry', registry)
    .use(llmRoute);
}

describe('POST /api/llm/generate', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp();
  });

  it('returns generated data for a valid provider', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'mock',
          prompt: 'hello',
          responseSchema: { type: 'object', properties: {} },
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.echo).toBe('hello');
    expect(body.data.model).toBe('default');
  });

  it('passes model through to adapter', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'mock',
          model: 'custom-model',
          prompt: 'test',
          responseSchema: { type: 'object', properties: {} },
        }),
      })
    );
    const body = await res.json();
    expect(body.data.model).toBe('custom-model');
  });

  it('returns 400 for unknown provider', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'nonexistent',
          prompt: 'hello',
          responseSchema: { type: 'object', properties: {} },
        }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('UNKNOWN_PROVIDER');
  });

  it('returns 502 with GENERATION_FAILED when adapter throws an Error', async () => {
    const failingProvider: ILlmProvider = {
      generate: async () => { throw new Error('model overloaded'); },
    };
    const registry = new ProviderRegistry();
    registry.registerLlm('fail', failingProvider);
    const failApp = new Elysia().decorate('registry', registry).use(llmRoute);

    const res = await failApp.handle(
      new Request('http://localhost/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'fail',
          prompt: 'hello',
          responseSchema: { type: 'object', properties: {} },
        }),
      })
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('GENERATION_FAILED');
    expect(body.error).toBe('model overloaded');
  });

  it('returns 502 with Unknown error when adapter throws a non-Error', async () => {
    const failingProvider: ILlmProvider = {
      generate: async () => { throw 'string-error'; },
    };
    const registry = new ProviderRegistry();
    registry.registerLlm('fail', failingProvider);
    const failApp = new Elysia().decorate('registry', registry).use(llmRoute);

    const res = await failApp.handle(
      new Request('http://localhost/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'fail',
          prompt: 'hello',
          responseSchema: { type: 'object', properties: {} },
        }),
      })
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('GENERATION_FAILED');
    expect(body.error).toBe('Unknown error');
  });

  it('returns 422 when required body fields are missing', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(422);
  });
});
