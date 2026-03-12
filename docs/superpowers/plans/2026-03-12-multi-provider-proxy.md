# Multi-Provider AI Proxy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a server-side Elysia + Bun proxy with provider adapters so the React frontend can switch LLM providers at runtime, with all API keys held server-side.

**Architecture:** New `server/` package with provider adapter pattern (ILlmProvider, IImageProvider). Two proxy routes (`/api/llm/generate`, `/api/image/generate`) plus a discovery endpoint (`/api/providers`). Frontend services rewritten as thin fetch() clients. React context for runtime provider/model selection.

**Tech Stack:** Bun runtime, Elysia framework, `@google/genai`, `@anthropic-ai/sdk`, React 18, TypeScript, Vite 5.

**Spec:** `docs/superpowers/specs/2026-03-12-multi-provider-proxy-design.md`

---

## Chunk 1: Server Scaffold & Provider Interfaces

### Task 1: Initialize the Bun + Elysia server project

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`
- Create: `server/src/index.ts`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "apex-proxy",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "elysia": "^1.2.25",
    "@elysiajs/cors": "^1.2.0",
    "@google/genai": "^1.42.0",
    "@anthropic-ai/sdk": "^0.39.0"
  },
  "devDependencies": {
    "@types/bun": "^1.2.10"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `server/.env.example`**

```
GEMINI_API_KEY=your_gemini_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

- [ ] **Step 4: Create minimal `server/src/index.ts`**

```typescript
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';

const app = new Elysia()
  .use(cors({ origin: 'http://localhost:5173' }))
  .get('/api/health', () => ({ status: 'ok' }))
  .listen(3000);

console.log(`Proxy server running at http://localhost:${app.server?.port}`);

export type App = typeof app;
```

- [ ] **Step 5: Install dependencies and verify server starts**

Run: `cd server && bun install && bun run src/index.ts`
Expected: `Proxy server running at http://localhost:3000`
Kill the process after confirming.

- [ ] **Step 6: Verify health endpoint**

Run: `cd server && bun run src/index.ts & sleep 1 && curl http://localhost:3000/api/health && kill %1`
Expected: `{"status":"ok"}`

- [ ] **Step 7: Commit**

```bash
git add server/
git commit -m "feat: scaffold Elysia + Bun proxy server"
```

---

### Task 2: Define provider interfaces and types

**Files:**
- Create: `server/src/providers/types.ts`

- [ ] **Step 1: Write the test**

Create `server/src/providers/__tests__/types.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import type { LlmRequest, LlmResponse, ImageRequest, ImageResponse, ILlmProvider, IImageProvider } from '../types';

describe('Provider types', () => {
  it('LlmRequest accepts valid shape', () => {
    const req: LlmRequest = {
      prompt: 'test',
      responseSchema: { type: 'object', properties: {} },
    };
    expect(req.prompt).toBe('test');
    expect(req.model).toBeUndefined();
    expect(req.systemPrompt).toBeUndefined();
  });

  it('LlmRequest accepts optional fields', () => {
    const req: LlmRequest = {
      prompt: 'test',
      model: 'claude-opus-4-6',
      systemPrompt: 'You are helpful.',
      responseSchema: { type: 'object', properties: {} },
    };
    expect(req.model).toBe('claude-opus-4-6');
    expect(req.systemPrompt).toBe('You are helpful.');
  });

  it('ILlmProvider shape is implementable', () => {
    const mock: ILlmProvider = {
      generate: async (req: LlmRequest): Promise<LlmResponse> => {
        return { data: { result: req.prompt } };
      },
    };
    expect(mock.generate).toBeDefined();
  });

  it('IImageProvider shape is implementable', () => {
    const mock: IImageProvider = {
      generate: async (req: ImageRequest): Promise<ImageResponse> => {
        return { imageDataUri: `data:image/png;base64,${req.prompt}` };
      },
    };
    expect(mock.generate).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && bun test src/providers/__tests__/types.test.ts`
Expected: FAIL — cannot find module `../types`

- [ ] **Step 3: Write the implementation**

Create `server/src/providers/types.ts`:

```typescript
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: string[];
}

export interface LlmRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  responseSchema: JsonSchema;
}

export interface LlmResponse {
  data: Record<string, unknown>;
}

export interface ImageRequest {
  prompt: string;
}

export interface ImageResponse {
  imageDataUri: string;
}

export interface ILlmProvider {
  generate(request: LlmRequest): Promise<LlmResponse>;
}

export interface IImageProvider {
  generate(request: ImageRequest): Promise<ImageResponse>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && bun test src/providers/__tests__/types.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/providers/
git commit -m "feat: add provider interfaces and types"
```

---

### Task 3: Implement provider registry

**Files:**
- Create: `server/src/registry.ts`

- [ ] **Step 1: Write the test**

Create `server/src/__tests__/registry.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'bun:test';
import { ProviderRegistry } from '../registry';
import type { ILlmProvider, IImageProvider, LlmRequest, LlmResponse, ImageRequest, ImageResponse } from '../providers/types';

const mockLlm: ILlmProvider = {
  generate: async (req: LlmRequest): Promise<LlmResponse> => ({ data: { echo: req.prompt } }),
};

const mockImage: IImageProvider = {
  generate: async (req: ImageRequest): Promise<ImageResponse> => ({ imageDataUri: `data:image/png;base64,${req.prompt}` }),
};

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('registers and retrieves an LLM provider', () => {
    registry.registerLlm('test', mockLlm);
    expect(registry.getLlm('test')).toBe(mockLlm);
  });

  it('returns undefined for unknown LLM provider', () => {
    expect(registry.getLlm('nope')).toBeUndefined();
  });

  it('registers and retrieves an image provider', () => {
    registry.registerImage('test', mockImage);
    expect(registry.getImage('test')).toBe(mockImage);
  });

  it('returns undefined for unknown image provider', () => {
    expect(registry.getImage('nope')).toBeUndefined();
  });

  it('lists registered LLM provider names', () => {
    registry.registerLlm('gemini', mockLlm);
    registry.registerLlm('anthropic', mockLlm);
    expect(registry.listLlmProviders()).toEqual(['gemini', 'anthropic']);
  });

  it('lists registered image provider names', () => {
    registry.registerImage('gemini', mockImage);
    expect(registry.listImageProviders()).toEqual(['gemini']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && bun test src/__tests__/registry.test.ts`
Expected: FAIL — cannot find module `../registry`

- [ ] **Step 3: Write the implementation**

Create `server/src/registry.ts`:

```typescript
import type { ILlmProvider, IImageProvider } from './providers/types';

export class ProviderRegistry {
  private llmProviders = new Map<string, ILlmProvider>();
  private imageProviders = new Map<string, IImageProvider>();

  registerLlm(name: string, provider: ILlmProvider): void {
    this.llmProviders.set(name, provider);
  }

  registerImage(name: string, provider: IImageProvider): void {
    this.imageProviders.set(name, provider);
  }

  getLlm(name: string): ILlmProvider | undefined {
    return this.llmProviders.get(name);
  }

  getImage(name: string): IImageProvider | undefined {
    return this.imageProviders.get(name);
  }

  listLlmProviders(): string[] {
    return [...this.llmProviders.keys()];
  }

  listImageProviders(): string[] {
    return [...this.imageProviders.keys()];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && bun test src/__tests__/registry.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/registry.ts server/src/__tests__/registry.test.ts
git commit -m "feat: add provider registry"
```

---

## Chunk 2: Provider Adapters

### Task 4: Implement GeminiLlmAdapter

**Files:**
- Create: `server/src/providers/gemini-llm.ts`

This adapter translates standard JSON Schema to Google's `Type.*` enum format and calls the Gemini API.

- [ ] **Step 1: Write the test**

Create `server/src/providers/__tests__/gemini-llm.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { GeminiLlmAdapter, convertJsonSchemaToGemini } from '../gemini-llm';
import type { LlmRequest } from '../types';

describe('convertJsonSchemaToGemini', () => {
  it('converts a flat object schema', () => {
    const input = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'string' },
      },
      required: ['name', 'age'],
    };
    const result = convertJsonSchemaToGemini(input);
    expect(result.type).toBe('OBJECT');
    expect(result.properties.name.type).toBe('STRING');
    expect(result.properties.age.type).toBe('STRING');
    expect(result.required).toEqual(['name', 'age']);
  });

  it('converts an array schema with object items', () => {
    const input = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          active: { type: 'boolean' },
        },
        required: ['label'],
      },
    };
    const result = convertJsonSchemaToGemini(input);
    expect(result.type).toBe('ARRAY');
    expect(result.items.type).toBe('OBJECT');
    expect(result.items.properties.label.type).toBe('STRING');
    expect(result.items.properties.active.type).toBe('BOOLEAN');
  });

  it('converts nested object schema', () => {
    const input = {
      type: 'object',
      properties: {
        page: {
          type: 'object',
          properties: {
            bodyText: { type: 'string' },
          },
          required: ['bodyText'],
        },
      },
      required: ['page'],
    };
    const result = convertJsonSchemaToGemini(input);
    expect(result.properties.page.type).toBe('OBJECT');
    expect(result.properties.page.properties.bodyText.type).toBe('STRING');
  });

  it('preserves description field', () => {
    const input = {
      type: 'string',
      description: 'A fun fact',
    };
    const result = convertJsonSchemaToGemini(input);
    expect(result.type).toBe('STRING');
    expect(result.description).toBe('A fun fact');
  });
});

describe('GeminiLlmAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new GeminiLlmAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new GeminiLlmAdapter('')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && bun test src/providers/__tests__/gemini-llm.test.ts`
Expected: FAIL — cannot find module `../gemini-llm`

- [ ] **Step 3: Write the implementation**

Create `server/src/providers/gemini-llm.ts`:

```typescript
import { GoogleGenAI, Type } from '@google/genai';
import type { ILlmProvider, LlmRequest, LlmResponse, JsonSchema } from './types';

const TYPE_MAP: Record<string, string> = {
  object: Type.OBJECT,
  string: Type.STRING,
  array: Type.ARRAY,
  boolean: Type.BOOLEAN,
  number: Type.NUMBER,
  integer: Type.INTEGER,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertJsonSchemaToGemini(schema: JsonSchema): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {
    type: TYPE_MAP[schema.type] ?? schema.type,
  };

  if (schema.description) {
    result.description = schema.description;
  }

  if (schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      result.properties[key] = convertJsonSchemaToGemini(value);
    }
  }

  if (schema.items) {
    result.items = convertJsonSchemaToGemini(schema.items);
  }

  if (schema.required) {
    result.required = schema.required;
  }

  if (schema.enum) {
    result.enum = schema.enum;
  }

  return result;
}

const DEFAULT_MODEL = 'gemini-3-flash-preview';

export class GeminiLlmAdapter implements ILlmProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Gemini API key is required');
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const model = request.model ?? DEFAULT_MODEL;
    const geminiSchema = convertJsonSchemaToGemini(request.responseSchema);

    const response = await this.client.models.generateContent({
      model,
      contents: request.prompt,
      config: {
        systemInstruction: request.systemPrompt || undefined,
        responseMimeType: 'application/json',
        responseSchema: geminiSchema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned no text (content may have been blocked by safety filters)');
    }
    const data = JSON.parse(text);
    return { data };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && bun test src/providers/__tests__/gemini-llm.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/providers/gemini-llm.ts server/src/providers/__tests__/gemini-llm.test.ts
git commit -m "feat: add Gemini LLM adapter with JSON Schema conversion"
```

---

### Task 5: Implement AnthropicLlmAdapter

**Files:**
- Create: `server/src/providers/anthropic-llm.ts`

This adapter uses Anthropic's tool_use pattern for structured output: it defines a tool whose `input_schema` is the JSON Schema, instructs the model to call it, and extracts the tool call arguments.

- [ ] **Step 1: Write the test**

Create `server/src/providers/__tests__/anthropic-llm.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { AnthropicLlmAdapter } from '../anthropic-llm';

describe('AnthropicLlmAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new AnthropicLlmAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new AnthropicLlmAdapter('')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && bun test src/providers/__tests__/anthropic-llm.test.ts`
Expected: FAIL — cannot find module `../anthropic-llm`

- [ ] **Step 3: Write the implementation**

Create `server/src/providers/anthropic-llm.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { ILlmProvider, LlmRequest, LlmResponse } from './types';

const DEFAULT_MODEL = 'claude-opus-4-6';
const TOOL_NAME = 'structured_output';

export class AnthropicLlmAdapter implements ILlmProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Anthropic API key is required');
    this.client = new Anthropic({ apiKey });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const model = request.model ?? DEFAULT_MODEL;

    const response = await this.client.messages.create({
      model,
      max_tokens: 4096,
      system: request.systemPrompt ?? '',
      messages: [
        {
          role: 'user',
          content: `${request.prompt}\n\nYou MUST respond by calling the "${TOOL_NAME}" tool with the requested data. Do not include any other text.`,
        },
      ],
      tools: [
        {
          name: TOOL_NAME,
          description: 'Return structured data matching the required schema.',
          input_schema: request.responseSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
    });

    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolBlock) {
      throw new Error('Anthropic response did not contain a tool_use block');
    }

    return { data: toolBlock.input as Record<string, unknown> };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && bun test src/providers/__tests__/anthropic-llm.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/providers/anthropic-llm.ts server/src/providers/__tests__/anthropic-llm.test.ts
git commit -m "feat: add Anthropic LLM adapter with tool_use structured output"
```

---

### Task 6: Implement GeminiImageAdapter

**Files:**
- Create: `server/src/providers/gemini-image.ts`

This adapter moves the existing `ImageService` logic (from `apex/src/services/ImageService.ts`) server-side. The prompt is received as-is from the frontend — the adapter does not add style prefixes.

- [ ] **Step 1: Write the test**

Create `server/src/providers/__tests__/gemini-image.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { GeminiImageAdapter } from '../gemini-image';

describe('GeminiImageAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new GeminiImageAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new GeminiImageAdapter('')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && bun test src/providers/__tests__/gemini-image.test.ts`
Expected: FAIL — cannot find module `../gemini-image`

- [ ] **Step 3: Write the implementation**

Create `server/src/providers/gemini-image.ts`:

```typescript
import { GoogleGenAI } from '@google/genai';
import type { IImageProvider, ImageRequest, ImageResponse } from './types';

const DEFAULT_MODEL = 'gemini-2.5-flash-image';

export class GeminiImageAdapter implements IImageProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Gemini API key is required');
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(request: ImageRequest): Promise<ImageResponse> {
    const response = await this.client.models.generateContent({
      model: DEFAULT_MODEL,
      contents: request.prompt,
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content?.parts;
      if (parts) {
        for (const part of parts) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = part as any;
          if (p.inlineData?.data) {
            const mimeType = p.inlineData.mimeType || 'image/png';
            return { imageDataUri: `data:${mimeType};base64,${p.inlineData.data}` };
          }
        }
      }
    }

    throw new Error('No image data in Gemini response');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && bun test src/providers/__tests__/gemini-image.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/providers/gemini-image.ts server/src/providers/__tests__/gemini-image.test.ts
git commit -m "feat: add Gemini image adapter"
```

---

## Chunk 3: Routes & Server Wiring

### Task 7: Implement the LLM route

**Files:**
- Create: `server/src/routes/llm.ts`

The route extracts `provider` from the body, looks up the adapter in the registry, and forwards the remaining fields as an `LlmRequest`.

- [ ] **Step 1: Write the test**

Create `server/src/routes/__tests__/llm.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && bun test src/routes/__tests__/llm.test.ts`
Expected: FAIL — cannot find module `../llm`

- [ ] **Step 3: Write the implementation**

Create `server/src/routes/llm.ts`:

```typescript
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
```

> **Note:** Elysia's `.decorate()` injects values directly into the handler context object — not into `store`. Routes access `registry` as a destructured property of the context. The `as ProviderRegistry` cast is needed because the route plugin doesn't know the parent app's decorations at definition time.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && bun test src/routes/__tests__/llm.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/llm.ts server/src/routes/__tests__/llm.test.ts
git commit -m "feat: add LLM generation route"
```

---

### Task 8: Implement the image route

**Files:**
- Create: `server/src/routes/image.ts`

- [ ] **Step 1: Write the test**

Create `server/src/routes/__tests__/image.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && bun test src/routes/__tests__/image.test.ts`
Expected: FAIL — cannot find module `../image`

- [ ] **Step 3: Write the implementation**

Create `server/src/routes/image.ts`:

```typescript
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
        const result = await adapter.generate({ prompt: body.prompt });
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
      }),
    }
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && bun test src/routes/__tests__/image.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/image.ts server/src/routes/__tests__/image.test.ts
git commit -m "feat: add image generation route"
```

---

### Task 9: Implement the providers discovery route

**Files:**
- Create: `server/src/routes/providers.ts`

- [ ] **Step 1: Write the test**

Create `server/src/routes/__tests__/providers.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && bun test src/routes/__tests__/providers.test.ts`
Expected: FAIL — cannot find module `../providers`

- [ ] **Step 3: Write the implementation**

Create `server/src/routes/providers.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && bun test src/routes/__tests__/providers.test.ts`
Expected: 1 test PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/providers.ts server/src/routes/__tests__/providers.test.ts
git commit -m "feat: add providers discovery route"
```

---

### Task 10: Wire up `index.ts` — register adapters and mount routes

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Rewrite `server/src/index.ts`**

```typescript
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { ProviderRegistry } from './registry';
import { GeminiLlmAdapter } from './providers/gemini-llm';
import { AnthropicLlmAdapter } from './providers/anthropic-llm';
import { GeminiImageAdapter } from './providers/gemini-image';
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

const app = new Elysia()
  .use(cors({ origin: 'http://localhost:5173' }))
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
```

- [ ] **Step 2: Verify server starts and reports providers**

Run: `cd server && GEMINI_API_KEY=test ANTHROPIC_API_KEY=test bun run src/index.ts`
Expected output includes:
- `Registered Gemini providers (LLM + Image)`
- `Registered Anthropic LLM provider`
- `Proxy server running at http://localhost:3000`
Kill the process after confirming.

- [ ] **Step 3: Run all server tests**

Run: `cd server && bun test`
Expected: All tests pass (types, registry, routes).

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: wire up server — register adapters and mount routes"
```

---

## Chunk 4: Frontend Changes

### Task 11: Create AiConfigContext

**Files:**
- Create: `apex/src/contexts/AiConfigContext.tsx`

- [ ] **Step 1: Create the context**

Create `apex/src/contexts/AiConfigContext.tsx`:

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface AiConfig {
  llmProvider: string;
  llmModel?: string;
  imageProvider: string;
}

interface AiConfigContextValue {
  config: AiConfig;
  setConfig: (config: AiConfig) => void;
  availableProviders: { llm: string[]; image: string[] };
}

const defaultConfig: AiConfig = {
  llmProvider: 'gemini',
  imageProvider: 'gemini',
};

const AiConfigContext = createContext<AiConfigContextValue>({
  config: defaultConfig,
  setConfig: () => {},
  availableProviders: { llm: [], image: [] },
});

export function AiConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AiConfig>(defaultConfig);
  const [availableProviders, setAvailableProviders] = useState<{ llm: string[]; image: string[] }>({
    llm: [],
    image: [],
  });

  useEffect(() => {
    fetch('/api/providers')
      .then((res) => res.json())
      .then((data) => setAvailableProviders(data))
      .catch((err) => console.error('Failed to fetch providers:', err));
  }, []);

  return (
    <AiConfigContext.Provider value={{ config, setConfig, availableProviders }}>
      {children}
    </AiConfigContext.Provider>
  );
}

export function useAiConfig() {
  return useContext(AiConfigContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add apex/src/contexts/AiConfigContext.tsx
git commit -m "feat: add AiConfigContext for runtime provider selection"
```

---

### Task 12: Wrap App in AiConfigProvider

**Files:**
- Modify: `apex/src/App.tsx`

- [ ] **Step 1: Edit `apex/src/App.tsx`**

Add import and wrap existing JSX:

```tsx
import { useState } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { BookViewer } from './components/book/BookViewer.tsx';
import { AiConfigProvider } from './contexts/AiConfigContext';

function App() {
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);

  return (
    <AiConfigProvider>
      <main>
        {currentStoryId ? (
          <BookViewer storyId={currentStoryId} onClose={() => setCurrentStoryId(null)} />
        ) : (
          <Dashboard onReadStory={setCurrentStoryId} />
        )}
      </main>
    </AiConfigProvider>
  );
}

export default App;
```

- [ ] **Step 2: Commit**

```bash
git add apex/src/App.tsx
git commit -m "feat: wrap App in AiConfigProvider"
```

---

### Task 13: Rewrite LlmService as a fetch client

**Files:**
- Modify: `apex/src/services/LlmService.ts`

This is the core rewrite. Each method gains `config: AiConfig` as its first param. The Google SDK calls become `fetch()` calls to the proxy. Schemas are rewritten from `Type.*` enums to standard JSON Schema.

- [ ] **Step 1: Rewrite `apex/src/services/LlmService.ts`**

```typescript
import type { AiConfig } from '../contexts/AiConfigContext';
import { IAnimalEntity, ITraitChecklist } from '../types/story.types';

async function callLlm(config: AiConfig, prompt: string, responseSchema: object, systemPrompt?: string) {
    const res = await fetch('/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: config.llmProvider,
            model: config.llmModel,
            prompt,
            systemPrompt,
            responseSchema,
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `LLM request failed: ${res.status}`);
    }

    const body = await res.json();
    return body.data;
}

export class LlmService {
    static async getAnimalProfile(config: AiConfig, animalName: string): Promise<Omit<IAnimalEntity, 'id' | 'commonName'>> {
        const data = await callLlm(config, `Provide biological stats and habitat for the animal: ${animalName}`, {
            type: 'object',
            properties: {
                scientificName: { type: 'string' },
                weight: { type: 'string' },
                length: { type: 'string' },
                speed: { type: 'string' },
                weaponry: { type: 'string' },
                armor: { type: 'string' },
                brainSize: { type: 'string' },
                habitat: { type: 'string' },
            },
            required: ['scientificName', 'weight', 'length', 'speed', 'weaponry', 'armor', 'brainSize', 'habitat'],
        });

        return {
            scientificName: data.scientificName || 'Unknown',
            habitat: data.habitat || 'Unknown',
            stats: {
                weight: data.weight || 'Unknown',
                length: data.length || 'Unknown',
                speed: data.speed || 'Unknown',
                weaponry: data.weaponry || 'Unknown',
                armor: data.armor || 'Unknown',
                brainSize: data.brainSize || 'Unknown',
            },
        };
    }

    static async getAspectsForAnimal(config: AiConfig, animal: IAnimalEntity, aspects: string[]) {
        const data = await callLlm(config, `Write an engaging, educational children's book page (about 2-3 sentences max) for each of the provided aspects for the animal: ${animal.commonName}. Provide a highly descriptive visual prompt for an image for the page.

Fun fact rules:
- Include a fun fact on AT MOST 3 out of the ${aspects.length} pages — pick only the most genuinely surprising and fascinating facts.
- Each fun fact must be a single sentence, different from the main body text, and relevant to that page's specific aspect.
- Spread the fun facts out: place them across early, middle, and late aspects (not clustered together).
- If fewer than 3 facts are truly interesting, include fewer. Do not force any.

Generate exactly one array item for each aspect provided, strictly in the same order. Aspects: \n\n${aspects.join('\n')}`, {
            type: 'array',
            description: 'Array of aspects matching the provided list in order',
            items: {
                type: 'object',
                properties: {
                    aspectName: { type: 'string' },
                    bodyText: { type: 'string' },
                    visualPrompt: { type: 'string' },
                    funFact: { type: 'string', description: 'Optional: a short, surprising fun fact different from bodyText. Omit if nothing genuinely interesting.' },
                },
                required: ['aspectName', 'bodyText', 'visualPrompt'],
            },
        });

        return data as Array<{ aspectName: string; bodyText: string; visualPrompt: string; funFact?: string }>;
    }

    static async getShowdownAndOutcome(
        config: AiConfig,
        animalA: IAnimalEntity,
        animalB: IAnimalEntity,
        isSurpriseEnding: boolean,
        endingType: string,
        winnerId: string
    ) {
        const winnerName = winnerId === 'animalA' ? animalA.commonName : (winnerId === 'animalB' ? animalB.commonName : 'Neither');
        const prompt = `Two animals are facing off: ${animalA.commonName} and ${animalB.commonName}.

They will be compared on Speed, Strength, Intelligence, and Armor. Determine who has the advantage for each.
Then, write a logical reasoning for the outcome of the battle.
The determined winner is: ${winnerName}.
Is it a surprise ending? ${isSurpriseEnding}. If yes, the ending type is: ${endingType}.

Provide the checklist advantages, the logical reasoning, and then provide the body text and visual prompt for the "Showdown" page (right before the fight) and the "Outcome" page (the result of the fight). Keep body texts engaging for children (2-3 sentences max).`;

        const data = await callLlm(config, prompt, {
            type: 'object',
            properties: {
                checklistItems: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            traitName: { type: 'string' },
                            animalAAdvantage: { type: 'boolean' },
                            animalBAdvantage: { type: 'boolean' },
                        },
                        required: ['traitName', 'animalAAdvantage', 'animalBAdvantage'],
                    },
                },
                logicalReasoning: { type: 'string' },
                showdownPage: {
                    type: 'object',
                    properties: {
                        bodyText: { type: 'string' },
                        visualPrompt: { type: 'string' },
                    },
                    required: ['bodyText', 'visualPrompt'],
                },
                outcomePage: {
                    type: 'object',
                    properties: {
                        bodyText: { type: 'string' },
                        visualPrompt: { type: 'string' },
                    },
                    required: ['bodyText', 'visualPrompt'],
                },
            },
            required: ['checklistItems', 'logicalReasoning', 'showdownPage', 'outcomePage'],
        });

        return {
            checklist: { items: data.checklistItems } as ITraitChecklist,
            logicalReasoning: data.logicalReasoning as string,
            showdownText: data.showdownPage as { bodyText: string; visualPrompt: string },
            outcomeText: data.outcomePage as { bodyText: string; visualPrompt: string },
        };
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apex/src/services/LlmService.ts
git commit -m "feat: rewrite LlmService as proxy fetch client"
```

---

### Task 14: Rewrite ImageService as a fetch client

**Files:**
- Modify: `apex/src/services/ImageService.ts`

- [ ] **Step 1: Rewrite `apex/src/services/ImageService.ts`**

```typescript
import type { AiConfig } from '../contexts/AiConfigContext';

export class ImageService {
    static async generateImage(config: AiConfig, prompt: string): Promise<string> {
        const styledPrompt = `Generate an illustration in a children's educational book style: ${prompt}`;

        try {
            const res = await fetch('/api/image/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: config.imageProvider,
                    prompt: styledPrompt,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: res.statusText }));
                console.error('[ImageService] Generation failed:', err.error);
                return '';
            }

            const body = await res.json();
            return body.imageDataUri || '';
        } catch (error) {
            console.error('[ImageService] Generation failed:', error);
            return '';
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apex/src/services/ImageService.ts
git commit -m "feat: rewrite ImageService as proxy fetch client"
```

---

### Task 15: Thread AiConfig through StoryGeneratorService

**Files:**
- Modify: `apex/src/services/StoryGeneratorService.ts`

The only change: `generateStory()` gains `config: AiConfig` as its first parameter and passes it to every `LlmService` and `ImageService` call.

- [ ] **Step 1: Edit `StoryGeneratorService.ts`**

Add import and thread config through all service calls. The full file becomes:

```typescript
import { v4 as uuidv4 } from 'uuid';
import type { AiConfig } from '../contexts/AiConfigContext';
import { IStoryManifest, IBattleOutcome, IAnimalEntity, IPageContent } from '../types/story.types';
import { LlmService } from './LlmService';
import { ImageService } from './ImageService';

export class StoryGeneratorService {
    static async generateStory(config: AiConfig, animalAQuery: string, animalBQuery: string): Promise<IStoryManifest> {
        // 1. Fetch Biology Profiles
        const [profileA, profileB] = await Promise.all([
            LlmService.getAnimalProfile(config, animalAQuery),
            LlmService.getAnimalProfile(config, animalBQuery)
        ]);

        const animalA: IAnimalEntity = { id: 'animalA', commonName: animalAQuery, ...profileA };
        const animalB: IAnimalEntity = { id: 'animalB', commonName: animalBQuery, ...profileB };

        // 2. Determine Outcome Type internally
        const isSurpriseEnding = this.rollForSurpriseEnding();
        const endingType = this.determineEndingType(isSurpriseEnding);
        const winnerId = isSurpriseEnding ? 'none' : (Math.random() > 0.5 ? 'animalA' : 'animalB');

        // 3. Generate Battle Outcome and Checklist from LLM
        const outcomeData = await LlmService.getShowdownAndOutcome(
            config,
            animalA,
            animalB,
            isSurpriseEnding,
            endingType,
            winnerId
        );

        const outcome: IBattleOutcome = {
            winnerId,
            logicalReasoning: outcomeData.logicalReasoning,
            isSurpriseEnding,
            endingType
        };

        const aspects = [
            'Scientific Classification',
            'Natural Habitat',
            'Size & Weight',
            'Hunting & Diet',
            'Social Behavior',
            'Senses: Sight, Hearing & Smell',
            'Weapons & Offense',
            'Defenses & Armor',
            'Speed & Agility',
            'Intelligence & Anatomy',
            'Secret Weapons',
            'Overall Threat Level'
        ];

        // 4. Generate Page Descriptions from LLM
        const [aspectsA, aspectsB] = await Promise.all([
            LlmService.getAspectsForAnimal(config, animalA, aspects),
            LlmService.getAspectsForAnimal(config, animalB, aspects)
        ]);

        const rawPages = [];

        // Combine aspects into page pairs
        for (let i = 0; i < 12; i++) {
            const aspectA = aspectsA[i];
            const aspectB = aspectsB[i];

            rawPages.push({
                index: i * 2 + 1,
                title: aspectA.aspectName,
                bodyText: aspectA.bodyText,
                visualPrompt: aspectA.visualPrompt,
                funFact: aspectA.funFact,
                isLeftPage: true
            });

            rawPages.push({
                index: i * 2 + 2,
                title: '',
                bodyText: aspectB.bodyText,
                visualPrompt: aspectB.visualPrompt,
                funFact: aspectB.funFact,
                isLeftPage: false
            });
        }

        // Add Showdown and Outcome pages
        rawPages.push({
            index: 31,
            title: 'The Showdown',
            bodyText: outcomeData.showdownText.bodyText,
            visualPrompt: outcomeData.showdownText.visualPrompt,
            isLeftPage: true
        });

        rawPages.push({
            index: 32,
            title: 'Outcome',
            bodyText: outcomeData.outcomeText.bodyText,
            visualPrompt: outcomeData.outcomeText.visualPrompt,
            isLeftPage: false
        });

        // 5. Generate Images Concurrently (Chunked to prevent ratelimits)
        const chunkedImageGen = async (pages: IPageContent[], chunkSize: number = 4) => {
            const results = [];
            for (let i = 0; i < pages.length; i += chunkSize) {
                const chunk = pages.slice(i, i + chunkSize);
                console.log(`Generating images for chunk ${i / chunkSize + 1}`);
                const chunkResults = await Promise.all(chunk.map(async p => {
                    const imageUrl = await ImageService.generateImage(config, p.visualPrompt);
                    return { ...p, imageUrl };
                }));
                results.push(...chunkResults);
            }
            return results;
        };

        const finalPages = await chunkedImageGen(rawPages, 4);

        // 6. Generate Cover Image
        console.log('Generating cover image...');
        const coverPrompt = `A dramatic, dynamic children's book cover illustration showing a ${animalAQuery} and a ${animalBQuery} facing each other in an epic standoff. The scene should be intense and exciting, with both animals looking powerful and ready for battle. Bold, vibrant colors with an action-packed composition. No text in the image.`;
        const coverImageUrl = await ImageService.generateImage(config, coverPrompt);

        const manifest: IStoryManifest = {
            metadata: {
                id: uuidv4(),
                title: `Who Would Win? ${animalAQuery} vs. ${animalBQuery}`,
                createdAt: Date.now(),
                hasBeenRead: false
            },
            animalA,
            animalB,
            coverImageUrl,
            checklist: outcomeData.checklist,
            outcome,
            pages: finalPages
        };

        return manifest;
    }

    private static rollForSurpriseEnding(): boolean {
        const roll = Math.floor(Math.random() * 7) + 1;
        return roll === 7;
    }

    private static determineEndingType(isSurprise: boolean): IBattleOutcome['endingType'] {
        if (!isSurprise) return 'Standard Victory';
        const types: Array<IBattleOutcome['endingType']> = [
            'External Event',
            'Trait-Based Retreat',
            'The Bigger Fish',
            'Mutual Neutrality'
        ];
        return types[Math.floor(Math.random() * types.length)];
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apex/src/services/StoryGeneratorService.ts
git commit -m "feat: thread AiConfig through StoryGeneratorService"
```

---

### Task 16: Wire Dashboard to use AiConfig and add provider dropdown

**Files:**
- Modify: `apex/src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Edit Dashboard.tsx**

Add the `useAiConfig` import, read config from context, pass it to `StoryGeneratorService`, and add a provider selector UI. The changes are:

1. Add import at top:

```typescript
import { useAiConfig } from '../../contexts/AiConfigContext';
```

2. Inside the component function, after existing state declarations, add:

```typescript
const { config, setConfig, availableProviders } = useAiConfig();
```

3. Change the `handleGenerate` call from:

```typescript
const newStory = await StoryGeneratorService.generateStory(animalA.trim(), animalB.trim());
```

to:

```typescript
const newStory = await StoryGeneratorService.generateStory(config, animalA.trim(), animalB.trim());
```

4. Add a provider selector inside the `generator-section` div, after the `<h2>Create a New Story</h2>` and before the `<form>`:

```tsx
{availableProviders.llm.length > 1 && (
    <div className="provider-selector">
        <label htmlFor="llm-provider">AI Model:</label>
        <select
            id="llm-provider"
            value={config.llmProvider}
            onChange={(e) => setConfig({ ...config, llmProvider: e.target.value })}
            disabled={isGenerating}
        >
            {availableProviders.llm.map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
        </select>
    </div>
)}
```

- [ ] **Step 2: Add CSS for the provider selector**

Add to `apex/src/index.css`, in the generator section styles:

```css
.provider-selector {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
}

.provider-selector label {
    font-size: 0.9rem;
    color: var(--text-secondary, #a0a0a0);
}

.provider-selector select {
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    border: 1px solid var(--border-color, #333);
    background: var(--input-bg, #1a1d26);
    color: var(--text-primary, #e0e0e0);
    font-size: 0.9rem;
}
```

- [ ] **Step 3: Commit**

```bash
git add apex/src/components/dashboard/Dashboard.tsx apex/src/index.css
git commit -m "feat: wire Dashboard to AiConfig with provider dropdown"
```

---

## Chunk 5: Cleanup & Integration

### Task 17: Update Vite proxy config

**Files:**
- Modify: `apex/vite.config.ts`

- [ ] **Step 1: Edit `apex/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add apex/vite.config.ts
git commit -m "feat: add Vite proxy for /api to Elysia server"
```

---

### Task 18: Remove @google/genai from frontend dependencies

**Files:**
- Modify: `apex/package.json`

- [ ] **Step 1: Remove the dependency**

Run: `cd apex && npm uninstall @google/genai`

- [ ] **Step 2: Verify the app still compiles**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors (all Google SDK references have been removed from the frontend).

- [ ] **Step 3: Commit**

```bash
git add apex/package.json apex/package-lock.json
git commit -m "chore: remove @google/genai from frontend dependencies"
```

---

### Task 19: Create server .env and add .gitignore entry

**Files:**
- Create: `server/.env` (from `.env.example`, with real keys)
- Modify: `.gitignore`

- [ ] **Step 1: Copy .env.example to .env**

Run: `cp server/.env.example server/.env`
Then manually add real API keys.

- [ ] **Step 2: Create root-level `.gitignore` covering server secrets**

The existing `.gitignore` lives at `apex/.gitignore` and only covers paths under `apex/`. Create a root-level `.gitignore` to cover the server:

```
# Server secrets
server/.env
```

> **Important:** `apex/.gitignore` cannot cover `server/.env` — `.gitignore` scope is limited to its own directory tree.

- [ ] **Step 3: Remove old `apex/.env` if it exists**

The Gemini API key is now server-side. If `apex/.env` still exists with `VITE_GEMINI_API_KEY`, it can be deleted since nothing reads it anymore.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore server .env, remove stale apex .env"
```

---

### Task 20: End-to-end smoke test

**Files:** None (manual verification)

- [ ] **Step 1: Start the server**

Run: `cd server && bun run dev`
Expected: Server starts, logs registered providers.

- [ ] **Step 2: Start the frontend**

Run: `cd apex && npm run dev`
Expected: Vite dev server starts on `:5173`.

- [ ] **Step 3: Verify `/api/providers` returns expected data**

Open `http://localhost:5173/api/providers` in browser.
Expected: JSON with `llm` and `image` arrays listing available providers.

- [ ] **Step 4: Generate a story with Gemini (default)**

Use the UI to create a story with two animals. Verify:
- Text generation works (pages have content)
- Images generate (pages have illustrations)
- Book viewer displays correctly

- [ ] **Step 5: Switch to Anthropic and generate a story**

If Anthropic key is configured:
- Select "Anthropic" from the provider dropdown
- Generate a story
- Verify text generation works with Claude Opus 4.6
- Images still generate via Gemini

- [ ] **Step 6: Run full server test suite**

Run: `cd server && bun test`
Expected: All tests pass.

- [ ] **Step 7: Run frontend lint**

Run: `cd apex && npm run lint`
Expected: No errors.

- [ ] **Step 8: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during smoke test"
```
