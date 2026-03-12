# Multi-Provider AI Proxy Design

**Date:** 2026-03-12
**Status:** Approved

## Goal

Introduce a server-side proxy that abstracts AI provider details away from the frontend. The React app talks to the proxy; the proxy talks to AI providers. This enables:

1. Runtime provider/model switching for text generation (Gemini, Anthropic) via a UI control
2. All API keys held server-side (never exposed to the browser)
3. A clean adapter pattern that makes adding future LLM providers trivial

**Scope:** LLM (text generation) gets the multi-provider abstraction. Image generation routes through the proxy but only has one provider implementation (Gemini) for now. The `ImageService` adapter interface exists for future extensibility but is not the focus.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Image service abstraction | Out of scope | Only LLM side gets multi-provider treatment |
| Provider selection | UI dropdown (runtime) | User picks provider/model before generating a story |
| API key management | Server-side env vars only | Browser never sees keys |
| Proxy scope | All AI calls (LLM + image) | Single point of contact, consistent security posture |
| Server stack | Elysia + Bun | Bleeding edge, excellent TypeScript DX, fast |
| Prompt content ownership | Frontend | Adapters are generic pipes; domain-specific prompt text lives in the client |

## Project Structure

```
vigilant-parakeet/
├── apex/                              # React frontend
│   └── src/
│       ├── contexts/
│       │   └── AiConfigContext.tsx     # NEW: provider/model selection state
│       └── services/
│           ├── LlmService.ts          # REWRITTEN: fetch() to proxy
│           ├── ImageService.ts         # REWRITTEN: fetch() to proxy
│           ├── StoryGeneratorService.ts  # UNCHANGED
│           └── StorageService.ts         # UNCHANGED
│
└── server/                            # NEW: Elysia + Bun proxy
    ├── package.json
    ├── tsconfig.json
    ├── .env                           # GEMINI_API_KEY, ANTHROPIC_API_KEY
    ├── src/
    │   ├── index.ts                   # Elysia app, CORS, route registration
    │   ├── routes/
    │   │   ├── llm.ts                 # POST /api/llm/generate
    │   │   ├── image.ts               # POST /api/image/generate
    │   │   └── providers.ts           # GET /api/providers
    │   ├── providers/
    │   │   ├── types.ts               # ILlmProvider, IImageProvider interfaces
    │   │   ├── gemini-llm.ts          # GeminiLlmAdapter
    │   │   ├── anthropic-llm.ts       # AnthropicLlmAdapter
    │   │   └── gemini-image.ts        # GeminiImageAdapter
    │   └── registry.ts                # Maps provider names to adapter instances
    └── bunfig.toml
```

## Provider Interfaces

```typescript
// server/src/providers/types.ts

interface LlmRequest {
  prompt: string;
  systemPrompt?: string;
  responseSchema: JsonSchema;   // Standard JSON Schema (provider-neutral)
}

interface LlmResponse {
  data: Record<string, unknown>; // Parsed JSON matching the schema
}

interface ImageRequest {
  prompt: string;
}

interface ImageResponse {
  imageDataUri: string;          // "data:image/png;base64,..."
}

interface ILlmProvider {
  generate(request: LlmRequest): Promise<LlmResponse>;
}

interface IImageProvider {
  generate(request: ImageRequest): Promise<ImageResponse>;
}
```

**Schema translation:** Each adapter converts standard JSON Schema to its provider's native format. GeminiLlmAdapter maps to Google's `Type.*` enum schema. AnthropicLlmAdapter uses the tool_use pattern — defines a tool whose `input_schema` is the JSON Schema, instructs the model to call it, and extracts the tool call arguments as parsed JSON.

## Provider Registry

```typescript
// server/src/registry.ts

const llmProviders: Map<string, ILlmProvider>
// "gemini"    → GeminiLlmAdapter instance
// "anthropic" → AnthropicLlmAdapter instance

const imageProviders: Map<string, IImageProvider>
// "gemini"    → GeminiImageAdapter instance
```

Adapters are only registered if their corresponding API key is present in the environment. The registry is populated at startup.

## Proxy API

### `POST /api/llm/generate`

**Request:**
```json
{
  "provider": "gemini" | "anthropic",
  "model": "claude-opus-4-6",
  "prompt": "...",
  "systemPrompt": "...",
  "responseSchema": { ... }
}
```

`model` is optional. Each adapter has a sensible default (e.g., `gemini-3-flash-preview`, `claude-opus-4-6`).

**Response (success):**
```json
{
  "data": { ... }
}
```

**Response (error):**
```json
{
  "error": "Human-readable message",
  "code": "UNKNOWN_PROVIDER" | "GENERATION_FAILED" | "MISSING_API_KEY"
}
```

### `POST /api/image/generate`

**Request:**
```json
{
  "provider": "gemini",
  "prompt": "..."
}
```

**Response (success):**
```json
{
  "imageDataUri": "data:image/png;base64,..."
}
```

**Response (error):** Same shape as LLM errors.

### `GET /api/providers`

Returns which providers are available (have API keys configured).

**Response:**
```json
{
  "llm": ["gemini", "anthropic"],
  "image": ["gemini"]
}
```

The UI settings dropdown only shows providers returned by this endpoint.

## Provider Adapters

### GeminiLlmAdapter

- SDK: `@google/genai`
- Translates `responseSchema` (JSON Schema) to Google's `Type.*` enum format
- Calls `client.models.generateContent()` with `responseMimeType: "application/json"`
- Parses `response.text` as JSON

### AnthropicLlmAdapter

- SDK: `@anthropic-ai/sdk`
- Uses `systemPrompt` as the native `system` parameter
- Structured output via tool_use: defines a tool whose `input_schema` is the `responseSchema`, instructs the model to use it, extracts tool call arguments as parsed JSON
- Default model: `claude-opus-4-6`

### GeminiImageAdapter

- SDK: `@google/genai`
- Calls `generateContent()` with `responseModalities: ['IMAGE']`
- Extracts base64 inline data from `response.candidates[0].content.parts[].inlineData`
- Returns as `data:{mimeType};base64,...` data URI
- Model: `gemini-2.5-flash-image`

## Frontend Changes

### LlmService.ts (rewrite)

- Remove `@google/genai` import and SDK initialization
- Each method keeps its current signature and return types
- Internally constructs `fetch("/api/llm/generate", ...)` calls
- Response schemas rewritten from Google `Type.*` enums to standard JSON Schema objects
- Provider and model read from `AiConfigContext`

### ImageService.ts (rewrite)

- Remove `@google/genai` import and SDK initialization
- `generateImage()` becomes `fetch("/api/image/generate", ...)`
- The children's book style prefix remains here (frontend owns prompt content)
- Provider read from `AiConfigContext`

### AiConfigContext (new)

```typescript
interface AiConfig {
  llmProvider: string;
  llmModel?: string;
  imageProvider: string;
}

// Defaults
{ llmProvider: "gemini", imageProvider: "gemini" }
```

A React context + provider wrapping the app. A settings control on the Dashboard exposes a dropdown for `llmProvider` (populated from `GET /api/providers`). Image provider is not user-facing for now but flows through the same mechanism.

### Dependency cleanup (apex/package.json)

- Remove `@google/genai` — no AI SDKs in the frontend
- No new dependencies needed (`fetch` is native)

### Unchanged

- `StoryGeneratorService.ts` — calls the same `LlmService` and `ImageService` methods
- `StorageService.ts`
- All components, types, styles

## Dev Experience

### Running locally

Two processes:
1. `cd apex && npm run dev` — Vite on `:5173`
2. `cd server && bun run dev` — Elysia on `:3000`

### Vite proxy

```typescript
// apex/vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
```

Frontend fetches relative paths (`/api/llm/generate`). Vite forwards to Elysia in dev. Production uses a reverse proxy or single deployment.

### Server environment

```
# server/.env
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
```

No `VITE_` prefix — keys never touch the browser. The existing `apex/.env` with `VITE_GEMINI_API_KEY` can be removed after migration.

## Server Dependencies

```json
{
  "dependencies": {
    "elysia": "latest",
    "@google/genai": "^1.42.0",
    "@anthropic-ai/sdk": "latest"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```
