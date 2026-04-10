# Testing Coverage Audit & Implementation Plan

**Date:** 2026-03-14
**Status:** Proposed
**Priority:** High

## Executive Summary

This audit identifies all gaps in test coverage across the codebase. The frontend (`apex/`) has **zero tests** -- no test runner, no test framework, no test files. The backend (`server/`) has reasonable happy-path coverage but is missing error-path tests, integration tests for the server bootstrap, and the `/api/health` endpoint test. This plan catalogs every gap and provides concrete, actionable test cases.

---

## Current Coverage Snapshot

### Backend (server/) -- Existing Tests

| Test File | What It Covers |
|-----------|---------------|
| `providers/__tests__/types.test.ts` | Type shape validation for `LlmRequest`, `ImageRequest`, `ILlmProvider`, `IImageProvider` |
| `providers/__tests__/gemini-llm.test.ts` | `convertJsonSchemaToGemini` (4 cases); `GeminiLlmAdapter` constructor (valid key, empty key) |
| `providers/__tests__/anthropic-llm.test.ts` | `AnthropicLlmAdapter` constructor (valid key, empty key) |
| `providers/__tests__/gemini-image.test.ts` | `GeminiImageAdapter` constructor; `generate()` with model override, default model, aspectRatio, resolution, and without imageConfig |
| `__tests__/registry.test.ts` | `ProviderRegistry` register/get/list for both LLM and image providers |
| `routes/__tests__/llm.test.ts` | `POST /api/llm/generate` -- valid provider, model passthrough, unknown provider (400) |
| `routes/__tests__/image.test.ts` | `POST /api/image/generate` -- valid provider, unknown provider (400), optional field passthrough, backward compatibility |
| `routes/__tests__/providers.test.ts` | `GET /api/providers` -- returns registered provider lists |

### Frontend (apex/) -- No Tests Exist

- No test runner configured (no vitest, jest, or @testing-library packages)
- No test files anywhere in `apex/src/`
- No test script in `apex/package.json`

---

## 1. Frontend Service Tests

### 1.1 LlmService (`apex/src/services/LlmService.ts`)

**What's missing:** The entire service is untested. It contains a private `callLlm()` helper and three static methods that make network requests and transform responses.

**Files involved:** `apex/src/services/LlmService.ts`

**Priority:** Critical

**Test type:** Unit (with fetch mocking)

**Suggested tests:**

#### `callLlm` (indirectly tested through public methods)
1. **Successful fetch** -- verify it sends correct provider, model, prompt, systemPrompt, and responseSchema to `/api/llm/generate`
2. **HTTP error response** -- when `res.ok` is false, verify it throws with the error message from the JSON body (line 19)
3. **HTTP error with non-JSON body** -- when `res.ok` is false and `res.json()` rejects, verify it throws with `res.statusText` as fallback (line 18: `.catch(() => ({ error: res.statusText }))`)
4. **Returns `body.data`** -- verify it extracts `.data` from the response (line 23)

#### `LlmService.getAnimalProfile()`
5. **Happy path** -- mock fetch to return a full profile, verify it maps all 8 fields (`scientificName`, `weight`, `length`, `speed`, `weaponry`, `armor`, `brainSize`, `habitat`) into the correct `{ scientificName, habitat, stats: {...} }` shape
6. **Missing fields fallback** -- when LLM returns empty strings or missing fields, verify each falls back to `'Unknown'` (lines 44-53: `data.scientificName || 'Unknown'`, etc.)
7. **Correct schema sent** -- verify the `responseSchema` sent to the API has all 8 required fields

#### `LlmService.getAspectsForAnimal()`
8. **Happy path** -- verify it returns the array of aspect objects with `aspectName`, `bodyText`, `visualPrompt`, and optional `funFact`
9. **Correct prompt construction** -- verify the prompt includes the animal name and the joined aspects
10. **Schema shape** -- verify the responseSchema specifies an array with correct item properties and required fields

#### `LlmService.getShowdownAndOutcome()`
11. **Winner is animalA** -- pass `winnerId='animalA'`, verify prompt says the correct animal name
12. **Winner is animalB** -- pass `winnerId='animalB'`, verify prompt says the correct animal name
13. **Winner is none (surprise)** -- pass `winnerId` other than animalA/animalB, verify prompt says "Neither"
14. **Return shape** -- verify it returns `{ checklist, logicalReasoning, showdownText, outcomeText }` with correct structure
15. **Surprise ending prompt text** -- when `isSurpriseEnding=true`, verify the prompt includes the ending type

---

### 1.2 ImageService (`apex/src/services/ImageService.ts`)

**What's missing:** The entire service is untested. It wraps fetch calls with prompt prefixing, error handling, and optional parameter passthrough.

**Files involved:** `apex/src/services/ImageService.ts`

**Priority:** Critical

**Test type:** Unit (with fetch mocking)

**Suggested tests:**

1. **Successful generation** -- mock fetch returning `{ imageDataUri: 'data:...' }`, verify it returns the URI string
2. **Prompt prefixing** -- verify the sent prompt starts with `"Generate an illustration in a children's educational book style..."` (line 9)
3. **Provider and model passthrough** -- verify `config.imageProvider` and `config.imageModel` are sent in the request body
4. **Optional aspectRatio** -- when `options.aspectRatio` is provided, verify it appears in the request body
5. **Optional resolution** -- when `options.resolution` is provided, verify it appears in the request body
6. **Omitted optional fields** -- when `options` is undefined, verify `aspectRatio` and `resolution` are not in the request body (line 19-20: conditional spread)
7. **HTTP error returns empty string** -- when `res.ok` is false, verify it returns `''` and does not throw (line 27-28)
8. **Network error returns empty string** -- when fetch throws, verify it catches and returns `''` (lines 32-35)
9. **Missing imageDataUri** -- when response body has no `imageDataUri`, verify it returns `''` (line 31: `body.imageDataUri || ''`)

---

### 1.3 StorageService (`apex/src/services/StorageService.ts`)

**What's missing:** The entire service is untested. It uses `localforage` for IndexedDB persistence with CRUD operations.

**Files involved:** `apex/src/services/StorageService.ts`

**Priority:** High

**Test type:** Unit (with localforage mocked or using `localforage` memory driver)

**Suggested tests:**

#### `saveStory()`
1. **Happy path** -- verify it calls `storyStore.setItem(story.metadata.id, story)`
2. **IndexedDB error** -- when `setItem` throws, verify it re-throws with message `'Failed to persist story.'` (line 21)

#### `getStory()`
3. **Story found** -- verify it returns the story from `storyStore.getItem`
4. **Story not found** -- verify it returns `null` when item doesn't exist
5. **IndexedDB error** -- when `getItem` throws, verify it returns `null` (line 33-34)

#### `getAllStories()`
6. **Returns sorted stories** -- verify stories are sorted by `metadata.createdAt` descending (line 47)
7. **Empty store** -- verify it returns `[]` when no stories exist
8. **IndexedDB error** -- when `iterate` throws, verify it returns `[]` (line 49-50)

#### `deleteStory()`
9. **Happy path** -- verify it calls `storyStore.removeItem(id)`
10. **IndexedDB error** -- when `removeItem` throws, verify it re-throws with message `'Failed to delete story.'` (line 63)

#### `updateStory()`
11. **Happy path** -- verify it reads existing story, merges updates, and calls `setItem`
12. **Story not found** -- when `getStory` returns null, verify it throws `'Story not found for update.'` (line 72)
13. **IndexedDB error on write** -- when `setItem` throws during update, verify it re-throws with `'Failed to update story.'` (line 79)

---

### 1.4 StoryGeneratorService (`apex/src/services/StoryGeneratorService.ts`)

**What's missing:** The entire orchestration service is untested. It coordinates LlmService, ImageService, randomization logic, and page construction.

**Files involved:** `apex/src/services/StoryGeneratorService.ts`

**Priority:** Critical

**Test type:** Unit (with LlmService and ImageService mocked)

**Suggested tests:**

#### `generateStory()`
1. **Full orchestration** -- mock LlmService and ImageService, verify it calls `getAnimalProfile` for both animals, `getShowdownAndOutcome`, `getAspectsForAnimal` for both, and `generateImage` for all pages + cover
2. **Animal entities construction** -- verify `animalA.id === 'animalA'` and `animalB.id === 'animalB'` with correct `commonName` values (lines 15-16)
3. **Page structure** -- verify the manifest has 26 total pages: 24 aspect pages (12 pairs) + showdown + outcome (lines 64-102)
4. **Page indices** -- verify aspect pages are numbered 1-24, showdown is 31, outcome is 32 (lines 69, 89, 98)
5. **Left/right page alternation** -- verify odd-indexed aspect pages have `isLeftPage: true`, even have `isLeftPage: false`
6. **Chunked image generation** -- verify images are generated in chunks of 4 to avoid rate limits (line 105-117)
7. **Cover image** -- verify cover image is generated with aspectRatio `'3:2'` and correct prompt containing both animal names (lines 123-124)
8. **Manifest metadata** -- verify UUID is generated, title format is `"Who Would Win? {A} vs. {B}"`, `createdAt` is a timestamp, `hasBeenRead` is false (lines 126-132)

#### `rollForSurpriseEnding()` (private, test via `generateStory`)
9. **Probability distribution** -- with controlled random, verify it returns true only when roll === 7 (1-in-7 chance) (lines 144-146)

#### `determineEndingType()` (private, test via `generateStory`)
10. **Standard ending** -- when `isSurprise=false`, verify it returns `'Standard Victory'` (line 150)
11. **Surprise ending types** -- when `isSurprise=true`, verify it returns one of the 4 surprise types (lines 151-156)

---

## 2. Frontend Component Tests

### 2.1 Dashboard (`apex/src/components/dashboard/Dashboard.tsx`)

**What's missing:** No component tests exist. The Dashboard has form submission, story generation, deletion with optimistic UI, winner reveal toggling, and generation overlay animation.

**Files involved:** `apex/src/components/dashboard/Dashboard.tsx`

**Priority:** High

**Test type:** Unit/Integration (with @testing-library/react)

**Suggested tests:**

#### Rendering
1. **Empty library** -- verify "Your library is empty" message and BookOpen icon render when no stories
2. **Story cards render** -- with mocked StorageService returning stories, verify cards show animal names, title, date
3. **Cover image** -- verify cover image renders in story card when `coverImageUrl` exists
4. **No cover image** -- verify no `<img>` in story card when `coverImageUrl` is missing

#### Form
5. **Generate button disabled when inputs empty** -- verify button is disabled when animalA or animalB are empty
6. **Generate button enabled** -- verify button is enabled when both inputs have values
7. **Inputs disabled during generation** -- verify inputs and button are disabled when `isGenerating` is true
8. **Form submission** -- verify `StoryGeneratorService.generateStory` is called with trimmed animal names
9. **Form clears after generation** -- verify both inputs are cleared after successful generation
10. **Generation error** -- verify alert('Failed to generate story.') is called on error (line 75-76)

#### Generation Overlay
11. **Overlay visible during generation** -- verify the generation modal appears with spinner and messages
12. **Generation messages cycle** -- verify generation step messages cycle through the 8 predefined messages (lines 26-35)
13. **Animal names shown in overlay** -- verify animalA and animalB names appear in the overlay (line 179)

#### Delete
14. **Optimistic delete** -- verify story is removed from UI immediately before async completion (line 84)
15. **Delete failure rollback** -- verify stories are reloaded if delete fails (line 91)

#### Winner Reveal
16. **Reveal button shows initially** -- verify "Reveal Winner" button shows, not the winner badge
17. **Toggle reveal** -- click "Reveal Winner", verify winner badge shows with correct animal name
18. **Surprise ending winner** -- when `winnerId === 'none'`, verify badge shows "None (Surprise!)" (line 224)
19. **Toggle hide** -- click revealed badge, verify it hides and shows "Reveal Winner" again

#### Advanced Options
20. **LLM provider selector** -- verify dropdown only shows when `availableProviders.llm.length > 1` (line 137)
21. **Image model selector** -- verify it shows two Gemini model options
22. **Config update** -- verify changing selectors calls `setConfig` with updated values

---

### 2.2 BookViewer (`apex/src/components/book/BookViewer.tsx`)

**What's missing:** No component tests exist. The BookViewer loads a story, marks it as read, renders pages in a flipbook, and supports keyboard navigation.

**Files involved:** `apex/src/components/book/BookViewer.tsx`, `apex/src/components/book/BookViewer.css`

**Priority:** High

**Test type:** Unit/Integration (with @testing-library/react, HTMLFlipBook may need mocking)

**Suggested tests:**

#### Loading
1. **Loading state** -- verify "Loading book..." shows before story loads (line 39)
2. **Story loads** -- verify story content renders after `StorageService.getStory` resolves
3. **Mark as read** -- verify `StorageService.updateStory` is called with `hasBeenRead: true` when story hasn't been read (lines 18-19)
4. **Already read** -- verify `updateStory` is NOT called when `hasBeenRead` is already true

#### Cover
5. **Cover renders** -- verify front cover shows "Who Would Win?" and both animal names
6. **Cover image** -- verify cover image `<img>` renders when `coverImageUrl` exists
7. **No cover image** -- verify no `<img>` when `coverImageUrl` is falsy

#### Pages
8. **Page count** -- verify all story pages render
9. **Left page title** -- verify left pages show the title `<h3>` (line 92)
10. **Right page no title** -- verify right pages don't show a title when `page.title` is empty
11. **Generated image** -- verify `<img>` renders when `page.imageUrl` exists (lines 98-99)
12. **Placeholder image** -- verify placeholder div with `visualPrompt` text shows when `imageUrl` is missing (lines 101-103)
13. **Fun fact** -- verify fun fact box renders when `page.funFact` exists (lines 111-123)
14. **No fun fact** -- verify fun fact box does not render when `page.funFact` is falsy
15. **Page numbers** -- verify page index numbers display (line 126)

#### Checklist Page
16. **Checklist renders** -- verify "Predictions Checklist" page renders with trait rows
17. **Advantage checkmarks** -- verify `CheckCircle` icons appear for correct advantages
18. **Animal names in header** -- verify checklist header shows both animal common names

#### Navigation
19. **Keyboard left arrow** -- simulate ArrowLeft keydown, verify `flipPrev()` is called
20. **Keyboard right arrow** -- simulate ArrowRight keydown, verify `flipNext()` is called
21. **Nav buttons** -- verify clicking left/right nav arrows calls flipPrev/flipNext
22. **Close button** -- verify clicking "Back to Library" calls `onClose`
23. **Keyboard listener cleanup** -- verify event listener is removed on unmount

#### Back Cover
24. **Back cover** -- verify "The End" text renders on the last page

---

## 3. Frontend Context Tests

### 3.1 AiConfigContext (`apex/src/contexts/AiConfigContext.tsx`)

**What's missing:** The context provider and hook are completely untested.

**Files involved:** `apex/src/contexts/AiConfigContext.tsx`

**Priority:** High

**Test type:** Unit (with @testing-library/react-hooks or renderHook)

**Suggested tests:**

1. **Default config** -- verify initial config is `{ llmProvider: 'anthropic', imageProvider: 'gemini' }` (lines 16-19)
2. **Fetches providers on mount** -- verify it calls `fetch('/api/providers')` on mount (line 35)
3. **Sets available providers** -- after fetch resolves, verify `availableProviders` updates with the response data
4. **Provider fallback when default available** -- when response includes `'anthropic'` in llm list, verify `llmProvider` remains `'anthropic'` (line 42)
5. **Provider fallback when default unavailable** -- when response does NOT include `'anthropic'` in llm list, verify `llmProvider` updates to the first available provider (line 42)
6. **Image provider fallback** -- same logic for `imageProvider` (line 43)
7. **Fetch error** -- when fetch fails, verify it logs error and providers remain empty (line 46)
8. **setConfig** -- verify calling `setConfig` with new values updates the context
9. **useAiConfig hook** -- verify it returns `{ config, setConfig, availableProviders }` from the context

---

## 4. Backend Test Gaps

### 4.1 GeminiLlmAdapter.generate() (`server/src/providers/gemini-llm.ts`)

**What's missing:** The `generate()` method is only tested for constructor validation. The actual generation logic (lines 56-76) has no tests.

**Files involved:** `server/src/providers/gemini-llm.ts`, `server/src/providers/__tests__/gemini-llm.test.ts`

**Priority:** Critical

**Test type:** Unit (mock `this.client.models.generateContent`)

**Suggested tests:**

1. **Happy path** -- mock `generateContent` to return `{ text: '{"key":"value"}' }`, verify `generate()` returns `{ data: { key: 'value' } }`
2. **Model passthrough** -- verify `request.model` is used when provided, `DEFAULT_MODEL` (`'gemini-3-flash-preview'`) when absent (line 57)
3. **System prompt passthrough** -- verify `systemInstruction` is set when `request.systemPrompt` is provided, undefined when not (line 64)
4. **Schema conversion** -- verify `convertJsonSchemaToGemini` is called with `request.responseSchema` and result is passed to API (line 58, 66)
5. **Empty text response** -- when `response.text` is falsy, verify it throws `'Gemini returned no text (content may have been blocked by safety filters)'` (lines 71-73)
6. **Invalid JSON response** -- when `response.text` is not valid JSON, verify `JSON.parse` throws (line 74)
7. **Enum field conversion** -- verify `convertJsonSchemaToGemini` preserves `enum` arrays (lines 39-41 of converter)
8. **Unknown type fallback** -- verify `convertJsonSchemaToGemini` passes through unknown type strings unchanged (line 17: `TYPE_MAP[schema.type] ?? schema.type`)

---

### 4.2 AnthropicLlmAdapter.generate() (`server/src/providers/anthropic-llm.ts`)

**What's missing:** The `generate()` method is only tested for constructor validation. The actual generation logic (lines 15-56) including schema wrapping, tool use extraction, and unwrapping is untested.

**Files involved:** `server/src/providers/anthropic-llm.ts`, `server/src/providers/__tests__/anthropic-llm.test.ts`

**Priority:** Critical

**Test type:** Unit (mock `this.client.messages.create`)

**Suggested tests:**

1. **Happy path with object schema** -- mock `messages.create` to return a `tool_use` block, verify `generate()` returns the tool input as `{ data: {...} }`
2. **Schema wrapping for non-object types** -- when `responseSchema.type !== 'object'` (e.g., `'array'`), verify the schema is wrapped in `{ type: 'object', properties: { result: schema }, required: ['result'] }` (lines 20-23)
3. **No wrapping for object schema** -- when `responseSchema.type === 'object'`, verify schema is passed directly (line 23)
4. **Unwrapping for wrapped schemas** -- when schema was wrapped, verify `input.result` is returned instead of `input` (line 55)
5. **Model passthrough** -- verify `request.model` is used when provided, `DEFAULT_MODEL` (`'claude-opus-4-6'`) when absent (line 16)
6. **System prompt passthrough** -- verify `system` field is set from `request.systemPrompt`, defaults to `''` (line 28)
7. **Tool choice forced** -- verify `tool_choice` is `{ type: 'tool', name: 'structured_output' }` (line 42)
8. **No tool_use block** -- when response has no `tool_use` block, verify it throws `'Anthropic response did not contain a tool_use block'` (lines 49-51)
9. **Prompt suffix** -- verify the user message includes the instruction to call the tool (line 32)

---

### 4.3 GeminiImageAdapter.generate() -- Missing Error Path (`server/src/providers/gemini-image.ts`)

**What's missing:** The error path when no image data is found in the response is not tested.

**Files involved:** `server/src/providers/gemini-image.ts`, `server/src/providers/__tests__/gemini-image.test.ts`

**Priority:** High

**Test type:** Unit

**Suggested tests:**

1. **No candidates** -- when `response.candidates` is empty array, verify it throws `'No image data in Gemini response'` (line 43)
2. **No content parts** -- when candidates exist but `content.parts` is undefined, verify it throws
3. **No inlineData** -- when parts exist but no `inlineData.data`, verify it throws
4. **Custom mimeType** -- when `inlineData.mimeType` is `'image/jpeg'`, verify the data URI uses that mimeType (line 36)
5. **Default mimeType** -- when `inlineData.mimeType` is falsy, verify it defaults to `'image/png'` (line 36)

---

### 4.4 LLM Route Error Path (`server/src/routes/llm.ts`)

**What's missing:** The 502 error path when `adapter.generate()` throws is not tested.

**Files involved:** `server/src/routes/llm.ts`, `server/src/routes/__tests__/llm.test.ts`

**Priority:** High

**Test type:** Integration

**Suggested tests:**

1. **Generation failure (Error instance)** -- mock provider's `generate()` to throw `new Error('API timeout')`, verify response is 502 with `{ error: 'API timeout', code: 'GENERATION_FAILED' }` (lines 25-30)
2. **Generation failure (non-Error)** -- mock provider's `generate()` to throw a string, verify response is 502 with `{ error: 'Unknown error', code: 'GENERATION_FAILED' }` (line 26)
3. **Missing required body fields** -- send request without `prompt` or `provider`, verify Elysia's schema validation returns 422

---

### 4.5 Image Route Error Path (`server/src/routes/image.ts`)

**What's missing:** The 502 error path when `adapter.generate()` throws is not tested.

**Files involved:** `server/src/routes/image.ts`, `server/src/routes/__tests__/image.test.ts`

**Priority:** High

**Test type:** Integration

**Suggested tests:**

1. **Generation failure (Error instance)** -- mock provider's `generate()` to throw `new Error('Rate limited')`, verify response is 502 with `{ error: 'Rate limited', code: 'GENERATION_FAILED' }` (lines 25-30)
2. **Generation failure (non-Error)** -- mock provider's `generate()` to throw a non-Error, verify response is 502 with `{ error: 'Unknown error', code: 'GENERATION_FAILED' }` (line 26)
3. **Missing required body fields** -- send request without `prompt`, verify Elysia's schema validation returns 422

---

### 4.6 Health Endpoint (`server/src/index.ts`)

**What's missing:** The `/api/health` endpoint (line 38) has no test.

**Files involved:** `server/src/index.ts`

**Priority:** Low

**Test type:** Integration

**Suggested tests:**

1. **Health check** -- `GET /api/health` returns `{ status: 'ok' }` with status 200

---

### 4.7 ProviderRegistry Edge Cases (`server/src/registry.ts`)

**What's missing:** Minor edge cases not tested.

**Files involved:** `server/src/registry.ts`, `server/src/__tests__/registry.test.ts`

**Priority:** Low

**Test type:** Unit

**Suggested tests:**

1. **Overwrite provider** -- register two providers with the same name, verify the second replaces the first
2. **Empty lists** -- verify `listLlmProviders()` and `listImageProviders()` return `[]` on fresh registry (currently covered implicitly but not explicitly)

---

## 5. End-to-End Tests

**What's missing:** There are no E2E tests at all. The full user workflow from opening the app to reading a generated story is untested.

**Priority:** Medium (implement after unit tests are in place)

**Test type:** E2E (Playwright or Cypress)

**Suggested tests:**

### 5.1 Story Generation Flow
1. **Full generation cycle** -- load dashboard, enter two animal names, click Generate, wait for completion, verify story appears in library
2. **Read generated story** -- click "Read Full Book" on a story card, verify BookViewer opens with correct content
3. **Page navigation** -- in BookViewer, navigate forward/backward through all pages using arrows and keyboard
4. **Return to library** -- click "Back to Library", verify dashboard shows again

### 5.2 Library Management
5. **Delete story** -- click delete on a story card, verify it disappears from the library
6. **Winner reveal** -- click "Reveal Winner", verify winner name appears; click again to hide
7. **Persistence** -- generate a story, reload the page, verify story still appears in library (IndexedDB persistence)

### 5.3 Configuration
8. **Provider selection** -- change LLM provider in Advanced Options, generate a story, verify correct provider is used
9. **Image model selection** -- change image model, generate a story, verify correct model is used

### 5.4 Error Handling
10. **Backend unavailable** -- with server down, attempt generation, verify error message appears
11. **Invalid animal names** -- submit with only whitespace, verify form validation prevents submission

---

## 6. Infrastructure Setup Required

### Frontend Test Setup (Prerequisite for Sections 1-3)

Before any frontend tests can be written, the following must be added to `apex/`:

1. **Install test dependencies:**
   ```
   vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
   ```

2. **Add vitest config** to `apex/vite.config.ts`:
   ```ts
   test: {
     globals: true,
     environment: 'jsdom',
     setupFiles: './src/test/setup.ts',
   }
   ```

3. **Create setup file** at `apex/src/test/setup.ts`:
   ```ts
   import '@testing-library/jest-dom';
   ```

4. **Add test script** to `apex/package.json`:
   ```json
   "test": "vitest",
   "test:coverage": "vitest --coverage"
   ```

5. **Mock strategy for `localforage`** -- either mock the module or use `localforage` with a memory driver in tests.

6. **Mock strategy for `fetch`** -- use `vi.fn()` to mock global fetch in service tests.

7. **Mock strategy for `react-pageflip`** -- the `HTMLFlipBook` component will need to be mocked for BookViewer tests since it relies on canvas/DOM APIs.

### E2E Setup (Prerequisite for Section 5)

1. **Install Playwright:** `npm init playwright@latest` in root
2. **Configure** to start both dev server (`apex/`) and backend (`server/`) before tests
3. **Mock external AI APIs** at the server boundary to avoid real API calls in E2E tests

---

## Priority Summary

| Priority | Category | Test Count |
|----------|----------|------------|
| Critical | Frontend Services (LlmService, ImageService, StoryGeneratorService) | ~27 |
| Critical | Backend generate() methods (Gemini LLM, Anthropic LLM) | ~17 |
| High | Frontend StorageService | ~13 |
| High | Frontend Components (Dashboard, BookViewer) | ~46 |
| High | Frontend Context (AiConfigContext) | ~9 |
| High | Backend error paths (routes, GeminiImageAdapter) | ~10 |
| Medium | E2E Tests | ~11 |
| Low | Backend edge cases (registry, health) | ~3 |
| **Total** | | **~136** |

### Recommended Implementation Order

1. **Frontend test infrastructure setup** (Section 6) -- unblocks everything
2. **Frontend service unit tests** (Section 1) -- highest value, tests core business logic
3. **Backend generate() method tests** (Sections 4.1, 4.2) -- critical gap in existing backend coverage
4. **Backend error path tests** (Sections 4.3, 4.4, 4.5) -- ensures error handling works
5. **Frontend context tests** (Section 3) -- tests provider fetching/fallback logic
6. **Frontend component tests** (Section 2) -- tests UI behavior and interactions
7. **E2E tests** (Section 5) -- validates full user workflows
8. **Backend edge cases** (Sections 4.6, 4.7) -- low-priority polish
