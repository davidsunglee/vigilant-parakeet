import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { ProviderRegistry } from './registry';
import { GeminiLlmAdapter } from './providers/gemini-llm';
import { AnthropicLlmAdapter } from './providers/anthropic-llm';
import { GeminiImageAdapter } from './providers/gemini-image';
import { OpenAiLlmAdapter } from './providers/openai-llm';
import { OpenAiImageAdapter } from './providers/openai-image';
import { llmRoute } from './routes/llm';
import { imageRoute } from './routes/image';
import { providersRoute } from './routes/providers';

const registry = new ProviderRegistry();

// Register providers based on available API keys
const geminiKey = process.env.GEMINI_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

if (geminiKey) {
  registry.registerLlm('gemini', new GeminiLlmAdapter(geminiKey));
  registry.registerImage('gemini', new GeminiImageAdapter(geminiKey));
  console.log('Registered Gemini providers (LLM + Image)');
} else {
  console.warn('GEMINI_API_KEY not set — Gemini providers disabled');
}

if (anthropicKey) {
  registry.registerLlm('anthropic', new AnthropicLlmAdapter(anthropicKey));
  console.log('Registered Anthropic LLM provider');
} else {
  console.warn('ANTHROPIC_API_KEY not set — Anthropic provider disabled');
}

const openaiKey = process.env.OPENAI_API_KEY;

if (openaiKey) {
  registry.registerLlm('openai', new OpenAiLlmAdapter(openaiKey));
  registry.registerImage('openai', new OpenAiImageAdapter(openaiKey));
  console.log('Registered OpenAI providers (LLM + Image)');
} else {
  console.warn('OPENAI_API_KEY not set — OpenAI providers disabled');
}

const app = new Elysia()
  .use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }))
  .decorate('registry', registry)
  .use(llmRoute)
  .use(imageRoute)
  .use(providersRoute)
  .get('/api/health', () => ({ status: 'ok' }))
  .listen(3000);

console.log(`Proxy server running at http://localhost:${app.server?.port}`);
console.log(`Available LLM providers: ${registry.listLlmProviders().join(', ') || 'none'}`);
console.log(`Available image providers: ${registry.listImageProviders().join(', ') || 'none'}`);

export type App = typeof app;
