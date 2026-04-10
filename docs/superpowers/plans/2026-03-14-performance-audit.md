# Performance Audit: Apex Predator Confrontation

**Date:** 2026-03-14
**Scope:** Full-stack performance audit across API efficiency, React rendering, data storage, network, memory, bundle size, backend throughput, and user-perceived performance.

---

## Executive Summary

Story generation currently makes **27 sequential-ish API calls** (5 LLM + 26 image gen + 1 cover image) with images chunked in groups of 4. Each story stores ~3.5 MB of base64 image data in IndexedDB. The library loads _all_ stories into memory on mount with no pagination. There is no React memoization, no code splitting, and no progressive rendering during generation. The biggest wins come from (1) parallelizing the API call waterfall, (2) separating image blobs from metadata in storage, (3) adding lazy loading and virtualization to the library, and (4) streaming progress to the user during generation.

---

## Critical Impact

### 1. Sequential API Waterfall Creates Unnecessary Latency

- **Issue:** Story generation follows a strict sequential pipeline: profiles -> showdown -> aspects -> images (chunked) -> cover. Steps 1, 2, and 3 contain dependencies that are not fully exploited for parallelism.
- **Impact:** Critical
- **Location:** `apex/src/services/StoryGeneratorService.ts`, lines 8-124
- **Current behavior:**
  1. `getAnimalProfile` x2 (parallel) -- **good**
  2. `getShowdownAndOutcome` x1 (serial, waits for profiles) -- **partially necessary**
  3. `getAspectsForAnimal` x2 (parallel) -- **good, but waits for showdown unnecessarily**
  4. Image generation x26 in chunks of 4 (serial chunks) -- **rate-limit constrained**
  5. Cover image x1 (serial, waits for all pages) -- **unnecessary wait**

  The aspects call (step 3) only needs the animal entities, NOT the showdown result. Yet it waits for the showdown to complete because of the sequential `await` on line 24-31 before line 56. The cover image (step 5) only needs animal names, not page data.

- **Proposed fix:**
  ```typescript
  // Run showdown, aspects, AND cover image all in parallel after profiles complete
  const [outcomeData, aspectsA, aspectsB, coverImageUrl] = await Promise.all([
      LlmService.getShowdownAndOutcome(config, animalA, animalB, ...),
      LlmService.getAspectsForAnimal(config, animalA, aspects),
      LlmService.getAspectsForAnimal(config, animalB, aspects),
      ImageService.generateImage(config, coverPrompt, { aspectRatio: '3:2' }),
  ]);
  ```
- **Expected improvement:** Saves ~3-8 seconds (one full LLM round-trip + one image generation that now overlaps with page image generation).
- **Effort:** Small

### 2. All Story Data (Including ~3.5 MB of Base64 Images) Loaded Into Memory on Dashboard Mount

- **Issue:** `StorageService.getAllStories()` uses `localforage.iterate()` to deserialize every single story -- including all 26 base64 image strings per story -- into a single JavaScript array, then sorts it. With 10 stories, this is ~35 MB parsed into memory at once.
- **Impact:** Critical
- **Location:** `apex/src/services/StorageService.ts`, lines 41-51; `apex/src/components/dashboard/Dashboard.tsx`, lines 53-56
- **Current behavior:** On every dashboard mount (including after closing BookViewer), the entire IndexedDB store is iterated, deserialized, and held in React state. The dashboard only displays cover images and metadata -- it never uses the 26 page images.
- **Proposed fix:** Separate storage into two IndexedDB stores:
  1. **`story_manifests`** -- metadata, animal entities, outcome, checklist (small, <5 KB per story)
  2. **`story_pages`** -- keyed by `storyId`, contains the pages array with base64 images

  ```typescript
  // New: lightweight manifest for dashboard listing
  const manifestStore = localforage.createInstance({
      name: 'ApexPredatorApp', storeName: 'story_manifests', driver: localforage.INDEXEDDB
  });
  const pagesStore = localforage.createInstance({
      name: 'ApexPredatorApp', storeName: 'story_pages', driver: localforage.INDEXEDDB
  });

  // Dashboard only loads manifests (fast)
  static async getAllManifests(): Promise<IStoryManifestLite[]> { ... }

  // BookViewer loads full story on demand
  static async getStoryPages(id: string): Promise<IPageContent[]> { ... }
  ```
- **Expected improvement:** Dashboard load goes from deserializing ~3.5 MB/story to ~5 KB/story -- a ~700x reduction per story. 10 stories: 35 MB -> 50 KB.
- **Effort:** Medium

### 3. Image Generation Chunking is Overly Conservative

- **Issue:** Images are generated in sequential chunks of 4 (`chunkSize: number = 4`). Each chunk must fully complete before the next begins. With 26 page images, that is 7 sequential rounds.
- **Impact:** Critical
- **Location:** `apex/src/services/StoryGeneratorService.ts`, lines 105-119
- **Current behavior:** Even if the API rate limit allows higher concurrency, the hard-coded chunk size of 4 throttles throughput. Gemini image generation models typically allow 10-15 RPM for free tier, and 60+ RPM for paid tier.
- **Proposed fix:**
  - Make chunk size configurable and increase default to 6-8 for paid tiers.
  - Start image generation as soon as each aspect's `visualPrompt` is available (pipeline the LLM -> image dependency).
  - Use a semaphore/concurrency limiter (e.g., `p-limit`) instead of chunking, so the next image fires as soon as one completes rather than waiting for the entire chunk.

  ```typescript
  import pLimit from 'p-limit';
  const limit = pLimit(6); // concurrent limit
  const finalPages = await Promise.all(
      rawPages.map(p => limit(async () => {
          const imageUrl = await ImageService.generateImage(config, p.visualPrompt, { aspectRatio: '4:3' });
          return { ...p, imageUrl };
      }))
  );
  ```
- **Expected improvement:** With concurrency of 6 vs chunks of 4: ~30-40% faster image generation phase. With pipelining (starting images before all aspects are done): additional ~10-15% improvement.
- **Effort:** Small (p-limit), Medium (pipelining)

---

## High Impact

### 4. No Pagination or Virtualization on Story Library Grid

- **Issue:** The Dashboard renders every story card simultaneously with no virtualization or pagination. Each card includes a full-resolution base64 cover image rendered as an `<img src={story.coverImageUrl}>`.
- **Impact:** High
- **Location:** `apex/src/components/dashboard/Dashboard.tsx`, lines 201-250
- **Current behavior:** With 20 stories, the browser must decode and render 20 base64 cover images (~100 KB+ each) simultaneously. This causes jank on initial render and high memory usage.
- **Proposed fix:**
  - Add pagination (e.g., 6 stories per page) or infinite scroll.
  - Use `loading="lazy"` on cover images.
  - For larger libraries, use a virtualized grid (e.g., `react-window` or `@tanstack/virtual`).
  ```tsx
  <img
      src={story.coverImageUrl}
      alt={`${story.animalA.commonName} vs ${story.animalB.commonName}`}
      className="cover-image"
      loading="lazy"
      decoding="async"
  />
  ```
- **Expected improvement:** Initial paint time cut by 50-70% for libraries with 10+ stories. Memory usage reduced proportionally.
- **Effort:** Small (lazy loading), Medium (pagination/virtualization)

### 5. Base64 Data URIs for Images Instead of Blob URLs

- **Issue:** Images are stored and rendered as full base64 data URI strings (`data:image/png;base64,...`). Base64 encoding inflates binary data by ~33%. These strings are held in JavaScript heap memory, passed through React's reconciliation, and embedded in DOM attributes.
- **Impact:** High
- **Location:** `server/src/providers/gemini-image.ts`, line 37; `apex/src/services/ImageService.ts`, line 31; `apex/src/types/story.types.ts`, line 23
- **Current behavior:** A 75 KB PNG becomes a ~100 KB base64 string. With 27 images per story, that is ~2.7 MB of actual image data inflated to ~3.6 MB of base64 strings held simultaneously in JS memory and DOM.
- **Proposed fix:**
  - **Option A (storage):** Convert base64 to `Blob` before storing in IndexedDB (IndexedDB natively supports Blob storage and is more efficient).
  - **Option B (rendering):** Convert base64 to object URLs (`URL.createObjectURL(blob)`) at render time, and revoke them on unmount.
  - **Option C (server-side):** Return raw binary from the server, store as Blob, never base64-encode on the client side at all.

  ```typescript
  // Convert base64 data URI to Blob for storage
  function dataUriToBlob(dataUri: string): Blob {
      const [header, data] = dataUri.split(',');
      const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
  }
  ```
- **Expected improvement:** ~33% storage reduction, significant JS heap memory savings, faster IndexedDB reads.
- **Effort:** Medium

### 6. No React Memoization Anywhere

- **Issue:** Neither `Dashboard` nor `BookViewer` use `React.memo`, `useMemo`, or `useCallback` for expensive computations or child components. Every state change (e.g., typing in search, toggling winner reveal) re-renders the entire component tree including all story cards.
- **Impact:** High
- **Location:** `apex/src/components/dashboard/Dashboard.tsx` (entire file); `apex/src/components/book/BookViewer.tsx` (entire file)
- **Current behavior:**
  - Typing in the animal name input triggers `setAnimalA`/`setAnimalB`, which re-renders Dashboard, which re-renders all story cards, all cover images, all buttons.
  - `cycleGenerationStep` (line 37) is wrapped in `useCallback` with `generationMessages.length` as a dependency, but `generationMessages` is recreated on every render (line 26-35), so the callback is re-created every render anyway.
  - `toggleWinnerReveal` (line 17) creates a new function reference on every render.
- **Proposed fix:**
  - Extract `StoryCard` as a `React.memo` component.
  - Memoize `generationMessages` as a module-level constant (it is static).
  - Wrap `handleGenerate`, `handleDelete`, and `toggleWinnerReveal` in `useCallback`.
  - Memoize the sorted stories list with `useMemo`.

  ```tsx
  // Move outside component -- it's static
  const GENERATION_MESSAGES = [
      { emoji: '...', text: '...' },
      // ...
  ];

  // Memoized story card
  const StoryCard = React.memo<StoryCardProps>(({ story, onRead, onDelete, ... }) => (
      <div className="story-card">...</div>
  ));
  ```
- **Expected improvement:** Eliminates unnecessary re-renders of O(n) story cards on every keystroke. Significant improvement when library has 10+ stories.
- **Effort:** Small

### 7. No Progress Feedback During Generation (Fake Progress Bar)

- **Issue:** The generation overlay shows a cycling animation with hardcoded messages that bear no relation to actual progress. The user has no idea if the process is 10% or 90% done.
- **Impact:** High (user-perceived performance)
- **Location:** `apex/src/components/dashboard/Dashboard.tsx`, lines 26-48 and 171-191
- **Current behavior:** `generationMessages` cycles through 8 predefined messages every 3.5 seconds regardless of what is actually happening. The progress bar is a CSS animation, not tied to real progress.
- **Proposed fix:** Pass a progress callback into `StoryGeneratorService.generateStory()`:
  ```typescript
  type ProgressCallback = (step: string, pct: number) => void;

  static async generateStory(config, animalA, animalB, onProgress?: ProgressCallback) {
      onProgress?.('Researching animal profiles...', 5);
      const [profileA, profileB] = await Promise.all([...]);
      onProgress?.('Simulating the showdown...', 15);
      // ...
      for (let i = 0; i < pages.length; i += chunkSize) {
          onProgress?.(`Illustrating page ${i+1} of ${pages.length}...`, 20 + (i / pages.length) * 70);
          // ...
      }
      onProgress?.('Generating cover art...', 95);
  }
  ```
- **Expected improvement:** Dramatically improves perceived performance. Users tolerate waits better when progress is genuine and predictable.
- **Effort:** Small

---

## Medium Impact

### 8. BookViewer Loads Story Then Immediately Writes It Back (Redundant Read-Write on "Mark as Read")

- **Issue:** When opening a book, the viewer loads the full story from IndexedDB, then immediately calls `updateStory` which does _another_ full read (`getStory`) plus a full write (`setItem`) of the entire ~3.5 MB story object -- just to flip `hasBeenRead` from `false` to `true`.
- **Impact:** Medium
- **Location:** `apex/src/components/book/BookViewer.tsx`, lines 13-24; `apex/src/services/StorageService.ts`, lines 69-79
- **Current behavior:** `updateStory` calls `getStory(id)` again (redundant, we already have the data), spreads updates, and writes the entire story back. For a 3.5 MB story this is a pointless 3.5 MB re-read + 3.5 MB re-write.
- **Proposed fix:**
  - Pass the already-loaded story to `updateStory` directly instead of re-reading.
  - Better yet, with the split storage model (issue #2), `hasBeenRead` lives in the lightweight manifest store, so the update becomes a ~5 KB write.

  ```typescript
  // Avoid redundant read: accept the existing object
  static async updateStoryDirect(story: IStoryManifest): Promise<void> {
      await storyStore.setItem(story.metadata.id, story);
  }
  ```
- **Expected improvement:** Eliminates one full IndexedDB read (~3.5 MB) and reduces write to metadata-only with split storage.
- **Effort:** Small

### 9. No Code Splitting or Lazy Loading of BookViewer

- **Issue:** `BookViewer` and `react-pageflip` are eagerly imported in `App.tsx`, increasing initial bundle size even when the user is on the dashboard and has never opened a book.
- **Impact:** Medium
- **Location:** `apex/src/App.tsx`, lines 2-3
- **Current behavior:** `react-pageflip` (and its dependencies) are in the main bundle. The dashboard never uses them.
- **Proposed fix:**
  ```tsx
  import { lazy, Suspense } from 'react';
  const BookViewer = lazy(() => import('./components/book/BookViewer'));

  function App() {
      const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
      return (
          <AiConfigProvider>
              <main>
                  {currentStoryId ? (
                      <Suspense fallback={<div className="loading-book">Loading book...</div>}>
                          <BookViewer storyId={currentStoryId} onClose={() => setCurrentStoryId(null)} />
                      </Suspense>
                  ) : (
                      <Dashboard onReadStory={setCurrentStoryId} />
                  )}
              </main>
          </AiConfigProvider>
      );
  }
  ```
- **Expected improvement:** Reduces initial JS bundle by the size of `react-pageflip` + `BookViewer` (~20-40 KB gzipped). Faster first paint on dashboard.
- **Effort:** Small

### 10. Google Font Loaded Synchronously Blocks Rendering

- **Issue:** `index.css` line 1 imports `https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap` via `@import url(...)`. CSS `@import` is render-blocking.
- **Impact:** Medium
- **Location:** `apex/src/index.css`, line 1
- **Current behavior:** The browser must fetch and parse the Google Fonts CSS before rendering any content. On slow connections this can add 200-800ms to first contentful paint.
- **Proposed fix:** Move the font import to a `<link>` tag in `index.html` with `rel="preconnect"` and `font-display: swap`:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap">
  ```
  And remove the `@import` from `index.css`.
- **Expected improvement:** 100-500ms faster first contentful paint, especially on slower connections.
- **Effort:** Small

### 11. No Error Recovery or Retry Logic for Failed Image Generations

- **Issue:** If any single image generation fails (network error, rate limit, API timeout), `ImageService.generateImage` silently returns an empty string. The story is saved with missing images, and there is no way to regenerate just the failed ones.
- **Impact:** Medium
- **Location:** `apex/src/services/ImageService.ts`, lines 24-35; `apex/src/services/StoryGeneratorService.ts`, lines 105-119
- **Current behavior:** Failed images result in `imageUrl: ''`, which renders as a placeholder div. A single transient failure permanently corrupts the story.
- **Proposed fix:**
  - Add retry with exponential backoff (1s, 2s, 4s) for transient failures.
  - Track failed pages and offer a "Regenerate missing images" action.
  ```typescript
  static async generateImage(config, prompt, options, retries = 3): Promise<string> {
      for (let attempt = 0; attempt < retries; attempt++) {
          try {
              const res = await fetch('/api/image/generate', { ... });
              if (res.ok) {
                  const body = await res.json();
                  return body.imageDataUri || '';
              }
              if (res.status === 429 && attempt < retries - 1) {
                  await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
                  continue;
              }
          } catch (error) {
              if (attempt < retries - 1) {
                  await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
                  continue;
              }
          }
          return '';
      }
      return '';
  }
  ```
- **Expected improvement:** Reduces story corruption from transient API failures from ~10-20% to <2%.
- **Effort:** Small

### 12. Server Returns Full Base64 Image in JSON Response Body

- **Issue:** The image route wraps the entire base64 data URI in a JSON response (`{ imageDataUri: "data:image/png;base64,..." }`). This means the image binary is: (1) base64 encoded by Gemini, (2) wrapped in JSON, (3) parsed as a JSON string, (4) held as a JS string. JSON parsing of a 100 KB+ string is inefficient.
- **Impact:** Medium
- **Location:** `server/src/routes/image.ts`, lines 18-20; `server/src/providers/gemini-image.ts`, line 37
- **Current behavior:** The server receives base64 from Gemini, wraps it in `{ imageDataUri }`, serializes to JSON, sends it. The client parses the JSON, extracts the string. This double-encoding adds overhead.
- **Proposed fix:** Return the image as a binary response with appropriate Content-Type header:
  ```typescript
  // Server: return raw binary
  const result = await adapter.generate({ ... });
  const [header, data] = result.imageDataUri.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = Buffer.from(data, 'base64');
  return new Response(binary, { headers: { 'Content-Type': mime } });
  ```
  ```typescript
  // Client: receive as blob
  const res = await fetch('/api/image/generate', { ... });
  const blob = await res.blob();
  return URL.createObjectURL(blob);
  ```
  This eliminates the base64 -> JSON -> parse -> base64 round-trip entirely.
- **Expected improvement:** ~33% less data transferred per image, faster response parsing, lower memory footprint during generation.
- **Effort:** Medium

### 13. Dashboard Re-Loads All Stories After Each Generation

- **Issue:** After generating and saving a new story, `handleGenerate` calls `loadStories()` which re-reads the _entire_ IndexedDB store (all stories, all images).
- **Impact:** Medium
- **Location:** `apex/src/components/dashboard/Dashboard.tsx`, lines 68-72
- **Current behavior:** `await loadStories()` on line 72 triggers `StorageService.getAllStories()`, deserializing every story again. This is especially wasteful since we just created the new story and already have it in memory.
- **Proposed fix:** Optimistically prepend the new story to the existing state:
  ```typescript
  const newStory = await StoryGeneratorService.generateStory(config, animalA.trim(), animalB.trim());
  await StorageService.saveStory(newStory);
  setStories(prev => [newStory, ...prev]); // Optimistic prepend
  ```
- **Expected improvement:** Eliminates a full IndexedDB scan after every generation. With split storage (issue #2) this becomes less critical, but still avoids an unnecessary read.
- **Effort:** Small

### 14. `generationMessages` Array Recreated Every Render

- **Issue:** The `generationMessages` array on line 26-35 of Dashboard.tsx is defined inside the component body, so it is recreated on every render. This also means `cycleGenerationStep` (which depends on `generationMessages.length`) is recreated every render despite its `useCallback`.
- **Impact:** Medium (contributes to re-render inefficiency)
- **Location:** `apex/src/components/dashboard/Dashboard.tsx`, lines 26-39
- **Current behavior:** On every render: new array allocated -> new `.length` value (same but new reference) -> `useCallback` invalidated -> `useEffect` cleanup and re-register of interval.
- **Proposed fix:** Move `generationMessages` to module scope (it is a static constant):
  ```typescript
  // Outside component
  const GENERATION_MESSAGES = [
      { emoji: '...', text: '...' },
      // ...
  ] as const;

  // Inside component
  const cycleGenerationStep = useCallback(() => {
      setGenerationStep(prev => (prev + 1) % GENERATION_MESSAGES.length);
  }, []); // Now truly stable
  ```
- **Expected improvement:** Eliminates interval teardown/setup on every render while generating.
- **Effort:** Small

### 15. `uuid` Package for Simple ID Generation

- **Issue:** The full `uuid` package (v13) is imported just for `v4()` UUID generation. This adds bundle weight for a feature that `crypto.randomUUID()` provides natively in all modern browsers.
- **Impact:** Medium (bundle size)
- **Location:** `apex/src/services/StoryGeneratorService.ts`, line 1; `apex/package.json`
- **Current behavior:** `uuid` v13 adds ~3-5 KB to the bundle (minified + gzipped). It also requires `@types/uuid`.
- **Proposed fix:**
  ```typescript
  // Replace: import { v4 as uuidv4 } from 'uuid';
  // With:
  const id = crypto.randomUUID();
  ```
  Then remove `uuid` and `@types/uuid` from package.json.
- **Expected improvement:** ~3-5 KB bundle reduction. One fewer dependency to maintain.
- **Effort:** Small

---

## Low Impact

### 16. No HTTP Compression Configured on Backend

- **Issue:** The Elysia server does not configure gzip/brotli compression. JSON responses (especially the large image data URIs) are sent uncompressed.
- **Impact:** Low (dev only -- Vite proxies in dev; matters for production deployment)
- **Location:** `server/src/index.ts`
- **Current behavior:** All responses are uncompressed. Base64 strings compress well (~20-30% smaller with gzip).
- **Proposed fix:**
  ```typescript
  import { compression } from 'elysia-compression';
  const app = new Elysia()
      .use(compression())
      // ...
  ```
  If using the binary image response approach from issue #12, images are already compressed (PNG) and this becomes less relevant.
- **Expected improvement:** 20-30% smaller response payloads for JSON/text content.
- **Effort:** Small

### 17. No Request Deduplication or Caching for LLM Calls

- **Issue:** If a user generates two stories with the same animal (e.g., Lion), the profile for "Lion" is fetched from the LLM API again. There is no caching layer.
- **Impact:** Low (users rarely repeat the same animal pair; LLM calls are relatively cheap)
- **Location:** `apex/src/services/LlmService.ts`; `server/src/routes/llm.ts`
- **Current behavior:** Every generation makes fresh LLM calls regardless of prior results.
- **Proposed fix:** Add a simple in-memory or localStorage cache for animal profiles (they are deterministic for the same animal):
  ```typescript
  const profileCache = new Map<string, Promise<AnimalProfile>>();

  static async getAnimalProfile(config, animalName) {
      const key = `${config.llmProvider}:${animalName.toLowerCase()}`;
      if (!profileCache.has(key)) {
          profileCache.set(key, callLlm(config, ...));
      }
      return profileCache.get(key)!;
  }
  ```
- **Expected improvement:** Saves 1-2 LLM calls when an animal is reused across stories (~2-4 seconds).
- **Effort:** Small

### 18. CORS Hardcoded to Single Origin

- **Issue:** CORS is configured with `origin: 'http://localhost:5173'`. This will break in production or when using a different port.
- **Impact:** Low (operational, not strictly performance)
- **Location:** `server/src/index.ts`, line 33
- **Current behavior:** Only the Vite dev server origin is allowed. Any other client origin will be blocked.
- **Proposed fix:**
  ```typescript
  .use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
  }))
  ```
- **Expected improvement:** Operational correctness for deployment.
- **Effort:** Small

### 19. BookViewer Renders All 32+ Page DOM Nodes at Once

- **Issue:** `react-pageflip` renders all pages as DOM nodes simultaneously, even though only 1-2 pages are visible at a time. Each page contains a decoded base64 image.
- **Impact:** Low (react-pageflip requires all pages in DOM for flip animations; limited mitigation possible)
- **Location:** `apex/src/components/book/BookViewer.tsx`, lines 88-130
- **Current behavior:** 26 `<img>` elements with base64 `src` attributes are rendered at once. The browser decodes all of them.
- **Proposed fix:** Use `loading="lazy"` and `decoding="async"` on page images:
  ```tsx
  <img
      src={page.imageUrl}
      alt="Generated Illustration"
      className="generated-image"
      loading="lazy"
      decoding="async"
  />
  ```
  This tells the browser to defer decoding of off-screen images. With the Blob URL approach from issue #5, combined with lazy loading, memory usage would be significantly reduced.
- **Expected improvement:** Faster initial book render, lower peak memory during reading.
- **Effort:** Small

### 20. Anthropic Adapter Uses `claude-opus-4-6` as Default (Expensive and Slow)

- **Issue:** The Anthropic adapter defaults to `claude-opus-4-6` which is the most expensive and slowest Anthropic model. For structured data extraction (profiles, aspects), a faster model like `claude-sonnet-4-20250514` would be equally capable.
- **Impact:** Low (cost/speed trade-off; user can override via config)
- **Location:** `server/src/providers/anthropic-llm.ts`, line 4
- **Current behavior:** Every Anthropic LLM call defaults to Opus, costing ~5-10x more and taking ~2x longer than Sonnet for structured extraction tasks.
- **Proposed fix:** Change default to `claude-sonnet-4-20250514` or make it configurable per-task:
  ```typescript
  const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
  ```
- **Expected improvement:** ~50% faster LLM responses at ~80% lower cost, with negligible quality difference for structured data extraction.
- **Effort:** Small

---

## Implementation Priority Matrix

| Priority | Issue | Effort | Expected Impact |
|----------|-------|--------|-----------------|
| **P0** | #1 API Waterfall Parallelization | Small | -3-8s generation time |
| **P0** | #2 Split Storage (metadata vs images) | Medium | -700x dashboard load data |
| **P0** | #3 Smarter Image Concurrency (p-limit) | Small | -30-40% image gen time |
| **P1** | #7 Real Progress Feedback | Small | Major perceived perf gain |
| **P1** | #6 React Memoization | Small | Eliminates O(n) re-renders |
| **P1** | #4 Library Lazy Loading / Pagination | Small-Med | -50-70% initial paint |
| **P1** | #5 Blob Storage Instead of Base64 | Medium | -33% storage, lower memory |
| **P2** | #9 Code Split BookViewer | Small | Smaller initial bundle |
| **P2** | #12 Binary Image Responses | Medium | -33% network per image |
| **P2** | #11 Retry Logic for Images | Small | Fewer corrupted stories |
| **P2** | #10 Font Loading Optimization | Small | -100-500ms FCP |
| **P3** | #13 Optimistic Story Append | Small | Skip full re-read |
| **P3** | #14 Static Generation Messages | Small | Stable intervals |
| **P3** | #15 Replace uuid with crypto.randomUUID | Small | -3-5 KB bundle |
| **P3** | #8 Avoid Redundant Read on Mark-As-Read | Small | Save one 3.5 MB read |
| **P4** | #19 Lazy Image Decoding in BookViewer | Small | Lower peak memory |
| **P4** | #20 Default to Sonnet Over Opus | Small | 2x faster, 5x cheaper |
| **P4** | #17 Profile Caching | Small | Save occasional LLM calls |
| **P4** | #16 HTTP Compression | Small | Smaller payloads |
| **P4** | #18 Configurable CORS | Small | Deploy readiness |

---

## Combined Impact Estimate

If all P0-P1 issues are addressed:
- **Story generation time:** ~40-50% faster (parallelization + smarter concurrency + real progress)
- **Dashboard load time:** ~90% faster for libraries with 5+ stories (split storage + lazy loading)
- **Memory usage:** ~70% reduction during dashboard browsing (no page images in memory)
- **Bundle size:** ~25-40 KB smaller initial load (code splitting + uuid removal)
- **User satisfaction:** Dramatically improved (real progress, faster loads, no corruption from failed images)
