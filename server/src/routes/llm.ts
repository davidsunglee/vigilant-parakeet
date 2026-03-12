import { Elysia, t } from 'elysia';
import type { ProviderRegistry } from '../registry';

export const llmRoute = new Elysia()
  .post(
    '/api/llm/generate',
    async ({ body, registry }) => {
      const adapter = (registry as ProviderRegistry).getLlm(body.provider);

      if (!adapter) {
        return new Response(
          JSON.stringify({ error: `Unknown LLM provider: ${body.provider}`, code: 'UNKNOWN_PROVIDER' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      try {
        const result = await adapter.generate({
          prompt: body.prompt,
          systemPrompt: body.systemPrompt,
          model: body.model,
          responseSchema: body.responseSchema,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return new Response(
          JSON.stringify({ error: message, code: 'GENERATION_FAILED' }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        );
      }
    },
    {
      body: t.Object({
        provider: t.String(),
        model: t.Optional(t.String()),
        prompt: t.String(),
        systemPrompt: t.Optional(t.String()),
        responseSchema: t.Any(),
      }),
    }
  );
