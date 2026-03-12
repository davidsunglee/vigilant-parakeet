# Image Quality & Layout Improvements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix image cropping, improve page layout, add image model selection with aspect ratio control, and improve prompts for better compositions.

**Architecture:** Three coordinated layers — CSS layout fixes for natural image sizing, backend plumbing for model/aspect-ratio/resolution pass-through, and prompt improvements for better compositions. Changes flow from server types → adapter → route → frontend service → UI components.

**Tech Stack:** React 18 + TypeScript (frontend), Elysia + Bun (backend), Gemini API (`@google/genai`), plain CSS, Bun test runner.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/providers/types.ts` | Modify | Add `model?`, `aspectRatio?`, `resolution?` to `ImageRequest` |
| `server/src/providers/gemini-image.ts` | Modify | Use `request.model`, conditionally build `imageConfig` |
| `server/src/routes/image.ts` | Modify | Accept + pass through new optional body fields |
| `server/src/providers/__tests__/gemini-image.test.ts` | Modify | Test model override and imageConfig construction |
| `server/src/routes/__tests__/image.test.ts` | Modify | Test new fields pass through to adapter |
| `apex/src/contexts/AiConfigContext.tsx` | Modify | Add `imageModel?` to `AiConfig` interface |
| `apex/src/services/ImageService.ts` | Modify | Accept options param, pass model/aspectRatio/resolution, update prompt |
| `apex/src/services/StoryGeneratorService.ts` | Modify | Pass aspect ratios to image calls, update cover prompt |
| `apex/src/components/dashboard/Dashboard.tsx` | Modify | Add image model dropdown |
| `apex/src/components/book/BookViewer.tsx` | Modify | Remove inline flex styles |
| `apex/src/components/book/BookViewer.css` | Modify | Fix image and layout CSS |

---

## Chunk 1: Server-Side Plumbing

### Task 1: Extend `ImageRequest` type

**Files:**
- Modify: `server/src/providers/types.ts:21-23`

- [ ] **Step 1: Write the failing test**

Create a type-level test that verifies the new fields exist on `ImageRequest`. Add to `server/src/providers/__tests__/types.test.ts`:

```typescript
import type { ImageRequest } from '../types';

// At end of file, add a new describe block:
describe('ImageRequest', () => {
  it('accepts optional model, aspectRatio, and resolution', () => {
    const req: ImageRequest = {
      prompt: 'a cat',
      model: 'gemini-3.1-flash-image-preview',
      aspectRatio: '4:3',
      resolution: '1K',
    };
    expect(req.prompt).toBe('a cat');
    expect(req.model).toBe('gemini-3.1-flash-image-preview');
    expect(req.aspectRatio).toBe('4:3');
    expect(req.resolution).toBe('1K');
  });

  it('works with only prompt (all new fields optional)', () => {
    const req: ImageRequest = { prompt: 'a dog' };
    expect(req.prompt).toBe('a dog');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && bun test src/providers/__tests__/types.test.ts`
Expected: FAIL — `model`, `aspectRatio`, `resolution` don't exist on `ImageRequest`

- [ ] **Step 3: Add new fields to ImageRequest**

In `server/src/providers/types.ts`, change:

```typescript
export interface ImageRequest {
  prompt: string;
}
```

to:

```typescript
export interface ImageRequest {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && bun test src/providers/__tests__/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/providers/types.ts server/src/providers/__tests__/types.test.ts
git commit -m "feat: add model, aspectRatio, resolution to ImageRequest type"
```

---

### Task 2: Update `GeminiImageAdapter` to use request model and imageConfig

**Files:**
- Modify: `server/src/providers/gemini-image.ts:14-21`
- Modify: `server/src/providers/__tests__/gemini-image.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `server/src/providers/__tests__/gemini-image.test.ts` with tests that verify the adapter builds the correct Gemini API call arguments. We need to spy on `this.client.models.generateContent` to inspect what the adapter passes:

```typescript
import { describe, expect, it, mock } from 'bun:test';
import { GeminiImageAdapter } from '../gemini-image';

describe('GeminiImageAdapter', () => {
  it('is constructable with an API key', () => {
    const adapter = new GeminiImageAdapter('fake-key');
    expect(adapter).toBeDefined();
  });

  it('throws on empty API key', () => {
    expect(() => new GeminiImageAdapter('')).toThrow();
  });

  it('uses request.model when provided', async () => {
    const adapter = new GeminiImageAdapter('fake-key');
    const generateContent = mock(() =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }],
            },
          },
        ],
      })
    );
    // Replace the client's generateContent method
    (adapter as any).client = { models: { generateContent } };

    await adapter.generate({ prompt: 'a cat', model: 'gemini-3.1-flash-image-preview' });

    expect(generateContent).toHaveBeenCalledTimes(1);
    const callArgs = generateContent.mock.calls[0][0];
    expect(callArgs.model).toBe('gemini-3.1-flash-image-preview');
  });

  it('falls back to default model when request.model is absent', async () => {
    const adapter = new GeminiImageAdapter('fake-key');
    const generateContent = mock(() =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }],
            },
          },
        ],
      })
    );
    (adapter as any).client = { models: { generateContent } };

    await adapter.generate({ prompt: 'a cat' });

    const callArgs = generateContent.mock.calls[0][0];
    expect(callArgs.model).toBe('gemini-2.5-flash-image');
  });

  it('includes imageConfig when aspectRatio is provided', async () => {
    const adapter = new GeminiImageAdapter('fake-key');
    const generateContent = mock(() =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }],
            },
          },
        ],
      })
    );
    (adapter as any).client = { models: { generateContent } };

    await adapter.generate({ prompt: 'a cat', aspectRatio: '4:3' });

    const callArgs = generateContent.mock.calls[0][0];
    expect(callArgs.config.imageConfig).toEqual({ aspectRatio: '4:3' });
  });

  it('includes imageSize in imageConfig when resolution is provided', async () => {
    const adapter = new GeminiImageAdapter('fake-key');
    const generateContent = mock(() =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }],
            },
          },
        ],
      })
    );
    (adapter as any).client = { models: { generateContent } };

    await adapter.generate({ prompt: 'a cat', aspectRatio: '4:3', resolution: '1K' });

    const callArgs = generateContent.mock.calls[0][0];
    expect(callArgs.config.imageConfig).toEqual({ aspectRatio: '4:3', imageSize: '1K' });
  });

  it('omits imageConfig when aspectRatio is not provided', async () => {
    const adapter = new GeminiImageAdapter('fake-key');
    const generateContent = mock(() =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }],
            },
          },
        ],
      })
    );
    (adapter as any).client = { models: { generateContent } };

    await adapter.generate({ prompt: 'a cat' });

    const callArgs = generateContent.mock.calls[0][0];
    expect(callArgs.config.imageConfig).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && bun test src/providers/__tests__/gemini-image.test.ts`
Expected: FAIL — adapter doesn't use `request.model` or build `imageConfig`

- [ ] **Step 3: Update the adapter**

In `server/src/providers/gemini-image.ts`, replace the `generate` method:

```typescript
  async generate(request: ImageRequest): Promise<ImageResponse> {
    const response = await this.client.models.generateContent({
      model: request.model ?? DEFAULT_MODEL,
      contents: request.prompt,
      config: {
        responseModalities: ['IMAGE'],
        ...(request.aspectRatio && {
          imageConfig: {
            aspectRatio: request.aspectRatio,
            ...(request.resolution && { imageSize: request.resolution }),
          },
        }),
      },
    });
```

Keep the rest of the method (response parsing) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && bun test src/providers/__tests__/gemini-image.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/providers/gemini-image.ts server/src/providers/__tests__/gemini-image.test.ts
git commit -m "feat: support model override and imageConfig in GeminiImageAdapter"
```

---

### Task 3: Update image route to accept and pass through new fields

**Files:**
- Modify: `server/src/routes/image.ts:18,29-33`
- Modify: `server/src/routes/__tests__/image.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests to `server/src/routes/__tests__/image.test.ts` that verify the new fields are passed through to the adapter:

```typescript
// Update the mockProvider to capture the request it receives:
let lastRequest: ImageRequest | null = null;

const mockProvider: IImageProvider = {
  generate: async (req: ImageRequest): Promise<ImageResponse> => {
    lastRequest = req;
    return { imageDataUri: `data:image/png;base64,${btoa(req.prompt)}` };
  },
};
```

Add `ImageRequest` to the type import at the top: `import type { IImageProvider, ImageRequest, ImageResponse } from '../../providers/types';`

Then add these tests inside the existing `describe` block:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && bun test src/routes/__tests__/image.test.ts`
Expected: FAIL — route schema rejects unknown fields / doesn't pass them through

- [ ] **Step 3: Update the route**

In `server/src/routes/image.ts`, change the body schema and the `adapter.generate()` call:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && bun test src/routes/__tests__/image.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run all server tests to confirm nothing broke**

Run: `cd server && bun test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/image.ts server/src/routes/__tests__/image.test.ts
git commit -m "feat: accept model, aspectRatio, resolution in image route"
```

---

## Chunk 2: Frontend Service & Config Changes

### Task 4: Add `imageModel` to `AiConfig`

**Files:**
- Modify: `apex/src/contexts/AiConfigContext.tsx:3-7`

- [ ] **Step 1: Add `imageModel?` to the AiConfig interface**

In `apex/src/contexts/AiConfigContext.tsx`, change:

```typescript
export interface AiConfig {
  llmProvider: string;
  llmModel?: string;
  imageProvider: string;
}
```

to:

```typescript
export interface AiConfig {
  llmProvider: string;
  llmModel?: string;
  imageProvider: string;
  imageModel?: string;
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors (the field is optional, so all existing code remains valid)

- [ ] **Step 3: Commit**

```bash
git add apex/src/contexts/AiConfigContext.tsx
git commit -m "feat: add imageModel to AiConfig interface"
```

---

### Task 5: Update `ImageService` — options parameter and prompt improvement

**Files:**
- Modify: `apex/src/services/ImageService.ts`

- [ ] **Step 1: Update the service**

Replace the entire contents of `apex/src/services/ImageService.ts`:

```typescript
import type { AiConfig } from '../contexts/AiConfigContext';

export class ImageService {
    static async generateImage(
        config: AiConfig,
        prompt: string,
        options?: { aspectRatio?: string; resolution?: string }
    ): Promise<string> {
        const styledPrompt = `Generate an illustration in a children's educational book style. Show the full subject in frame with space around it. Do not crop the animal's head, tail, or limbs. Subject: ${prompt}`;

        try {
            const res = await fetch('/api/image/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: config.imageProvider,
                    model: config.imageModel,
                    prompt: styledPrompt,
                    ...(options?.aspectRatio && { aspectRatio: options.aspectRatio }),
                    ...(options?.resolution && { resolution: options.resolution }),
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

- [ ] **Step 2: Verify the build succeeds**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apex/src/services/ImageService.ts
git commit -m "feat: add options param to ImageService, improve image prompt"
```

---

### Task 6: Update `StoryGeneratorService` — pass aspect ratios and improve cover prompt

**Files:**
- Modify: `apex/src/services/StoryGeneratorService.ts:111,123-124`

- [ ] **Step 1: Update page image generation to pass aspectRatio**

In `apex/src/services/StoryGeneratorService.ts`, find the chunked image generation section (line 110-111):

```typescript
                const chunkResults = await Promise.all(chunk.map(async p => {
                    const imageUrl = await ImageService.generateImage(config, p.visualPrompt);
```

Change to:

```typescript
                const chunkResults = await Promise.all(chunk.map(async p => {
                    const imageUrl = await ImageService.generateImage(config, p.visualPrompt, { aspectRatio: '4:3' });
```

- [ ] **Step 2: Update cover prompt and pass aspectRatio**

Find the cover generation section (lines 123-124):

```typescript
        const coverPrompt = `A dramatic, dynamic children's book cover illustration showing a ${animalAQuery} and a ${animalBQuery} facing each other in an epic standoff. The scene should be intense and exciting, with both animals looking powerful and ready for battle. Bold, vibrant colors with an action-packed composition. No text in the image.`;
        const coverImageUrl = await ImageService.generateImage(config, coverPrompt);
```

Change to:

```typescript
        const coverPrompt = `A dramatic, dynamic children's book cover illustration showing a ${animalAQuery} and a ${animalBQuery} facing each other in an epic standoff. Both animals must be fully visible from head to tail. The scene should be intense and exciting, with both animals looking powerful and ready for battle. Bold, vibrant colors with an action-packed composition. No text in the image.`;
        const coverImageUrl = await ImageService.generateImage(config, coverPrompt, { aspectRatio: '3:2' });
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apex/src/services/StoryGeneratorService.ts
git commit -m "feat: pass aspect ratios to image generation, improve cover prompt"
```

---

## Chunk 3: Dashboard UI & CSS Layout Fixes

### Task 7: Add image model dropdown to Dashboard

**Files:**
- Modify: `apex/src/components/dashboard/Dashboard.tsx:102-118`

- [ ] **Step 1: Add the image model selector**

In `apex/src/components/dashboard/Dashboard.tsx`, find the closing `)}` of the LLM provider conditional block (after line 118), and add the image model dropdown immediately after it, before `<form onSubmit={handleGenerate}`:

Find:

```tsx
                )}
                <form onSubmit={handleGenerate} className="generator-form">
```

Change to:

```tsx
                )}
                <div className="provider-selector">
                    <label htmlFor="image-model">Image Model:</label>
                    <select
                        id="image-model"
                        value={config.imageModel ?? 'gemini-2.5-flash-image'}
                        onChange={(e) => setConfig({ ...config, imageModel: e.target.value })}
                        disabled={isGenerating}
                    >
                        <option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option>
                        <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash</option>
                    </select>
                </div>
                <form onSubmit={handleGenerate} className="generator-form">
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apex/src/components/dashboard/Dashboard.tsx
git commit -m "feat: add image model dropdown to Dashboard"
```

---

### Task 8: Fix BookViewer layout — remove inline styles

**Files:**
- Modify: `apex/src/components/book/BookViewer.tsx:94,104`

- [ ] **Step 1: Remove inline flex styles**

In `apex/src/components/book/BookViewer.tsx`, find line 94:

```tsx
                                        <div className="visual-content" style={{ flex: '1 1 50%', marginBottom: '20px' }}>
```

Change to:

```tsx
                                        <div className="visual-content">
```

Then find line 104:

```tsx
                                        <div className="text-content" style={{ flex: '1 1 50%' }}>
```

Change to:

```tsx
                                        <div className="text-content">
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd apex && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apex/src/components/book/BookViewer.tsx
git commit -m "fix: remove inline flex styles from BookViewer page layout"
```

---

### Task 9: Fix CSS layout for natural image sizing

**Files:**
- Modify: `apex/src/components/book/BookViewer.css:213-218,372-379`

- [ ] **Step 1: Update `.visual-content` CSS**

In `apex/src/components/book/BookViewer.css`, find:

```css
.visual-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}
```

Change to:

```css
.visual-content {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
}
```

Note: `margin-bottom: 20px` was previously an inline style on the `visual-content` div (which we removed in Task 8). Moving it to CSS keeps it consistent.

- [ ] **Step 2: Add `margin-top: auto` to `.text-content`**

After the `.visual-content` block, there is no existing `.text-content` rule (only `.text-content p`). Add one before `.text-content p` (before line 132):

Find:

```css
.text-content p {
```

Add before it:

```css
.text-content {
    margin-top: auto;
}

```

- [ ] **Step 3: Update `.generated-image` CSS**

Find:

```css
.generated-image {
    width: 100%;
    height: 100%;
    max-height: 400px;
    object-fit: cover;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

Change to:

```css
.generated-image {
    width: 100%;
    height: auto;
    object-fit: contain;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 4: Verify the build succeeds**

Run: `cd apex && npx vite build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/BookViewer.css
git commit -m "fix: natural image sizing with text pinned to bottom"
```

---

### Task 10: Final verification — run all tests, build, and visual check

- [ ] **Step 1: Run all server tests**

Run: `cd server && bun test`
Expected: ALL PASS

- [ ] **Step 2: Build frontend**

Run: `cd apex && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Visual verification**

Start the dev servers (`cd server && bun run dev` and `cd apex && npx vite`), then verify in the browser:

1. **Dashboard:** Image Model dropdown appears below the LLM provider selector. Both options ("Gemini 2.5 Flash", "Gemini 3.1 Flash") are selectable. Dropdown is disabled during generation.
2. **Generate a story** (or open an existing one) and confirm:
   - Page images display at their natural aspect ratio — no cropping of heads/tails
   - Text is pinned to the bottom of each page, giving images maximum space
   - Cover image fills the cover without distortion
3. **Switching image models:** Select "Gemini 3.1 Flash", generate a new story, and confirm images generate successfully with the new model.

- [ ] **Step 4: Final commit (if any remaining changes)**

If any files were missed, stage and commit them. Otherwise, confirm the branch is clean:

Run: `git status`
Expected: Clean working tree
