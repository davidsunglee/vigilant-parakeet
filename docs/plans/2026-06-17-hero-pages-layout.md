# Hero Pages Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the cover, showdown, and verdict art in full (uncropped) with the page text in a panel below it, instead of cropping the art and overlaying text on top.

**Architecture:** A shared `.rd-hero` reader layout (full 3:2 art region on top, text panel below) used by three parallel components (`BookCover`, `Showdown`, `Verdict`). The generation pipeline renders the showdown (page 31) and outcome (page 32) images at 3:2 to match. Existing books get their 31/32 images re-rendered at 3:2.

**Tech Stack:** React + Vitest + Testing Library (`apex/`); Bun test + TypeScript (`trigger/`); Supabase Storage; OpenAI image generation.

## Global Constraints

- Showdown (page index 31) and outcome (page index 32) images render at `3:2`; all chapter pages stay `3:4`. `3:2` maps to `1536x1024` in `trigger/src/providers/openai-image.ts`.
- Copy and docs use no em dashes or en dashes. Use hyphens, colons, or parentheses.
- The reader stays inside the existing Journal look (reuse the `--apex-*` tokens and the existing kicker/seal/serif styling); do not introduce a new theme.
- Apex tests run with `cd apex && npx vitest run <file>`. Trigger tests run with `cd trigger && bun test <file>` (or `bun run test` for typecheck + all tests).
- Commit after each task. Conventional-commit style (`feat:`, `fix:`, `test:`, `refactor:`).

---

## File Structure

- `trigger/src/lib/pipeline.ts` - choose image aspect ratio per page (31/32 land at 3:2).
- `trigger/src/lib/__tests__/pipeline.test.ts` - assert per-page aspect ratios.
- `apex/src/components/book/BookViewer.css` - add the shared `.rd-hero`/`.rd-hero-art`/`.rd-hero-panel` layout; replace the old `.rd-cover*`, `.rd-showdown*`, `.rd-verdict*` overlay rules.
- `apex/src/components/book/BookCover.tsx` (+ `BookCover.test.tsx`) - art + panel.
- `apex/src/components/book/Showdown.tsx` (new, + `Showdown.test.tsx`) - art + panel; extracted from `BookViewer`.
- `apex/src/components/book/Verdict.tsx` (+ `Verdict.test.tsx`) - art + panel; keep the seal/reveal logic.
- `apex/src/components/book/BookViewer.tsx` - render `<Showdown />` for the `showdown` view kind.
- Throwaway `trigger/rerender-hero-images.ts` (not committed) - re-render existing 31/32 at 3:2.

---

## Task 1: Generation renders showdown and outcome at 3:2

**Files:**
- Modify: `trigger/src/lib/pipeline.ts` (the page-image generation loop)
- Test: `trigger/src/lib/__tests__/pipeline.test.ts`

**Interfaces:**
- Consumes: `deps.image.generateImage(prompt, { aspectRatio, styleAnchor })` (existing).
- Produces: nothing new; behavior change only (pages 31/32 request `aspectRatio: '3:2'`).

- [ ] **Step 1: Replace the existing 3:4 aspect test with one covering both aspects**

In `trigger/src/lib/__tests__/pipeline.test.ts`, find this existing test and replace it entirely:

```ts
  it('generates page images at the crop-safe 3:4 portrait aspect', async () => {
    const { deps, image } = makeDeps();
    await runGenerationPipeline(deps, PAYLOAD);
    const pageCalls = (image.generateImage.mock.calls as any[][]).filter(
      (call) => call[1]?.aspectRatio === '3:4',
    );
    expect(pageCalls).toHaveLength(14);
  });
```

with:

```ts
  it('renders chapter pages at 3:4 and the showdown/outcome at 3:2', async () => {
    const { deps, image } = makeDeps();
    await runGenerationPipeline(deps, PAYLOAD);
    const calls = image.generateImage.mock.calls as any[][];
    const aspectFor = (visualPrompt: string) =>
      calls.find((c) => c[0] === visualPrompt)?.[1]?.aspectRatio;

    // Showdown (31) and outcome (32) are landscape, matching the cover.
    expect(aspectFor('Both animals staring')).toBe('3:2');
    expect(aspectFor('Lion stands victorious')).toBe('3:2');

    // 12 chapter pages stay portrait; the 3:2 calls are cover + showdown + outcome.
    expect(calls.filter((c) => c[1]?.aspectRatio === '3:4')).toHaveLength(12);
    expect(calls.filter((c) => c[1]?.aspectRatio === '3:2')).toHaveLength(3);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd trigger && bun test src/lib/__tests__/pipeline.test.ts`
Expected: FAIL. `aspectFor('Both animals staring')` is `'3:4'`, not `'3:2'`; the 3:4 filter has length 14 and the 3:2 filter has length 1.

- [ ] **Step 3: Choose the aspect per page in the generation loop**

In `trigger/src/lib/pipeline.ts`, the page-image loop currently contains:

```ts
        const base64 = await deps.image.generateImage(page.visualPrompt, {
          aspectRatio: '3:4',
          styleAnchor: artStyleAnchor,
        });
```

Replace those lines with:

```ts
        // Showdown (31) and outcome (32) are landscape hero pages, matching the
        // cover; chapter pages stay portrait vignettes.
        const aspectRatio = page.index === 31 || page.index === 32 ? '3:2' : '3:4';
        const base64 = await deps.image.generateImage(page.visualPrompt, {
          aspectRatio,
          styleAnchor: artStyleAnchor,
        });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd trigger && bun test src/lib/__tests__/pipeline.test.ts`
Expected: PASS (all pipeline tests).

- [ ] **Step 5: Run the full trigger suite (typecheck + tests)**

Run: `cd trigger && bun run test`
Expected: typecheck clean, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add trigger/src/lib/pipeline.ts trigger/src/lib/__tests__/pipeline.test.ts
git commit -m "feat(generation): render showdown and outcome pages at 3:2"
```

---

## Task 2: Shared hero layout and the cover

**Files:**
- Modify: `apex/src/components/book/BookViewer.css` (add `.rd-hero*`; replace `.rd-cover*`)
- Modify: `apex/src/components/book/BookCover.tsx`
- Test: `apex/src/components/book/BookCover.test.tsx`

**Interfaces:**
- Produces: CSS classes `.rd-hero`, `.rd-hero-art`, `.rd-hero-panel` consumed by Tasks 3 and 4. `.rd-hero-art` holds an `<img>`; `.rd-hero-panel` holds in-flow text.
- `BookCover` props are unchanged: `{ manifest: IStoryManifest; signed: Record<string, string> }`.

- [ ] **Step 1: Add panel-structure assertions to the cover test**

In `apex/src/components/book/BookCover.test.tsx`, add this test inside the `describe('BookCover', ...)` block:

```tsx
  it('shows the cover art on top and the title text in the panel below', () => {
    const manifest = createMockStory({ coverImageUrl: 'stories/s/cover.png' });
    render(<BookCover manifest={manifest} signed={{ 'stories/s/cover.png': 'https://signed/cover.png' }} />);

    expect(screen.getByAltText('Lion versus Tiger').closest('.rd-hero-art')).not.toBeNull();
    expect(screen.getByText('Who Would Win?').closest('.rd-hero-panel')).not.toBeNull();
    expect(screen.getByText('Lion').closest('.rd-hero-panel')).not.toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apex && npx vitest run src/components/book/BookCover.test.tsx`
Expected: FAIL. `.rd-hero-art` and `.rd-hero-panel` do not exist yet (`closest` returns null).

- [ ] **Step 3: Restructure BookCover to art + panel**

Replace the body of `apex/src/components/book/BookCover.tsx` (the `return (...)`) with:

```tsx
  return (
    <div className="rd-hero rd-hero--cover">
      <div className="rd-hero-art">
        {coverUrl && (
          <img src={coverUrl} alt={`${a} versus ${b}`} loading="lazy" decoding="async" />
        )}
      </div>
      <div className="rd-hero-panel rd-cover-panel">
        <div className="rd-cover-kicker">An Apex Publication</div>
        <div className="rd-cover-emblem" aria-hidden="true">&amp;</div>
        <div className="rd-cover-q">Who Would Win?</div>
        <div className="rd-cover-match">
          <span className="rd-cover-name">{a}</span>
          <span className="rd-cover-amp" aria-hidden="true">&amp;</span>
          <span className="rd-cover-name">{b}</span>
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 4: Add the shared hero CSS and cover panel styles**

In `apex/src/components/book/BookViewer.css`, delete the old cover rules (the block from `/* ---- Cover ---- */` through `.rd-cover-amp { ... }`, i.e. `.rd-cover`, `.rd-cover-img`, `.rd-cover-scrim`, `.rd-cover-kicker`, `.rd-cover-cartouche`, `.rd-cover-cartouche::before`, `.rd-cover-emblem`, `.rd-cover-q`, `.rd-cover-match`, `.rd-cover-name`, `.rd-cover-amp`) and add this in their place:

```css
/* ---- Hero pages (cover, showdown, verdict): full 3:2 art + text panel below ---- */
.rd-hero {
  display: flex; flex-direction: column;
  width: min(820px, 92vw); max-height: 84vh;
  border: 1px solid var(--apex-gilt); border-radius: 5px; overflow: hidden;
  background: linear-gradient(170deg, var(--apex-surface), var(--apex-paper));
  box-shadow: 0 16px 40px rgba(90, 60, 20, 0.24);
}
.rd-hero-art {
  position: relative; width: 100%; aspect-ratio: 3 / 2;
  max-height: 56vh; flex-shrink: 0; overflow: hidden;
  background: linear-gradient(150deg, #cdb88f, #6f5733);
}
.rd-hero-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rd-hero-panel {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 0.4rem; padding: clamp(0.9rem, 2.4vw, 1.3rem) clamp(1rem, 3vw, 1.8rem) clamp(1rem, 2.6vw, 1.4rem);
}

/* Cover panel */
.rd-cover-kicker { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #a8854a; }
.rd-cover-emblem {
  width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--apex-font-display); font-size: 1.25rem; color: var(--apex-forest);
  border: 1.5px solid var(--apex-gilt); box-shadow: inset 0 0 0 2px var(--apex-paper-hi);
}
.rd-cover-q { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #a8854a; }
.rd-cover-match { display: flex; align-items: center; gap: 0.6rem; }
.rd-cover-name { font-family: var(--apex-font-display); font-weight: 600; font-size: 1.15rem; color: var(--apex-ink); }
.rd-cover-amp { font-family: var(--apex-font-display); font-size: 1.45rem; color: var(--apex-gilt); line-height: 1; }
```

- [ ] **Step 5: Run the cover test to verify it passes**

Run: `cd apex && npx vitest run src/components/book/BookCover.test.tsx`
Expected: PASS (both the existing tests and the new one).

- [ ] **Step 6: Verify the layout in the running app**

Launch the app (use the `run-app-locally` skill) and open any book to the cover. Confirm: the full cover art shows with no crop, the title card sits in the panel below the art (not over the animals). On a standard desktop window the full 3:2 art should be visible without side-cropping; if the art is being side-cropped because `max-height: 56vh` is clamping it, reduce `.rd-hero` width (for example `min(760px, 92vw)`) or raise `max-height` until the full 3:2 shows. This is the flagged layout-risk tuning step.

- [ ] **Step 7: Commit**

```bash
git add apex/src/components/book/BookViewer.css apex/src/components/book/BookCover.tsx apex/src/components/book/BookCover.test.tsx
git commit -m "feat(reader): cover uses full art with title panel below"
```

---

## Task 3: Showdown component

**Files:**
- Create: `apex/src/components/book/Showdown.tsx`
- Create: `apex/src/components/book/Showdown.test.tsx`
- Modify: `apex/src/components/book/BookViewer.tsx`
- Modify: `apex/src/components/book/BookViewer.css` (showdown panel styles)

**Interfaces:**
- Consumes: `.rd-hero`, `.rd-hero-art`, `.rd-hero-panel` (Task 2); `IPageContent` from `../../types/story.types`.
- Produces: `Showdown` component with props `{ page: IPageContent; signed: Record<string, string> }`.

- [ ] **Step 1: Write the failing Showdown test**

Create `apex/src/components/book/Showdown.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Showdown } from './Showdown';
import { IPageContent } from '../../types/story.types';

const page: IPageContent = {
  index: 31,
  title: 'The Showdown',
  bodyText: 'They face off!',
  visualPrompt: 'Both animals staring',
  imageUrl: 'stories/s/31.png',
  isLeftPage: true,
};

describe('Showdown', () => {
  it('renders the art on top and the intro text in the panel below', () => {
    render(<Showdown page={page} signed={{ 'stories/s/31.png': 'https://signed/31.png' }} />);

    const img = screen.getByAltText('The showdown');
    expect(img).toHaveAttribute('src', 'https://signed/31.png');
    expect(img.closest('.rd-hero-art')).not.toBeNull();
    expect(screen.getByText('They face off!').closest('.rd-hero-panel')).not.toBeNull();
    expect(screen.getByText('The Showdown')).toBeInTheDocument();
  });

  it('renders without an image when no signed URL is available', () => {
    render(<Showdown page={page} signed={{}} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('They face off!')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apex && npx vitest run src/components/book/Showdown.test.tsx`
Expected: FAIL with a module-not-found error for `./Showdown`.

- [ ] **Step 3: Create the Showdown component**

Create `apex/src/components/book/Showdown.tsx`:

```tsx
import React from 'react';
import { IPageContent } from '../../types/story.types';

export interface ShowdownProps {
  page: IPageContent;
  signed: Record<string, string>;
}

export const Showdown: React.FC<ShowdownProps> = ({ page, signed }) => {
  const url = page.imageUrl ? signed[page.imageUrl] : undefined;

  return (
    <div className="rd-hero rd-hero--showdown">
      <div className="rd-hero-art">
        {url && <img src={url} alt="The showdown" loading="lazy" decoding="async" />}
      </div>
      <div className="rd-hero-panel rd-showdown-panel">
        <span className="rd-showdown-kicker">The Showdown</span>
        <p className="rd-showdown-text">{page.bodyText}</p>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apex && npx vitest run src/components/book/Showdown.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render Showdown from BookViewer**

In `apex/src/components/book/BookViewer.tsx`, add the import near the other component imports:

```tsx
import { Showdown } from './Showdown';
```

Then replace the inline `showdown` case in `renderView`:

```tsx
    case 'showdown': {
      const url = view.page.imageUrl ? signed[view.page.imageUrl] : undefined;
      return (
        <div className="rd-showdown">
          {url && (
            <img src={url} alt="The showdown" className="rd-showdown-img" loading="lazy" decoding="async" />
          )}
          <div className="rd-showdown-scrim" aria-hidden="true" />
          <div className="rd-showdown-caption">
            <span className="rd-showdown-kicker">The Showdown</span>
            <p>{view.page.bodyText}</p>
          </div>
        </div>
      );
    }
```

with:

```tsx
    case 'showdown':
      return <Showdown page={view.page} signed={signed} />;
```

- [ ] **Step 6: Replace the showdown CSS with panel styles**

In `apex/src/components/book/BookViewer.css`, delete the old showdown rules (`.rd-showdown, .rd-verdict { ... }` shared container, `.rd-showdown-img, .rd-verdict-img`, `.rd-showdown-scrim, .rd-verdict-scrim`, `.rd-showdown-caption`, `.rd-showdown-kicker`, `.rd-showdown-caption p`) and add the showdown panel styles. (The `.rd-verdict-*` panel styles are handled in Task 4; this step removes the shared container and the showdown-specific overlay rules.)

```css
/* Showdown panel */
.rd-showdown-kicker { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #a8854a; }
.rd-showdown-text { font-family: var(--apex-font-serif); font-style: italic; font-size: 1.02rem; line-height: 1.5; color: var(--apex-ink-soft); }
```

- [ ] **Step 7: Run the showdown and book viewer tests**

Run: `cd apex && npx vitest run src/components/book/Showdown.test.tsx src/components/book/BookViewer.test.tsx`
Expected: PASS (BookViewer's existing navigation/labeling tests still pass; Showdown passes).

- [ ] **Step 8: Verify the layout in the running app**

Open a book and navigate to the showdown page. Confirm the full art shows uncropped and the intro text sits in the panel below.

- [ ] **Step 9: Commit**

```bash
git add apex/src/components/book/Showdown.tsx apex/src/components/book/Showdown.test.tsx apex/src/components/book/BookViewer.tsx apex/src/components/book/BookViewer.css
git commit -m "feat(reader): extract Showdown into full-art-with-text-below component"
```

---

## Task 4: Verdict component

**Files:**
- Modify: `apex/src/components/book/Verdict.tsx`
- Test: `apex/src/components/book/Verdict.test.tsx`
- Modify: `apex/src/components/book/BookViewer.css` (verdict panel styles)

**Interfaces:**
- Consumes: `.rd-hero`, `.rd-hero-art`, `.rd-hero-panel` (Task 2).
- `Verdict` props unchanged: `{ manifest: IStoryManifest; outcomePage: IPageContent | null; signed: Record<string, string> }`.

- [ ] **Step 1: Add a panel-structure test**

In `apex/src/components/book/Verdict.test.tsx`, add this test (keep the two existing tests, which still pass):

```tsx
  it('shows the outcome art on top with the verdict text in the panel below', async () => {
    const manifest = createMockStory();
    const outcomePage = {
      index: 32, title: 'Outcome', bodyText: '', visualPrompt: '',
      imageUrl: 'stories/s/32.png', isLeftPage: false,
    };
    render(<Verdict manifest={manifest} outcomePage={outcomePage} signed={{ 'stories/s/32.png': 'https://signed/32.png' }} />);

    const img = screen.getByAltText('The outcome');
    expect(img).toHaveAttribute('src', 'https://signed/32.png');
    expect(img.closest('.rd-hero-art')).not.toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: /break the seal/i }));
    expect(screen.getByText('The lion wins due to superior teamwork.').closest('.rd-hero-panel')).not.toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apex && npx vitest run src/components/book/Verdict.test.tsx`
Expected: FAIL on the new test. `.rd-hero-art` does not exist in the current Verdict markup (`closest` returns null).

- [ ] **Step 3: Restructure Verdict to art + panel**

Replace the `return (...)` in `apex/src/components/book/Verdict.tsx` with:

```tsx
  return (
    <div className={`rd-hero rd-hero--verdict ${surprise ? 'rd-verdict--surprise' : ''}`}>
      <div className="rd-hero-art">
        {artUrl && <img src={artUrl} alt="The outcome" loading="lazy" decoding="async" />}
      </div>

      <div className="rd-hero-panel rd-verdict-panel">
        <div className="rd-verdict-kicker">The Verdict</div>

        {!revealed ? (
          <button
            type="button"
            className="rd-verdict-seal rd-verdict-seal--sealed"
            onClick={() => setRevealed(true)}
          >
            <span className="rd-verdict-seal-mark" aria-hidden="true">&#10022;</span>
            <span className="rd-verdict-seal-label">The verdict is in. Break the seal.</span>
          </button>
        ) : surprise ? (
          <>
            <div className="rd-verdict-seal rd-verdict-seal--surprise">
              <span className="rd-verdict-star" aria-hidden="true">&#10022;</span>
              <span className="rd-verdict-twist">An Unexpected Turn</span>
            </div>
            <span className="rd-verdict-stamp">{outcome.endingType}</span>
            <p className="rd-verdict-reason">{outcome.logicalReasoning}</p>
          </>
        ) : (
          <>
            <div className="rd-verdict-seal rd-verdict-seal--victor">
              <span className="rd-verdict-victor-label">Victor</span>
              <span className="rd-verdict-victor-name">{name}</span>
            </div>
            <p className="rd-verdict-reason">{outcome.logicalReasoning}</p>
          </>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 4: Replace the verdict CSS overlay rules with panel styles**

In `apex/src/components/book/BookViewer.css`, delete the `.rd-verdict-cartouche` and `.rd-verdict-cartouche::before` rules (the absolute-positioned overlay wrapper). Keep the inner verdict styles (`.rd-verdict-kicker`, `.rd-verdict-seal*`, `.rd-verdict-victor*`, `.rd-verdict-twist`, `.rd-verdict-stamp`, `.rd-verdict-reason`) since they style content that now lives in the panel. Add one rule so a surprise verdict tints its panel:

```css
/* Verdict panel: inner seal/victor/reason styles are reused as-is from the old cartouche */
.rd-hero--verdict.rd-verdict--surprise .rd-verdict-panel { background: linear-gradient(180deg, rgba(247, 234, 210, 0.6), transparent); }
```

- [ ] **Step 5: Run the verdict test to verify it passes**

Run: `cd apex && npx vitest run src/components/book/Verdict.test.tsx`
Expected: PASS (all three tests).

- [ ] **Step 6: Run the full reader test suite**

Run: `cd apex && npx vitest run src/components/book`
Expected: PASS (BookCover, Showdown, Verdict, BookViewer, and the rest).

- [ ] **Step 7: Verify the layout in the running app**

Open a book to the verdict page. Confirm: the outcome art shows in full on top, the seal/reveal lives in the panel below and does not cover the art, and revealing expands the panel without moving the art. If a long reasoning paragraph overflows on a short window, confirm the panel scrolls (it has `overflow-y: auto`).

- [ ] **Step 8: Commit**

```bash
git add apex/src/components/book/Verdict.tsx apex/src/components/book/Verdict.test.tsx apex/src/components/book/BookViewer.css
git commit -m "feat(reader): verdict uses full art with seal and reasoning below"
```

---

## Task 5: Re-render existing books' showdown and outcome at 3:2

**Files:**
- Create (throwaway, not committed): `trigger/rerender-hero-images.ts`

**Interfaces:**
- Consumes: `createServiceClient` (`./src/lib/supabase`), `AnthropicLlmAdapter`-free path (no LLM call), `OpenAiImageAdapter` + `ImageClient` (`./src/lib/image`), `uploadImage` (`./src/lib/storage`), `DEFAULT_GENERATION_CONFIG` (`./src/config`), `FIERCE_MODE_DESCRIPTOR` (`./src/types/artStyle`).
- This is a data step, not application code. It re-renders existing 31/32 images at 3:2 using each book's already-stored visual prompt. No manifest change.

- [ ] **Step 1: Write the re-render script**

Create `trigger/rerender-hero-images.ts`:

```ts
// THROWAWAY: re-render every ready book's showdown (31) and outcome (32) images
// at 3:2 to match the new hero layout. Uses each page's already-stored
// visualPrompt (no narrative regeneration). Run from trigger/ with local.env
// sourced. Delete after running.
import { createServiceClient } from './src/lib/supabase';
import { OpenAiImageAdapter } from './src/providers/openai-image';
import { ImageClient } from './src/lib/image';
import { uploadImage } from './src/lib/storage';
import { DEFAULT_GENERATION_CONFIG } from './src/config';
import { FIERCE_MODE_DESCRIPTOR } from './src/types/artStyle';

const client = createServiceClient();
const { data: rows, error } = await client
  .from('stories')
  .select('id, owner_id, fierce_mode, manifest')
  .eq('status', 'ready');
if (error) throw error;

for (const row of rows ?? []) {
  const manifest: any = row.manifest;
  if (!manifest?.pages) continue;
  const fierceMode: boolean = row.fierce_mode;
  const visualAnchor = manifest.visualAnchor;
  const fierceClause = fierceMode ? ` ${FIERCE_MODE_DESCRIPTOR}` : '';
  const artStyleAnchor = `Generate an illustration in the following style: ${visualAnchor.animalA.artStyle}.${fierceClause} This is a children's educational book illustration.`;

  const image = new ImageClient(
    new OpenAiImageAdapter(process.env.OPENAI_API_KEY!),
    DEFAULT_GENERATION_CONFIG.imageModel,
    DEFAULT_GENERATION_CONFIG.imageQuality,
    row.owner_id,
  );

  console.log(`\n=== ${row.id} :: ${manifest.animalA.commonName} vs ${manifest.animalB.commonName} ===`);
  for (const index of [31, 32]) {
    const page = manifest.pages.find((p: any) => p.index === index);
    if (!page?.visualPrompt?.trim()) {
      console.log(`  skip page ${index}: no visual prompt`);
      continue;
    }
    const b64 = await image.generateImage(page.visualPrompt, { aspectRatio: '3:2', styleAnchor: artStyleAnchor });
    await uploadImage(client, `stories/${row.id}/${index}.png`, b64);
    console.log(`  re-rendered ${index}.png at 3:2 (~${Math.round((b64.length * 0.75) / 1024)} KB)`);
  }
}
console.log('\nDone.');
```

- [ ] **Step 2: Run the script**

Run: `cd trigger && (set -a && source ./local.env && set +a && bun rerender-hero-images.ts)`
Expected: for each ready book, two lines reporting `31.png` and `32.png` re-rendered at 3:2.

- [ ] **Step 3: Verify the new images are 3:2**

Run this check (adjust one story id from the script output):

```bash
cd trigger
cat > /tmp/check-aspect.ts <<'EOF'
import { createServiceClient } from './src/lib/supabase';
const c = createServiceClient();
const { data } = await c.from('stories').select('id').eq('status','ready').limit(1).single();
const { data: blob } = await c.storage.from('story-images').download(`stories/${data!.id}/31.png`);
const buf = Buffer.from(await blob!.arrayBuffer());
// PNG width/height are big-endian 32-bit ints at byte offsets 16 and 20.
console.log('id', data!.id, 'size', buf.length, 'WxH', buf.readUInt32BE(16), 'x', buf.readUInt32BE(20));
EOF
(set -a && source ./local.env && set +a && bun /tmp/check-aspect.ts)
rm -f /tmp/check-aspect.ts
```

Expected: `WxH 1536 x 1024` (3:2 landscape).

- [ ] **Step 4: Verify visually in the running app**

Open the re-rendered books to their showdown and verdict pages. Confirm the art is landscape, uncropped, with both animals visible and text in the panel below.

- [ ] **Step 5: Remove the throwaway script**

```bash
cd /Users/david/Code/vigilant-parakeet
rm -f trigger/rerender-hero-images.ts
git status --short
```

Expected: no tracked changes from this task (the script was never committed). Nothing to commit.

---

## Self-Review Notes

- Spec coverage: shared hero layout (Task 2), generation 3:2 for 31/32 (Task 1), cover/showdown/verdict restructure (Tasks 2/3/4), existing-book re-render (Task 5), tests (Tasks 1-4). All spec sections map to a task.
- The verdict reveal logic is preserved verbatim (Task 4 keeps the `revealed` state and both branches); only its container changed.
- The cover, showdown, and verdict all reference the same `.rd-hero`/`.rd-hero-art`/`.rd-hero-panel` classes defined once in Task 2.
- Layout risk (3:2 art plus a long verdict paragraph on short windows) is handled by `max-height` on the art and `overflow-y: auto` on the panel, with an explicit in-app tuning step in Tasks 2 and 4.
