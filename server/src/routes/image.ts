import { Elysia, t } from 'elysia';
import type { ProviderRegistry } from '../registry';

export const imageRoute = new Elysia()
  .post(
    '/api/image/generate',
    async ({ body, registry }) => {
      const adapter = (registry as ProviderRegistry).getImage(body.provider);

      if (!adapter) {
        return new Response(
          JSON.stringify({ error: `Unknown image provider: ${body.provider}`, code: 'UNKNOWN_PROVIDER' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      try {
        const result = await adapter.generate({
          prompt: body.prompt,
          model: body.model,
          aspectRatio: body.aspectRatio,
          resolution: body.resolution,
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
        prompt: t.String(),
        model: t.Optional(t.String()),
        aspectRatio: t.Optional(t.String()),
        resolution: t.Optional(t.String()),
      }),
    }
  );
