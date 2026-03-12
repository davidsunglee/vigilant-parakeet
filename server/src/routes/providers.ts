import { Elysia } from 'elysia';
import type { ProviderRegistry } from '../registry';

export const providersRoute = new Elysia()
  .get('/api/providers', ({ registry }) => {
    const reg = registry as ProviderRegistry;
    return {
      llm: reg.listLlmProviders(),
      image: reg.listImageProviders(),
    };
  });
