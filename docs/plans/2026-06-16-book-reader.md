# Apex Book Reader "Naturalist's Journal" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the full-screen book reader (`BookViewer`) as a calm, responsive two-page spread in the Apex "Naturalist's Journal" look, add the missing climax (a break-the-seal Verdict), and slim the generated book from twelve aspects to six richer chapters.

**Architecture:** Two phases on one branch. Phase 1 slims the generator in `trigger/` (the six-chapter restructure and crop-safe page images). Phase 2 rebuilds the reader under `apex/src/components/book/` as small presentational components (`BookPage`, `StorySpread`, `BookCover`, `TaleOfTheTape`, `Verdict`, `ClosingPage`, `ReaderChrome`) plus a `BookViewer` orchestrator that owns data loading, the view model, navigation, and the verdict reveal, all built test-first with structure first and a dedicated stylesheet task. The reader is built behind a theme seam (a `reader--journal` root class) so the deferred looks remain a future drop-in. `react-pageflip` is removed; the remaining legacy tokens, the Outfit font, and dead Vite styles are deleted last.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + Testing Library (`apex`); Bun test (`trigger`); lucide-react; plain CSS with `--apex-*` custom properties (no Tailwind).

---

## File Structure

Phase 1 (generation, `trigger/`):

- **Modify** `trigger/src/lib/pipeline.ts`: replace the twelve `ASPECTS` with six `CHAPTERS`; loop over them; set titles from the chapter name; switch page images to a crop-safe aspect; add crop-safe composition to the cover prompt.
- **Modify** `trigger/src/lib/llm.ts`: `getAspectsForAnimal` takes `{ name, brief }[]` chapters; add crop-safe composition guidance to the page and showdown visual-prompt instructions.
- **Modify** `trigger/src/lib/__tests__/pipeline.test.ts`: update counts (14 pages, 15 images), indices, the chapter mock, and add chapter and crop-safe-aspect assertions.

Phase 2 (reader, `apex/`):

- **Create** `apex/src/components/book/BookPage.tsx`: one Journal page (title, vignette, narration, fun fact, folio).
- **Create** `apex/src/components/book/BookPage.test.tsx`
- **Create** `apex/src/components/book/StorySpread.tsx`: two `BookPage`s side by side; also the Showdown beat.
- **Create** `apex/src/components/book/StorySpread.test.tsx`
- **Create** `apex/src/components/book/BookCover.tsx`: art-forward cartouche cover.
- **Create** `apex/src/components/book/BookCover.test.tsx`
- **Create** `apex/src/components/book/TaleOfTheTape.tsx`: spread-spanning scorecard.
- **Create** `apex/src/components/book/TaleOfTheTape.test.tsx`
- **Create** `apex/src/components/book/Verdict.tsx`: break-the-seal reveal, standard and surprise.
- **Create** `apex/src/components/book/Verdict.test.tsx`
- **Create** `apex/src/components/book/ClosingPage.tsx`: colophon and the two actions.
- **Create** `apex/src/components/book/ClosingPage.test.tsx`
- **Create** `apex/src/components/book/ReaderChrome.tsx`: back control, title, progress, nav arrows.
- **Create** `apex/src/components/book/ReaderChrome.test.tsx`
- **Create** `apex/src/components/book/views.ts`: the pure helper that turns a manifest into the ordered view model.
- **Create** `apex/src/components/book/views.test.ts`
- **Rewrite** `apex/src/components/book/BookViewer.tsx`: orchestrator (data, view model, navigation, reveal, loading).
- **Rewrite** `apex/src/components/book/BookViewer.test.tsx`: to the new model.
- **Rewrite** `apex/src/components/book/BookViewer.css`: the Journal stylesheet on `--apex-*`, scoped under `reader--journal`.
- **Modify** `apex/index.html`: drop the Outfit Google Fonts link.
- **Modify** `apex/src/index.css`: remove now-unreferenced legacy `:root` tokens and the Outfit `body` default.
- **Modify** `apex/src/App.css`: remove dead Vite starter styles.
- **Modify** `apex/package.json`: remove `react-pageflip`.

---

## Phase 1: Generation slimming (`trigger/`)

## Task 1: Six-chapter restructure

The book is built from six chapters instead of twelve aspects. Each chapter still
generates a left page (animal A) and a right page (animal B), so the story is
twelve pages plus the Showdown and Outcome pages.

**Files:**
- Modify: `trigger/src/lib/pipeline.ts:30-43` (the `ASPECTS` constant) and `:206-228` (the pairing loop)
- Modify: `trigger/src/lib/llm.ts:63-115` (`getAspectsForAnimal`)
- Modify: `trigger/src/lib/__tests__/pipeline.test.ts`

- [ ] **Step 1: Update the pipeline test to the six-chapter shape**

In `trigger/src/lib/__tests__/pipeline.test.ts`, replace `makeMockAspects` (lines 19-31) so it returns six chapter items:

```ts
function makeMockAspects(animalPrefix: string) {
  const chapters = [
    'Meet the Animal', 'Where It Lives', 'Hunting & Diet',
    'Family & Smarts', 'Attack & Defense', 'Secret Weapons',
  ];
  return chapters.map((name) => ({
    aspectName: name,
    bodyText: `${animalPrefix} ${name} text.`,
    visualPrompt: `${animalPrefix} ${name} visual`,
  }));
}
```

Replace the three count/index/alternation tests (lines 124-157) with:

```ts
  it('produces 14 pages (6 chapter pairs + showdown + outcome)', async () => {
    const { deps } = makeDeps();
    const manifest = await runGenerationPipeline(deps, PAYLOAD);
    expect(manifest.pages).toHaveLength(14);
  });

  it('assigns page indices 1/2 … 11/12, then 31 and 32', async () => {
    const { deps } = makeDeps();
    const manifest = await runGenerationPipeline(deps, PAYLOAD);

    expect(manifest.pages[0].index).toBe(1);
    expect(manifest.pages[1].index).toBe(2);
    expect(manifest.pages[10].index).toBe(11);
    expect(manifest.pages[11].index).toBe(12);
    expect(manifest.pages[12].index).toBe(31);
    expect(manifest.pages[13].index).toBe(32);
  });

  it('alternates left/right pages: odd positions left, even positions right', async () => {
    const { deps } = makeDeps();
    const manifest = await runGenerationPipeline(deps, PAYLOAD);

    for (let i = 0; i < 12; i++) {
      expect(manifest.pages[i].isLeftPage).toBe(i % 2 === 0);
    }
    expect(manifest.pages[12].isLeftPage).toBe(true); // showdown
    expect(manifest.pages[13].isLeftPage).toBe(false); // outcome
  });

  it('titles each left page from its chapter name', async () => {
    const { deps } = makeDeps();
    const manifest = await runGenerationPipeline(deps, PAYLOAD);
    // Position 8 is chapter index 4 (Attack & Defense), a left page (index 9).
    expect(manifest.pages[8].title).toBe('Attack & Defense');
    expect(manifest.pages[8].index).toBe(9);
  });

  it('passes the six chapters (with the Attack & Defense speed clause) to the LLM', async () => {
    const { deps, llm } = makeDeps();
    await runGenerationPipeline(deps, PAYLOAD);
    const chapters = (llm.getAspectsForAnimal.mock.calls[0] as any[])[1];
    expect(chapters).toHaveLength(6);
    const attack = chapters.find((c: { name: string }) => c.name === 'Attack & Defense');
    expect(attack.brief.toLowerCase()).toContain('speed');
  });
```

Update the image-count test (lines 153-157) to fifteen:

```ts
  it('generates exactly 15 images on a clean run (cover + 14 pages)', async () => {
    const { deps, image } = makeDeps();
    await runGenerationPipeline(deps, PAYLOAD);
    expect(image.generateImage).toHaveBeenCalledTimes(15);
  });
```

In the Storage-paths test (lines 159-171), change the two spot-checked late indices from 24/31/32 to the new positions:

```ts
    expect(manifest.pages[0].imageUrl).toBe('stories/story-1/1.png');
    expect(manifest.pages[12].imageUrl).toBe('stories/story-1/31.png');
    expect(manifest.pages[13].imageUrl).toBe('stories/story-1/32.png');
```

In the progress test (lines 184-185), change the per-page regex and count:

```ts
    const perPage = progressCalls.filter(([step]) => /^Illustrating page \d+ of 14\.\.\.$/.test(step));
    expect(perPage).toHaveLength(14);
```

In the cached-resume test (lines 206), change the page length:

```ts
    expect(manifest.pages).toHaveLength(14);
```

- [ ] **Step 2: Run the pipeline test to verify it fails**

Run: `cd trigger && bun test src/lib/__tests__/pipeline.test.ts`
Expected: FAIL, the pipeline still produces 26 pages and 27 images.

- [ ] **Step 3: Replace `ASPECTS` with `CHAPTERS` in the pipeline**

In `trigger/src/lib/pipeline.ts`, replace the `ASPECTS` constant (lines 30-43) with:

```ts
const CHAPTERS: { name: string; brief: string }[] = [
  {
    name: 'Meet the Animal',
    brief: 'what kind of animal it is (its scientific classification and the family it belongs to) and its size and weight, described in terms a child can picture',
  },
  {
    name: 'Where It Lives',
    brief: 'its natural habitat and where in the world it is found',
  },
  {
    name: 'Hunting & Diet',
    brief: 'what it eats and how it finds or catches its food, including the senses (sight, smell, hearing) it relies on to do so',
  },
  {
    name: 'Family & Smarts',
    brief: 'how it lives alongside others (its social behavior and family life) and how intelligent it is',
  },
  {
    name: 'Attack & Defense',
    brief: "its natural weapons and its defenses or armor. If the animal's speed or agility is exceptional and central to how it attacks or escapes (a cheetah's sprint, a peregrine's dive, a gazelle's evasion), feature that prominently here; otherwise keep the focus on its weapons and armor",
  },
  {
    name: 'Secret Weapons',
    brief: 'one surprising special ability or hidden adaptation that could give it an unexpected advantage',
  },
];
```

- [ ] **Step 4: Use `CHAPTERS` in the aspect calls and the pairing loop**

In `trigger/src/lib/pipeline.ts`, change the two `getAspectsForAnimal` calls (lines 191-192) from `ASPECTS` to `CHAPTERS`:

```ts
      deps.llm.getAspectsForAnimal(animalA, CHAPTERS, visualAnchor.animalA, fierceMode),
      deps.llm.getAspectsForAnimal(animalB, CHAPTERS, visualAnchor.animalB, fierceMode),
```

Replace the pairing loop (lines 206-228) so it iterates the chapters and titles each left page from the chapter name:

```ts
    rawPages = [];
    // Combine chapters into page pairs (indices 1 .. 2 * CHAPTERS.length).
    for (let i = 0; i < CHAPTERS.length; i++) {
      const aspectA = aspectsA[i];
      const aspectB = aspectsB[i];

      rawPages.push({
        index: i * 2 + 1,
        title: CHAPTERS[i].name,
        bodyText: aspectA.bodyText,
        visualPrompt: aspectA.visualPrompt,
        funFact: aspectA.funFact,
        isLeftPage: true,
      });

      rawPages.push({
        index: i * 2 + 2,
        title: '',
        bodyText: aspectB.bodyText,
        visualPrompt: aspectB.visualPrompt,
        funFact: aspectB.funFact,
        isLeftPage: false,
      });
    }
```

The Showdown (index 31) and Outcome (index 32) pushes that follow the loop are unchanged.

- [ ] **Step 5: Update `getAspectsForAnimal` to take chapters**

In `trigger/src/lib/llm.ts`, change the `getAspectsForAnimal` signature and prompt (lines 63-97). Replace the signature and the opening prompt:

```ts
  async getAspectsForAnimal(
    animal: IAnimalEntity,
    chapters: { name: string; brief: string }[],
    visualDescription?: IAnimalVisualDescription,
    fierceMode = false,
  ) {
    let prompt = `Write an engaging, educational children's book page (about 2-3 sentences max) for each of the chapters listed below, for the animal: ${animal.commonName}. Each chapter has a title and a focus describing what its page should cover. Provide a highly descriptive visual prompt for an image for each page.

Fun fact rules:
- Include a fun fact on AT MOST 2 of the ${chapters.length} pages, picking only the most genuinely surprising and fascinating facts.
- Each fun fact must be a single sentence, different from the main body text, and relevant to that page's chapter.
- If fewer than 2 facts are truly interesting, include fewer. Do not force any.`;
```

Replace the closing instruction (line 97, the `Generate exactly one array item...` string) with:

```ts
    prompt += `\n\nGenerate exactly one array item for each chapter, strictly in the same order, using the chapter title as aspectName. Chapters:\n\n${chapters
      .map((c, i) => `${i + 1}. ${c.name}: ${c.brief}`)
      .join('\n')}`;
```

The JSON schema (lines 99-112) and the `return data as Array<...>` are unchanged.

- [ ] **Step 6: Run the pipeline test to verify it passes**

Run: `cd trigger && bun test src/lib/__tests__/pipeline.test.ts`
Expected: PASS (14 pages, 15 images, chapter titles, the six chapters with the speed clause).

- [ ] **Step 7: Typecheck the trigger package**

Run: `cd trigger && bun run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add trigger/src/lib/pipeline.ts trigger/src/lib/llm.ts trigger/src/lib/__tests__/pipeline.test.ts
git commit -m "feat(trigger): slim book to six chapters"
```

---

## Task 2: Crop-safe page images

One image per page, generated at a portrait aspect and composed so any layout
(the Journal vignette now, a full bleed later) can crop it without cutting off the
animal. We never generate per-layout images.

**Files:**
- Modify: `trigger/src/lib/pipeline.ts` (the page image `aspectRatio`, line 264, and the cover prompt, lines 139-142)
- Modify: `trigger/src/lib/llm.ts` (the visual-prompt instructions in `getAspectsForAnimal` and `getShowdownAndOutcome`)
- Modify: `trigger/src/lib/__tests__/pipeline.test.ts`

- [ ] **Step 1: Add a failing test for the page image aspect**

In `trigger/src/lib/__tests__/pipeline.test.ts`, add this test inside the `runGenerationPipeline` describe block:

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

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd trigger && bun test src/lib/__tests__/pipeline.test.ts`
Expected: FAIL, page images are still generated at `4:3` (0 calls at `3:4`).

- [ ] **Step 3: Switch page images to the crop-safe portrait aspect**

In `trigger/src/lib/pipeline.ts`, in the page-image generation call (lines 263-266), change the aspect ratio:

```ts
          const base64 = await deps.image.generateImage(page.visualPrompt, {
            aspectRatio: '3:4',
            styleAnchor: artStyleAnchor,
          });
```

- [ ] **Step 4: Add crop-safe composition to the cover prompt**

In `trigger/src/lib/pipeline.ts`, append a crop-safe sentence to `coverPrompt` (lines 139-142). After the existing `No text in the image.` sentence, add to the first paragraph:

```ts
  const coverPrompt = `A dramatic, dynamic children's book cover illustration showing a ${animalAQuery} and a ${animalBQuery} facing each other in an epic standoff. Both animals must be fully visible from head to tail. The scene should be intense and exciting, with both animals looking powerful and ready for battle. Bold, vibrant colors with an action-packed composition. No text in the image. Keep both animals centred with generous margin around them and nothing important at the very edges, so the image can be cropped to different shapes without cutting off either animal.

Animal A: ${visualAnchor.animalA.fullDescription}
Animal B: ${visualAnchor.animalB.fullDescription}`;
```

- [ ] **Step 5: Add crop-safe composition to the page and showdown prompts**

In `trigger/src/lib/llm.ts`, in `getAspectsForAnimal`, append to the visual-consistency block (after the `Scene variety` paragraph, before the `Do not lock the animal...` line, inside the `if (visualDescription)` block at lines 78-90) this guidance:

```ts
Crop safety: keep the animal centred with comfortable margin and nothing critical (faces, horns, tails) touching the edges, so the same image can be cropped to a vignette, a framed plate, or a full bleed without losing the subject.
```

In `getShowdownAndOutcome`, append the same crop-safety guidance to its visual-consistency block (after the `Scene variety` line at lines 143-144, inside the `if (visualAnchor)` block):

```ts
Crop safety: keep both animals centred with comfortable margin and nothing critical touching the edges, so the image can be cropped to different shapes without losing either animal.
```

- [ ] **Step 6: Run the pipeline test to verify it passes**

Run: `cd trigger && bun test src/lib/__tests__/pipeline.test.ts`
Expected: PASS (14 page images at `3:4`).

- [ ] **Step 7: Typecheck**

Run: `cd trigger && bun run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add trigger/src/lib/pipeline.ts trigger/src/lib/llm.ts trigger/src/lib/__tests__/pipeline.test.ts
git commit -m "feat(trigger): crop-safe portrait page images"
```

---

## Phase 2: The reader (`apex/`)

Build leaf-up and test-first. Class names use the `rd-` (reader) prefix; styling
arrives in Task 12. Every component is presentational with explicit props; the
`BookViewer` orchestrator wires them together in Task 11.

## Task 3: The view model (`views.ts`)

A pure helper that turns a manifest into the ordered sequence of views. It pairs
chapter pages into spreads (or single pages on narrow viewports), numbers folios,
and isolates the Showdown and Outcome pages. Pure and fully unit-tested.

**Files:**
- Create: `apex/src/components/book/views.ts`
- Test: `apex/src/components/book/views.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/book/views.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildViews } from './views';
import { createMockStory } from '../../test/fixtures';
import { IPageContent } from '../../types/story.types';

function page(index: number, isLeftPage: boolean, title = ''): IPageContent {
  return { index, title, bodyText: `body ${index}`, visualPrompt: `prompt ${index}`, isLeftPage };
}

// A manifest with two chapters (4 pages), a showdown (31) and an outcome (32).
function manifest() {
  return createMockStory({
    pages: [
      page(1, true, 'Meet the Animal'),
      page(2, false),
      page(3, true, 'Where It Lives'),
      page(4, false),
      page(31, true, 'The Showdown'),
      page(32, false, 'Outcome'),
    ],
  });
}

describe('buildViews', () => {
  it('opens on the cover and ends on the closing page', () => {
    const views = buildViews(manifest());
    expect(views[0].kind).toBe('cover');
    expect(views[views.length - 1].kind).toBe('closing');
  });

  it('pairs chapter pages into spreads with sequential folios (wide mode)', () => {
    const views = buildViews(manifest());
    const spreads = views.filter((v) => v.kind === 'spread');
    expect(spreads).toHaveLength(2);
    expect(spreads[0]).toMatchObject({ title: 'Meet the Animal', leftFolio: 1, rightFolio: 2 });
    expect(spreads[1]).toMatchObject({ title: 'Where It Lives', leftFolio: 3, rightFolio: 4 });
  });

  it('expands chapters into single pages with sequential folios (narrow mode)', () => {
    const views = buildViews(manifest(), true);
    const pages = views.filter((v) => v.kind === 'page');
    expect(pages).toHaveLength(4);
    expect(pages.map((v) => (v.kind === 'page' ? v.folio : 0))).toEqual([1, 2, 3, 4]);
    // The left page of a chapter carries the title; the right page does not.
    expect(pages[0]).toMatchObject({ title: 'Meet the Animal' });
    expect(pages[1]).toMatchObject({ title: '' });
  });

  it('places the showdown, then the tape, verdict (with the outcome page), then closing', () => {
    const views = buildViews(manifest());
    const kinds = views.map((v) => v.kind);
    expect(kinds.slice(-4)).toEqual(['showdown', 'tape', 'verdict', 'closing']);
    const verdict = views.find((v) => v.kind === 'verdict');
    expect(verdict && verdict.kind === 'verdict' && verdict.outcomePage?.index).toBe(32);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/book/views.test.ts`
Expected: FAIL, cannot resolve `./views`.

- [ ] **Step 3: Write the helper**

Create `apex/src/components/book/views.ts`:

```ts
import { IStoryManifest, IPageContent } from '../../types/story.types';

export type BookView =
  | { kind: 'cover' }
  | {
      kind: 'spread';
      title: string;
      left: IPageContent;
      right: IPageContent | null;
      leftFolio: number;
      rightFolio: number | null;
    }
  | { kind: 'page'; title: string; page: IPageContent; folio: number }
  | { kind: 'showdown'; page: IPageContent }
  | { kind: 'tape' }
  | { kind: 'verdict'; outcomePage: IPageContent | null }
  | { kind: 'closing' };

const SHOWDOWN_INDEX = 31;
const OUTCOME_INDEX = 32;

/**
 * Turns a manifest into the ordered sequence of reader views. In `singlePage`
 * mode (narrow viewports) each chapter becomes two single-page views; otherwise
 * each chapter is one two-page spread. Folios number the chapter pages from 1 in
 * reading order, independent of the manifest `index`.
 */
export function buildViews(manifest: IStoryManifest, singlePage = false): BookView[] {
  const showdown = manifest.pages.find((p) => p.index === SHOWDOWN_INDEX) ?? null;
  const outcomePage = manifest.pages.find((p) => p.index === OUTCOME_INDEX) ?? null;
  const chapterPages = manifest.pages.filter(
    (p) => p.index !== SHOWDOWN_INDEX && p.index !== OUTCOME_INDEX,
  );

  const views: BookView[] = [{ kind: 'cover' }];

  let folio = 1;
  for (let i = 0; i < chapterPages.length; i += 2) {
    const left = chapterPages[i];
    const right = chapterPages[i + 1] ?? null;
    const title = left.title || (right ? right.title : '');

    if (singlePage) {
      views.push({ kind: 'page', title, page: left, folio });
      folio += 1;
      if (right) {
        views.push({ kind: 'page', title: '', page: right, folio });
        folio += 1;
      }
    } else {
      views.push({
        kind: 'spread',
        title,
        left,
        right,
        leftFolio: folio,
        rightFolio: right ? folio + 1 : null,
      });
      folio += right ? 2 : 1;
    }
  }

  if (showdown) views.push({ kind: 'showdown', page: showdown });
  views.push({ kind: 'tape' });
  views.push({ kind: 'verdict', outcomePage });
  views.push({ kind: 'closing' });

  return views;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/book/views.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/views.ts apex/src/components/book/views.test.ts
git commit -m "feat(reader): view-model helper"
```

---

## Task 4: BookPage component

The atomic Journal page: an optional chapter title, a vignette illustration (the
signed image or a `visualPrompt` placeholder), the narration, an optional fun-fact
field note, and a folio. Used both as a half of a spread and as a single page on
narrow viewports.

**Files:**
- Create: `apex/src/components/book/BookPage.tsx`
- Test: `apex/src/components/book/BookPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/book/BookPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { BookPage } from './BookPage';
import { IPageContent } from '../../types/story.types';

const base: IPageContent = {
  index: 1,
  title: 'Meet the Animal',
  bodyText: 'The lion is a large cat.',
  visualPrompt: 'A majestic lion',
  imageUrl: 'stories/s/1.png',
  funFact: 'Lions can sleep 20 hours a day!',
  isLeftPage: true,
};

describe('BookPage', () => {
  it('renders the title, narration, fun fact, image, and folio', () => {
    render(<BookPage page={base} folio={7} title="Meet the Animal" side="left" signedUrl="https://signed/1.png" imageAlt="Lion" />);

    expect(screen.getByText('Meet the Animal')).toBeInTheDocument();
    expect(screen.getByText('The lion is a large cat.')).toBeInTheDocument();
    expect(screen.getByText('Lions can sleep 20 hours a day!')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    const img = screen.getByAltText('Lion');
    expect(img).toHaveAttribute('src', 'https://signed/1.png');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('omits the title and fun fact when not provided', () => {
    const noExtras: IPageContent = { ...base, title: '', funFact: undefined };
    render(<BookPage page={noExtras} folio={8} side="right" signedUrl="https://signed/1.png" />);

    expect(screen.queryByText('Meet the Animal')).not.toBeInTheDocument();
    expect(screen.queryByText('Lions can sleep 20 hours a day!')).not.toBeInTheDocument();
  });

  it('shows the visual-prompt placeholder when no signed URL is available', () => {
    render(<BookPage page={base} folio={1} title="Meet the Animal" side="left" />);

    expect(screen.getByText('A majestic lion')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/book/BookPage.test.tsx`
Expected: FAIL, cannot resolve `./BookPage`.

- [ ] **Step 3: Write the component**

Create `apex/src/components/book/BookPage.tsx`:

```tsx
import React from 'react';
import { IPageContent } from '../../types/story.types';

export interface BookPageProps {
  page: IPageContent;
  folio: number;
  side: 'left' | 'right';
  title?: string;
  signedUrl?: string;
  imageAlt?: string;
}

export const BookPage: React.FC<BookPageProps> = ({
  page,
  folio,
  side,
  title,
  signedUrl,
  imageAlt,
}) => {
  return (
    <div className={`rd-page rd-page--${side}`}>
      {title ? (
        <div className="rd-page-head">
          <h3 className="rd-page-title">{title}</h3>
          <div className="rd-page-rule" aria-hidden="true" />
        </div>
      ) : (
        <div className="rd-page-head rd-page-head--empty" aria-hidden="true" />
      )}

      <div className="rd-vignette">
        {signedUrl ? (
          <img
            src={signedUrl}
            alt={imageAlt ?? title ?? 'Story illustration'}
            className="rd-vignette-img"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="rd-vignette-placeholder">{page.visualPrompt}</div>
        )}
      </div>

      <p className="rd-narration">{page.bodyText}</p>

      {page.funFact && <p className="rd-fieldnote">{page.funFact}</p>}

      <span className="rd-folio" aria-hidden="true">{folio}</span>
    </div>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/book/BookPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/BookPage.tsx apex/src/components/book/BookPage.test.tsx
git commit -m "feat(reader): BookPage component"
```

---

## Task 5: StorySpread component

Composes two `BookPage`s into a chapter spread: the chapter title on the left page,
both illustrations and narrations side by side. The signed-URL lookup resolves each
page's image path.

**Files:**
- Create: `apex/src/components/book/StorySpread.tsx`
- Test: `apex/src/components/book/StorySpread.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/book/StorySpread.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { StorySpread } from './StorySpread';
import { IPageContent } from '../../types/story.types';

const left: IPageContent = {
  index: 1, title: 'Meet the Animal', bodyText: 'The lion is a large cat.',
  visualPrompt: 'A lion', imageUrl: 'stories/s/1.png', isLeftPage: true,
};
const right: IPageContent = {
  index: 2, title: '', bodyText: 'The tiger is the largest cat.',
  visualPrompt: 'A tiger', imageUrl: 'stories/s/2.png', isLeftPage: false,
};

describe('StorySpread', () => {
  it('renders the chapter title once and both pages with their images', () => {
    render(
      <StorySpread
        title="Meet the Animal"
        left={left}
        right={right}
        leftFolio={1}
        rightFolio={2}
        signed={{ 'stories/s/1.png': 'https://signed/1.png', 'stories/s/2.png': 'https://signed/2.png' }}
        leftAlt="Lion"
        rightAlt="Tiger"
      />,
    );

    expect(screen.getByText('Meet the Animal')).toBeInTheDocument();
    expect(screen.getByText('The lion is a large cat.')).toBeInTheDocument();
    expect(screen.getByText('The tiger is the largest cat.')).toBeInTheDocument();
    expect(screen.getByAltText('Lion')).toHaveAttribute('src', 'https://signed/1.png');
    expect(screen.getByAltText('Tiger')).toHaveAttribute('src', 'https://signed/2.png');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/book/StorySpread.test.tsx`
Expected: FAIL, cannot resolve `./StorySpread`.

- [ ] **Step 3: Write the component**

Create `apex/src/components/book/StorySpread.tsx`:

```tsx
import React from 'react';
import { IPageContent } from '../../types/story.types';
import { BookPage } from './BookPage';

export interface StorySpreadProps {
  title: string;
  left: IPageContent;
  right: IPageContent | null;
  leftFolio: number;
  rightFolio: number | null;
  signed: Record<string, string>;
  leftAlt?: string;
  rightAlt?: string;
}

export const StorySpread: React.FC<StorySpreadProps> = ({
  title,
  left,
  right,
  leftFolio,
  rightFolio,
  signed,
  leftAlt,
  rightAlt,
}) => {
  return (
    <div className="rd-spread">
      <BookPage
        page={left}
        folio={leftFolio}
        side="left"
        title={title}
        signedUrl={left.imageUrl ? signed[left.imageUrl] : undefined}
        imageAlt={leftAlt}
      />
      {right && (
        <BookPage
          page={right}
          folio={rightFolio ?? leftFolio + 1}
          side="right"
          signedUrl={right.imageUrl ? signed[right.imageUrl] : undefined}
          imageAlt={rightAlt}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/book/StorySpread.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/StorySpread.tsx apex/src/components/book/StorySpread.test.tsx
git commit -m "feat(reader): StorySpread component"
```

---

## Task 6: BookCover component

The art-forward cartouche cover: the full-bleed cover image behind a scrim, the
"An Apex Publication" kicker, and a paper cartouche with the emblem, "Who Would
Win?", and the matchup joined by a gilt ampersand.

**Files:**
- Create: `apex/src/components/book/BookCover.tsx`
- Test: `apex/src/components/book/BookCover.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/book/BookCover.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { BookCover } from './BookCover';
import { createMockStory } from '../../test/fixtures';

describe('BookCover', () => {
  it('renders the matchup, the question, the kicker, and the cover image', () => {
    const manifest = createMockStory({ coverImageUrl: 'stories/s/cover.png' });
    render(<BookCover manifest={manifest} signed={{ 'stories/s/cover.png': 'https://signed/cover.png' }} />);

    expect(screen.getByText('Who Would Win?')).toBeInTheDocument();
    expect(screen.getByText('An Apex Publication')).toBeInTheDocument();
    expect(screen.getByText('Lion')).toBeInTheDocument();
    expect(screen.getByText('Tiger')).toBeInTheDocument();

    const img = screen.getByAltText('Lion versus Tiger');
    expect(img).toHaveAttribute('src', 'https://signed/cover.png');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('renders without an image when the manifest has no cover', () => {
    const manifest = createMockStory({ coverImageUrl: undefined });
    render(<BookCover manifest={manifest} signed={{}} />);

    expect(screen.getByText('Who Would Win?')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/book/BookCover.test.tsx`
Expected: FAIL, cannot resolve `./BookCover`.

- [ ] **Step 3: Write the component**

Create `apex/src/components/book/BookCover.tsx`:

```tsx
import React from 'react';
import { IStoryManifest } from '../../types/story.types';

export interface BookCoverProps {
  manifest: IStoryManifest;
  signed: Record<string, string>;
}

export const BookCover: React.FC<BookCoverProps> = ({ manifest, signed }) => {
  const coverUrl = manifest.coverImageUrl ? signed[manifest.coverImageUrl] : undefined;
  const a = manifest.animalA.commonName;
  const b = manifest.animalB.commonName;

  return (
    <div className="rd-cover">
      {coverUrl && (
        <img
          src={coverUrl}
          alt={`${a} versus ${b}`}
          className="rd-cover-img"
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="rd-cover-scrim" aria-hidden="true" />
      <div className="rd-cover-kicker">An Apex Publication</div>
      <div className="rd-cover-cartouche">
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
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/book/BookCover.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/BookCover.tsx apex/src/components/book/BookCover.test.tsx
git commit -m "feat(reader): BookCover component"
```

---

## Task 7: TaleOfTheTape component

The spread-spanning scorecard. Measurement rows come from the animals' stats (only
the stats present render); edge rows and the tally come from the checklist.

**Files:**
- Create: `apex/src/components/book/TaleOfTheTape.tsx`
- Test: `apex/src/components/book/TaleOfTheTape.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/book/TaleOfTheTape.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { TaleOfTheTape } from './TaleOfTheTape';
import { createMockStory } from '../../test/fixtures';

describe('TaleOfTheTape', () => {
  it('renders the header, both names, the available stat values, and the edge rows', () => {
    const { container } = render(<TaleOfTheTape manifest={createMockStory()} />);

    expect(screen.getByText('Tale of the Tape')).toBeInTheDocument();
    expect(screen.getByText('Lion')).toBeInTheDocument();
    expect(screen.getByText('Tiger')).toBeInTheDocument();

    // Stat values (the fixture has weight, length, speed for both).
    expect(screen.getByText('190 kg')).toBeInTheDocument();
    expect(screen.getByText('220 kg')).toBeInTheDocument();
    expect(screen.getByText('80 km/h')).toBeInTheDocument();

    // Edge rows from the checklist (Speed favours A, Strength favours B).
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('Strength')).toBeInTheDocument();
    expect(container.querySelectorAll('.rd-tape-dot')).toHaveLength(2);
  });

  it('tallies the checklist advantages for each animal', () => {
    render(<TaleOfTheTape manifest={createMockStory()} />);
    // One edge each => 1 and 1.
    const tally = screen.getByText('on paper').closest('.rd-tape-score');
    expect(tally).toHaveTextContent('Lion');
    expect(tally).toHaveTextContent('Tiger');
    expect(tally?.textContent).toMatch(/1/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/book/TaleOfTheTape.test.tsx`
Expected: FAIL, cannot resolve `./TaleOfTheTape`.

- [ ] **Step 3: Write the component**

Create `apex/src/components/book/TaleOfTheTape.tsx`:

```tsx
import React from 'react';
import { IStoryManifest, IBiologicalStats } from '../../types/story.types';

const STAT_ROWS: { label: string; key: keyof IBiologicalStats }[] = [
  { label: 'Weight', key: 'weight' },
  { label: 'Length', key: 'length' },
  { label: 'Top Speed', key: 'speed' },
  { label: 'Weapons', key: 'weaponry' },
  { label: 'Armor', key: 'armor' },
  { label: 'Brains', key: 'brainSize' },
];

export interface TaleOfTheTapeProps {
  manifest: IStoryManifest;
}

export const TaleOfTheTape: React.FC<TaleOfTheTapeProps> = ({ manifest }) => {
  const a = manifest.animalA;
  const b = manifest.animalB;

  const statRows = STAT_ROWS
    .map((r) => ({ label: r.label, aVal: a.stats[r.key], bVal: b.stats[r.key] }))
    .filter((r) => r.aVal && r.bVal);

  const edges = manifest.checklist.items;
  const aScore = edges.filter((i) => i.animalAAdvantage).length;
  const bScore = edges.filter((i) => i.animalBAdvantage).length;

  return (
    <div className="rd-tape">
      <div className="rd-tape-head">
        <div className="rd-tape-kicker">Before the Verdict</div>
        <h2 className="rd-tape-title">Tale of the Tape</h2>
        <div className="rd-tape-rule" aria-hidden="true" />
      </div>

      <div className="rd-tape-vs">
        <div className="rd-tape-fighter">
          <span className="rd-tape-medal" aria-hidden="true">{a.commonName.charAt(0)}</span>
          <b>{a.commonName}</b>
        </div>
        <span className="rd-tape-amp" aria-hidden="true">&amp;</span>
        <div className="rd-tape-fighter">
          <span className="rd-tape-medal" aria-hidden="true">{b.commonName.charAt(0)}</span>
          <b>{b.commonName}</b>
        </div>
      </div>

      <div className="rd-tape-rows">
        {statRows.map((r) => (
          <div className="rd-tape-row" key={r.label}>
            <span className="rd-tape-val rd-tape-val--l">{r.aVal}</span>
            <span className="rd-tape-trait">{r.label}</span>
            <span className="rd-tape-val rd-tape-val--r">{r.bVal}</span>
          </div>
        ))}
        {edges.map((item, i) => (
          <div className="rd-tape-row rd-tape-row--edge" key={`edge-${i}`}>
            <span className="rd-tape-val rd-tape-val--l">
              {item.animalAAdvantage && <span className="rd-tape-dot" aria-hidden="true" />}
            </span>
            <span className="rd-tape-trait">{item.traitName}</span>
            <span className="rd-tape-val rd-tape-val--r">
              {item.animalBAdvantage && <span className="rd-tape-dot" aria-hidden="true" />}
            </span>
          </div>
        ))}
      </div>

      <div className="rd-tape-tally">
        <div className="rd-tape-score">
          <span>{a.commonName} <strong>{aScore}</strong></span>
          <span className="rd-tape-sep">on paper</span>
          <span><strong className="rd-tape-mute">{bScore}</strong> {b.commonName}</span>
        </div>
        <p className="rd-tape-teaser">Yet the wild keeps its own counsel.</p>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/book/TaleOfTheTape.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/TaleOfTheTape.tsx apex/src/components/book/TaleOfTheTape.test.tsx
git commit -m "feat(reader): Tale of the Tape scorecard"
```

---

## Task 8: Verdict component

The climax. The outcome art fills the spread; a paper cartouche holds the verdict.
The winner is hidden behind a break-the-seal control. A standard win names the
victor with no stamp; a surprise reframes to a twist with the ending-type stamp.

**Files:**
- Create: `apex/src/components/book/Verdict.tsx`
- Test: `apex/src/components/book/Verdict.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/book/Verdict.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Verdict } from './Verdict';
import { createMockStory, createMockStoryWithSurprise } from '../../test/fixtures';

describe('Verdict', () => {
  it('hides the winner until the seal is broken, then names the victor with no stamp', async () => {
    const manifest = createMockStory();
    render(<Verdict manifest={manifest} outcomePage={null} signed={{}} />);

    expect(screen.queryByText('Lion')).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /break the seal/i }));

    expect(screen.getByText('Lion')).toBeInTheDocument();
    expect(screen.getByText('The lion wins due to superior teamwork.')).toBeInTheDocument();
    expect(screen.queryByText('Standard Victory')).not.toBeInTheDocument();
  });

  it('reframes a surprise ending as a twist with the ending-type stamp and no victor', async () => {
    const manifest = createMockStoryWithSurprise();
    render(<Verdict manifest={manifest} outcomePage={null} signed={{}} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /break the seal/i }));

    expect(screen.queryByText(/^victor$/i)).not.toBeInTheDocument();
    expect(screen.getByText('External Event')).toBeInTheDocument();
    expect(screen.getByText('An earthquake interrupted the battle.')).toBeInTheDocument();
    expect(screen.getByText(/unexpected turn/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/book/Verdict.test.tsx`
Expected: FAIL, cannot resolve `./Verdict`.

- [ ] **Step 3: Write the component**

Create `apex/src/components/book/Verdict.tsx`:

```tsx
import React, { useState } from 'react';
import { IStoryManifest, IPageContent } from '../../types/story.types';

export interface VerdictProps {
  manifest: IStoryManifest;
  outcomePage: IPageContent | null;
  signed: Record<string, string>;
}

function winnerName(manifest: IStoryManifest): string | null {
  const { winnerId } = manifest.outcome;
  if (winnerId === 'animalA') return manifest.animalA.commonName;
  if (winnerId === 'animalB') return manifest.animalB.commonName;
  return null;
}

export const Verdict: React.FC<VerdictProps> = ({ manifest, outcomePage, signed }) => {
  const [revealed, setRevealed] = useState(false);
  const { outcome } = manifest;
  const surprise = outcome.isSurpriseEnding;
  const name = winnerName(manifest);
  const artUrl = outcomePage?.imageUrl ? signed[outcomePage.imageUrl] : undefined;

  return (
    <div className={`rd-verdict ${surprise ? 'rd-verdict--surprise' : ''}`}>
      {artUrl && (
        <img src={artUrl} alt="The outcome" className="rd-verdict-img" loading="lazy" decoding="async" />
      )}
      <div className="rd-verdict-scrim" aria-hidden="true" />

      <div className="rd-verdict-cartouche">
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
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/book/Verdict.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/Verdict.tsx apex/src/components/book/Verdict.test.tsx
git commit -m "feat(reader): Verdict with break-the-seal reveal"
```

---

## Task 9: ClosingPage component

The colophon that bookends the cover: "The End", the publication line, the
matchup, the created date, and the two ways onward.

**Files:**
- Create: `apex/src/components/book/ClosingPage.tsx`
- Test: `apex/src/components/book/ClosingPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/book/ClosingPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClosingPage } from './ClosingPage';
import { createMockStory } from '../../test/fixtures';

describe('ClosingPage', () => {
  it('renders the colophon and wires both actions', async () => {
    const manifest = createMockStory({
      metadata: { id: 's', title: 't', createdAt: new Date('2026-06-14T12:00:00Z').getTime(), hasBeenRead: false },
    });
    const onReadAgain = vi.fn();
    const onClose = vi.fn();
    render(<ClosingPage manifest={manifest} onReadAgain={onReadAgain} onClose={onClose} />);

    expect(screen.getByText('The End')).toBeInTheDocument();
    expect(screen.getByText('An Apex Publication')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /read it again/i }));
    expect(onReadAgain).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /back to the reading room/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/book/ClosingPage.test.tsx`
Expected: FAIL, cannot resolve `./ClosingPage`.

- [ ] **Step 3: Write the component**

Create `apex/src/components/book/ClosingPage.tsx`:

```tsx
import React from 'react';
import { IStoryManifest } from '../../types/story.types';

export interface ClosingPageProps {
  manifest: IStoryManifest;
  onReadAgain: () => void;
  onClose: () => void;
}

function formatMonthYear(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export const ClosingPage: React.FC<ClosingPageProps> = ({ manifest, onReadAgain, onClose }) => {
  const a = manifest.animalA.commonName;
  const b = manifest.animalB.commonName;

  return (
    <div className="rd-closing">
      <div className="rd-closing-emblem" aria-hidden="true">&amp;</div>
      <div className="rd-closing-end">The End</div>
      <div className="rd-closing-rule" aria-hidden="true" />
      <div className="rd-closing-colophon">
        <span className="rd-closing-kicker">An Apex Publication</span>
        <span>{a} &amp; {b}</span>
        <span>Conjured {formatMonthYear(manifest.metadata.createdAt)}</span>
      </div>
      <div className="rd-closing-actions">
        <button type="button" className="rd-closing-act rd-closing-act--primary" onClick={onReadAgain}>
          Read it again
        </button>
        <button type="button" className="rd-closing-act rd-closing-act--ghost" onClick={onClose}>
          Back to the Reading Room
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/book/ClosingPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/ClosingPage.tsx apex/src/components/book/ClosingPage.test.tsx
git commit -m "feat(reader): ClosingPage colophon"
```

---

## Task 10: ReaderChrome component

The connective chrome: the "Library" back control, the centered matchup title, the
side navigation arrows, and the bottom progress indicator (chapter label, gilt
bar, and the soft position fraction).

**Files:**
- Create: `apex/src/components/book/ReaderChrome.tsx`
- Test: `apex/src/components/book/ReaderChrome.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/book/ReaderChrome.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReaderChrome } from './ReaderChrome';

const base = {
  matchup: 'Lion & Tiger',
  label: 'Hunting & Diet',
  position: '3 / 11',
  progressPct: 27,
  canPrev: true,
  canNext: true,
  onBack: () => {},
  onPrev: () => {},
  onNext: () => {},
};

describe('ReaderChrome', () => {
  it('renders the title, position, and progress, and wires the controls', async () => {
    const onBack = vi.fn();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<ReaderChrome {...base} onBack={onBack} onPrev={onPrev} onNext={onNext} />);

    expect(screen.getByText('Lion & Tiger')).toBeInTheDocument();
    expect(screen.getByText('3 / 11')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '27');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /library/i }));
    expect(onBack).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /previous page/i }));
    expect(onPrev).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it('disables the previous control at the start', () => {
    render(<ReaderChrome {...base} canPrev={false} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/book/ReaderChrome.test.tsx`
Expected: FAIL, cannot resolve `./ReaderChrome`.

- [ ] **Step 3: Write the component**

Create `apex/src/components/book/ReaderChrome.tsx`:

```tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ReaderChromeProps {
  matchup: string;
  label: string;
  position: string;
  progressPct: number;
  canPrev: boolean;
  canNext: boolean;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const ReaderChrome: React.FC<ReaderChromeProps> = ({
  matchup,
  label,
  position,
  progressPct,
  canPrev,
  canNext,
  onBack,
  onPrev,
  onNext,
}) => {
  return (
    <>
      <div className="rd-top">
        <button type="button" className="rd-back" onClick={onBack}>
          <ChevronLeft size={18} aria-hidden="true" /> Library
        </button>
        <div className="rd-book-title">{matchup}</div>
      </div>

      <button
        type="button"
        className="rd-nav rd-nav--prev"
        aria-label="Previous page"
        onClick={onPrev}
        disabled={!canPrev}
      >
        <ChevronLeft size={28} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="rd-nav rd-nav--next"
        aria-label="Next page"
        onClick={onNext}
        disabled={!canNext}
      >
        <ChevronRight size={28} aria-hidden="true" />
      </button>

      <div className="rd-bottom">
        {label && <div className="rd-chapter">{label}</div>}
        <div
          className="rd-track"
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="rd-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="rd-position">{position}</div>
      </div>
    </>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/book/ReaderChrome.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/ReaderChrome.tsx apex/src/components/book/ReaderChrome.test.tsx
git commit -m "feat(reader): ReaderChrome controls"
```

---

## Task 11: BookViewer orchestrator

Rewrite `BookViewer` to load the story, resolve signed URLs (the preserved
contract), build the responsive view model, own navigation (arrows, keys, swipe,
Esc) and the loading state, and render the current view plus the chrome. The
Showdown is rendered inline here.

**Files:**
- Rewrite: `apex/src/components/book/BookViewer.tsx`
- Rewrite: `apex/src/components/book/BookViewer.test.tsx`

- [ ] **Step 1: Replace the test with the new model**

Replace the entire contents of `apex/src/components/book/BookViewer.test.tsx` with:

```tsx
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookViewer } from './BookViewer';
import { createMockStory, createMockStoryRecord } from '../../test/fixtures';

vi.mock('../../services/CatalogService', () => ({
  CatalogService: { getStory: vi.fn(), resolveSignedUrls: vi.fn() },
}));
vi.mock('./BookViewer.css', () => ({}));

import { CatalogService } from '../../services/CatalogService';
const mockGetStory = CatalogService.getStory as ReturnType<typeof vi.fn>;
const mockResolveSignedUrls = CatalogService.resolveSignedUrls as ReturnType<typeof vi.fn>;

// jsdom has no matchMedia; stub it (wide viewport => spread mode).
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
});

const manifest = createMockStory({
  coverImageUrl: 'stories/story-1/cover.png',
  pages: [
    { index: 1, title: 'Meet the Animal', bodyText: 'The lion is a large cat.', visualPrompt: 'A lion', imageUrl: 'stories/story-1/1.png', funFact: 'Lions sleep a lot!', isLeftPage: true },
    { index: 2, title: '', bodyText: 'The tiger is the largest cat.', visualPrompt: 'A tiger', imageUrl: 'stories/story-1/2.png', isLeftPage: false },
    { index: 31, title: 'The Showdown', bodyText: 'They face off!', visualPrompt: 'Both', imageUrl: 'stories/story-1/31.png', isLeftPage: true },
    { index: 32, title: 'Outcome', bodyText: 'The lion wins!', visualPrompt: 'Lion victorious', imageUrl: 'stories/story-1/32.png', isLeftPage: false },
  ],
});

const signedUrls: Record<string, string> = {
  'stories/story-1/cover.png': 'https://signed/cover.png',
  'stories/story-1/1.png': 'https://signed/1.png',
  'stories/story-1/2.png': 'https://signed/2.png',
  'stories/story-1/31.png': 'https://signed/31.png',
  'stories/story-1/32.png': 'https://signed/32.png',
};

beforeEach(() => {
  mockGetStory.mockReset();
  mockResolveSignedUrls.mockReset();
  mockGetStory.mockResolvedValue(createMockStoryRecord({ manifest }));
  mockResolveSignedUrls.mockResolvedValue(signedUrls);
});

function renderViewer(onClose = vi.fn()) {
  return render(<BookViewer storyId="story-1" onClose={onClose} />);
}

describe('BookViewer', () => {
  it('shows the loading state before the manifest resolves', () => {
    mockGetStory.mockReturnValue(new Promise(() => {}));
    renderViewer();
    expect(screen.getByText(/opening the book/i)).toBeInTheDocument();
  });

  it('opens on the cover and resolves signed URLs for the cover and pages', async () => {
    renderViewer();
    await waitFor(() => expect(screen.getByText('Who Would Win?')).toBeInTheDocument());

    expect(screen.getByText('Lion')).toBeInTheDocument();
    expect(screen.getByText('Tiger')).toBeInTheDocument();
    expect(mockResolveSignedUrls).toHaveBeenCalledWith([
      'stories/story-1/cover.png',
      'stories/story-1/1.png',
      'stories/story-1/2.png',
      'stories/story-1/31.png',
      'stories/story-1/32.png',
    ]);
  });

  it('advances to the first chapter spread with the right arrow key', async () => {
    renderViewer();
    await waitFor(() => expect(screen.getByText('Who Would Win?')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    await waitFor(() => expect(screen.getByText('The lion is a large cat.')).toBeInTheDocument());
    expect(screen.getByText('The tiger is the largest cat.')).toBeInTheDocument();
    expect(screen.getByText('Meet the Animal')).toBeInTheDocument();
  });

  it('exits via the Library control and via Escape, and cleans up the key listener', async () => {
    const onClose = vi.fn();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderViewer(onClose);
    await waitFor(() => expect(screen.getByText('Who Would Win?')).toBeInTheDocument());

    await userEvent.setup().click(screen.getByRole('button', { name: /library/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix apex run test:run -- src/components/book/BookViewer.test.tsx`
Expected: FAIL, the old reader renders "Loading book..." and the page-flip layout, not the new model.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `apex/src/components/book/BookViewer.tsx` with:

```tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IStoryManifest } from '../../types/story.types';
import { CatalogService } from '../../services/CatalogService';
import { buildViews, BookView } from './views';
import { BookCover } from './BookCover';
import { StorySpread } from './StorySpread';
import { BookPage } from './BookPage';
import { TaleOfTheTape } from './TaleOfTheTape';
import { Verdict } from './Verdict';
import { ClosingPage } from './ClosingPage';
import { ReaderChrome } from './ReaderChrome';
import './BookViewer.css';

const NARROW_QUERY = '(max-width: 720px)';

function labelFor(view: BookView): string {
  switch (view.kind) {
    case 'cover': return 'Cover';
    case 'spread': return view.title;
    case 'page': return view.title || '';
    case 'showdown': return 'The Showdown';
    case 'tape': return 'Tale of the Tape';
    case 'verdict': return 'The Verdict';
    case 'closing': return 'The End';
  }
}

function renderView(
  view: BookView,
  story: IStoryManifest,
  signed: Record<string, string>,
  onReadAgain: () => void,
  onClose: () => void,
) {
  switch (view.kind) {
    case 'cover':
      return <BookCover manifest={story} signed={signed} />;
    case 'spread':
      return (
        <StorySpread
          title={view.title}
          left={view.left}
          right={view.right}
          leftFolio={view.leftFolio}
          rightFolio={view.rightFolio}
          signed={signed}
          leftAlt={story.animalA.commonName}
          rightAlt={story.animalB.commonName}
        />
      );
    case 'page':
      return (
        <div className="rd-single">
          <BookPage
            page={view.page}
            folio={view.folio}
            side={view.page.isLeftPage ? 'left' : 'right'}
            title={view.title || undefined}
            signedUrl={view.page.imageUrl ? signed[view.page.imageUrl] : undefined}
            imageAlt={view.page.isLeftPage ? story.animalA.commonName : story.animalB.commonName}
          />
        </div>
      );
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
    case 'tape':
      return <TaleOfTheTape manifest={story} />;
    case 'verdict':
      return <Verdict manifest={story} outcomePage={view.outcomePage} signed={signed} />;
    case 'closing':
      return <ClosingPage manifest={story} onReadAgain={onReadAgain} onClose={onClose} />;
  }
}

export const BookViewer: React.FC<{ storyId: string; onClose: () => void }> = ({ storyId, onClose }) => {
  const [story, setStory] = useState<IStoryManifest | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches,
  );
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const record = await CatalogService.getStory(storyId);
      if (!active || !record.manifest) return;
      const manifest = record.manifest;
      setStory(manifest);

      const paths: string[] = [];
      if (manifest.coverImageUrl) paths.push(manifest.coverImageUrl);
      for (const page of manifest.pages) {
        if (page.imageUrl) paths.push(page.imageUrl);
      }
      if (paths.length > 0) {
        const map = await CatalogService.resolveSignedUrls(paths);
        if (active) setSigned(map);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [storyId]);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const views: BookView[] = useMemo(() => (story ? buildViews(story, narrow) : []), [story, narrow]);

  useEffect(() => {
    setIndex((i) => Math.max(0, Math.min(i, views.length - 1)));
  }, [views.length]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.max(0, Math.min(views.length - 1, i + 1))),
    [views.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, onClose]);

  if (!story) {
    return (
      <div className="rd reader--journal rd-loading">
        <div className="rd-loading-emblem" aria-hidden="true">&amp;</div>
        <p className="rd-loading-text">Opening the book...</p>
        <div className="rd-loading-shimmer" aria-hidden="true" />
      </div>
    );
  }

  const view = views[index];
  const matchup = `${story.animalA.commonName} & ${story.animalB.commonName}`;
  const position = `${index + 1} / ${views.length}`;
  const progressPct = views.length > 1 ? (index / (views.length - 1)) * 100 : 0;

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.changedTouches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx > 50) goPrev();
    else if (dx < -50) goNext();
    touchX.current = null;
  };

  return (
    <div className="rd reader--journal">
      <div className="rd-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {renderView(view, story, signed, () => setIndex(0), onClose)}
      </div>
      <ReaderChrome
        matchup={matchup}
        label={labelFor(view)}
        position={position}
        progressPct={progressPct}
        canPrev={index > 0}
        canNext={index < views.length - 1}
        onBack={onClose}
        onPrev={goPrev}
        onNext={goNext}
      />
    </div>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix apex run test:run -- src/components/book/BookViewer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the whole book suite and typecheck**

Run: `npm --prefix apex run test:run -- src/components/book`
Expected: PASS (views, BookPage, StorySpread, BookCover, TaleOfTheTape, Verdict, ClosingPage, ReaderChrome, BookViewer).

- [ ] **Step 6: Commit**

```bash
git add apex/src/components/book/BookViewer.tsx apex/src/components/book/BookViewer.test.tsx
git commit -m "feat(reader): BookViewer orchestrator on the new model"
```

---

## Task 12: The Naturalist's Journal stylesheet

Replace `BookViewer.css` with the Journal look on `--apex-*` tokens, scoped under
`reader--journal`. Add the keyed view wrapper so turns cross-dissolve. No unit
tests (visual verification is Task 14); the gate here is lint and build.

**Files:**
- Modify: `apex/src/components/book/BookViewer.tsx` (wrap the rendered view in a keyed element)
- Rewrite: `apex/src/components/book/BookViewer.css`

- [ ] **Step 1: Add the keyed view wrapper in the orchestrator**

In `apex/src/components/book/BookViewer.tsx`, change the `rd-stage` body so the
current view is keyed by index (this drives the cross-dissolve):

```tsx
      <div className="rd-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="rd-view" key={index}>
          {renderView(view, story, signed, () => setIndex(0), onClose)}
        </div>
      </div>
```

- [ ] **Step 2: Write the stylesheet**

Replace the entire contents of `apex/src/components/book/BookViewer.css` with:

```css
/* The Naturalist's Journal: the book reader. Built on the --apex-* system and
   scoped under the reader--journal theme seam so other looks can be added later. */

.rd.reader--journal {
  position: fixed;
  inset: 0;
  z-index: 40;
  color: var(--apex-ink);
  font-family: var(--apex-font-ui);
  background: radial-gradient(130% 100% at 50% -10%,
    var(--apex-paper-hi) 0%, var(--apex-paper) 78%, var(--apex-paper-lo) 100%);
  overflow: hidden;
}

.rd.reader--journal::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.5;
  z-index: 0;
  background-image:
    radial-gradient(circle at 12% 20%, rgba(120, 90, 40, 0.05) 0 1px, transparent 1px),
    radial-gradient(circle at 70% 60%, rgba(120, 90, 40, 0.04) 0 1px, transparent 1px);
  background-size: 7px 7px, 11px 11px;
}

.rd-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 58px clamp(0.6rem, 6vw, 5rem) 70px;
  z-index: 1;
}
.rd-view { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }

/* ---- Loading ---- */
.rd-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8rem; }
.rd-loading-emblem {
  width: 56px; height: 56px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--apex-font-display); font-size: 1.85rem; color: var(--apex-forest);
  border: 1.5px solid var(--apex-gilt); box-shadow: inset 0 0 0 3px var(--apex-paper-hi);
}
.rd-loading-text { font-family: var(--apex-font-serif); font-style: italic; font-size: 1.15rem; color: var(--apex-brown); }
.rd-loading-shimmer { width: 130px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, transparent, var(--apex-gilt), transparent); opacity: 0.6; }

/* ---- Spread + page ---- */
.rd-spread, .rd-single {
  display: flex; gap: 4px;
  width: min(940px, 95vw); height: min(82vh, 66vw);
  background: #cbb890;
  border-radius: 5px;
  box-shadow: 0 16px 40px rgba(90, 60, 20, 0.24);
}
.rd-single { width: min(460px, 92vw); height: min(82vh, 132vw); gap: 0; background: none; }

.rd-page {
  flex: 1; position: relative; overflow: hidden;
  display: flex; flex-direction: column;
  padding: clamp(0.8rem, 2.2vw, 1.1rem) clamp(0.9rem, 2.4vw, 1.2rem) 1.6rem;
  background: linear-gradient(170deg, var(--apex-surface), var(--apex-paper));
}
.rd-page--left { border-radius: 5px 0 0 5px; }
.rd-page--right { border-radius: 0 5px 5px 0; }
.rd-single .rd-page { border-radius: 5px; }

.rd-page-head { min-height: 2.1rem; flex-shrink: 0; }
.rd-page-title { font-family: var(--apex-font-display); font-style: italic; font-weight: 600; font-size: 1.05rem; color: var(--apex-forest); }
.rd-page-rule { width: 42px; height: 1px; background: var(--apex-rule); margin-top: 4px; }

.rd-vignette { height: 60%; flex-shrink: 0; margin-bottom: 0.7rem; }
.rd-vignette-img {
  width: 100%; height: 100%; object-fit: cover;
  border-radius: 50% 48% 52% 50% / 50% 52% 48% 50%;
  box-shadow: 0 3px 12px rgba(60, 40, 15, 0.16);
}
.rd-vignette-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center; text-align: center;
  border: 1px dashed var(--apex-field-border); border-radius: 10px; padding: 1rem;
  font-family: var(--apex-font-serif); font-style: italic; color: var(--apex-brown-mute);
  background: rgba(253, 250, 241, 0.6);
}

.rd-narration { font-family: var(--apex-font-serif); font-size: 0.95rem; line-height: 1.55; color: var(--apex-ink-soft); }
.rd-narration::first-letter { font-family: var(--apex-font-display); font-weight: 600; font-size: 2.4em; line-height: 0.78; float: left; padding: 4px 8px 0 0; color: var(--apex-forest); }

.rd-fieldnote {
  margin-top: auto; padding: 0.5rem 0 0 0.6rem;
  border-left: 2px solid var(--apex-gilt);
  font-family: var(--apex-font-serif); font-style: italic; font-size: 0.78rem; color: var(--apex-brown);
}
.rd-folio { position: absolute; bottom: 0.55rem; font-family: var(--apex-font-display); font-size: 0.8rem; color: var(--apex-gilt); }
.rd-page--left .rd-folio { left: 1.1rem; }
.rd-page--right .rd-folio { right: 1.1rem; }
.rd-single .rd-page .rd-folio { left: 50%; transform: translateX(-50%); }

/* ---- Cover ---- */
.rd-cover {
  position: relative; width: min(440px, 92vw); height: min(84vh, 122vw);
  border: 2px solid var(--apex-gilt); border-radius: 4px; overflow: hidden;
  background: radial-gradient(120% 90% at 50% -10%, var(--apex-paper-hi), var(--apex-paper) 72%, var(--apex-paper-lo));
  box-shadow: 0 18px 44px rgba(90, 60, 20, 0.3);
}
.rd-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rd-cover-scrim { position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(35, 24, 12, 0.3), rgba(35, 24, 12, 0.06) 40%, rgba(35, 24, 12, 0.5)); }
.rd-cover-kicker {
  position: absolute; top: 1.1rem; left: 0; right: 0; z-index: 2; text-align: center;
  font-size: 0.58rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(253, 250, 241, 0.92);
}
.rd-cover-cartouche {
  position: absolute; left: 1.6rem; right: 1.6rem; bottom: 1.8rem; z-index: 2;
  display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: 1.1rem 1rem 1rem;
  background: linear-gradient(180deg, rgba(253, 250, 241, 0.95), rgba(248, 240, 222, 0.95));
  border: 1px solid var(--apex-gilt); border-radius: 4px; box-shadow: 0 8px 22px rgba(40, 25, 10, 0.3);
}
.rd-cover-cartouche::before { content: ''; position: absolute; inset: 4px; border: 1px solid var(--apex-rule); border-radius: 2px; pointer-events: none; }
.rd-cover-emblem {
  width: 38px; height: 38px; border-radius: 50%; margin-bottom: 0.4rem;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--apex-font-display); font-size: 1.25rem; color: var(--apex-forest);
  border: 1.5px solid var(--apex-gilt); box-shadow: inset 0 0 0 2px var(--apex-paper-hi);
}
.rd-cover-q { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #a8854a; margin-bottom: 0.5rem; }
.rd-cover-match { display: flex; align-items: center; gap: 0.6rem; }
.rd-cover-name { font-family: var(--apex-font-display); font-weight: 600; font-size: 1.15rem; color: var(--apex-ink); }
.rd-cover-amp { font-family: var(--apex-font-display); font-size: 1.45rem; color: var(--apex-gilt); line-height: 1; }

/* ---- Showdown ---- */
.rd-showdown, .rd-verdict {
  position: relative; width: min(940px, 95vw); height: min(82vh, 66vw);
  border-radius: 5px; overflow: hidden; box-shadow: 0 16px 40px rgba(90, 60, 20, 0.24);
  background: linear-gradient(150deg, #cdb88f, #6f5733);
}
.rd-showdown-img, .rd-verdict-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rd-showdown-scrim, .rd-verdict-scrim { position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(35, 24, 12, 0.28), rgba(35, 24, 12, 0.06) 42%, rgba(35, 24, 12, 0.5)); }
.rd-showdown-caption {
  position: absolute; left: 0; right: 0; bottom: 1.4rem; z-index: 2; text-align: center; padding: 0 1.5rem;
  color: var(--apex-on-forest);
}
.rd-showdown-kicker { display: block; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(253, 250, 241, 0.9); margin-bottom: 0.3rem; }
.rd-showdown-caption p { font-family: var(--apex-font-serif); font-style: italic; font-size: 1.05rem; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4); }

/* ---- Verdict ---- */
.rd-verdict-cartouche {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 2;
  width: min(280px, 80%);
  display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: 1.2rem 1.2rem 1.1rem;
  background: linear-gradient(180deg, rgba(253, 250, 241, 0.96), rgba(248, 240, 222, 0.96));
  border: 1px solid var(--apex-gilt); border-radius: 5px; box-shadow: 0 10px 28px rgba(40, 25, 10, 0.34);
}
.rd-verdict-cartouche::before { content: ''; position: absolute; inset: 4px; border: 1px solid var(--apex-rule); border-radius: 3px; pointer-events: none; }
.rd-verdict-kicker { font-size: 0.56rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #a8854a; margin-bottom: 0.7rem; }
.rd-verdict-seal {
  width: 78px; height: 78px; border-radius: 50%; margin-bottom: 0.6rem;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 2px solid var(--apex-gilt); box-shadow: 0 3px 10px rgba(120, 80, 30, 0.22), inset 0 0 0 4px var(--apex-surface);
  background: radial-gradient(circle at 50% 40%, #fbf3dc, #efe1bd);
}
.rd-verdict-seal--sealed { cursor: pointer; padding: 0.4rem; gap: 0.2rem; }
.rd-verdict-seal--sealed:hover { box-shadow: 0 4px 14px rgba(120, 80, 30, 0.3), inset 0 0 0 4px var(--apex-surface); }
.rd-verdict-seal--sealed:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }
.rd-verdict-seal-mark, .rd-verdict-star { font-family: var(--apex-font-display); font-size: 1.5rem; color: var(--apex-gilt); line-height: 1; }
.rd-verdict-seal-label { font-family: var(--apex-font-serif); font-style: italic; font-size: 0.56rem; color: var(--apex-brown); line-height: 1.2; }
.rd-verdict-victor-label { font-size: 0.46rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #a8854a; }
.rd-verdict-victor-name { font-family: var(--apex-font-display); font-weight: 700; font-size: 1.05rem; color: var(--apex-forest); line-height: 1; margin-top: 2px; }
.rd-verdict-twist { font-family: var(--apex-font-display); font-style: italic; font-size: 0.62rem; color: var(--apex-brown); margin-top: 2px; }
.rd-verdict-stamp { display: inline-block; font-size: 0.56rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 0.6rem; padding: 4px 11px; border-radius: 20px; background: var(--apex-gilt); color: #3a2c12; }
.rd-verdict-reason { font-family: var(--apex-font-serif); font-style: italic; font-size: 0.74rem; line-height: 1.5; color: var(--apex-ink-soft); }

/* ---- Tale of the Tape ---- */
.rd-tape {
  position: relative; width: min(560px, 94vw);
  padding: 1.4rem 1.6rem 1.2rem;
  background: linear-gradient(170deg, var(--apex-surface), var(--apex-paper));
  border: 1px solid var(--apex-rule); border-radius: 5px; box-shadow: 0 16px 38px rgba(90, 60, 20, 0.22);
}
.rd-tape::before { content: ''; position: absolute; top: 64px; bottom: 54px; left: 50%; width: 1px; transform: translateX(-0.5px); background: linear-gradient(var(--apex-rule), rgba(199, 162, 62, 0.5), var(--apex-rule)); }
.rd-tape-head { text-align: center; margin-bottom: 0.9rem; }
.rd-tape-kicker { font-size: 0.56rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #a8854a; }
.rd-tape-title { font-family: var(--apex-font-display); font-weight: 600; font-size: 1.35rem; color: var(--apex-ink); }
.rd-tape-rule { width: 60px; height: 2px; background: var(--apex-gilt); opacity: 0.8; margin: 6px auto 0; }
.rd-tape-vs { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-bottom: 0.8rem; }
.rd-tape-fighter { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; }
.rd-tape-fighter b { font-family: var(--apex-font-display); font-weight: 600; font-size: 1rem; color: var(--apex-ink); }
.rd-tape-medal { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--apex-font-display); font-weight: 700; color: var(--apex-forest); border: 1.5px solid var(--apex-gilt); background: radial-gradient(circle at 50% 40%, #fbf3dc, #efe1bd); }
.rd-tape-amp { font-family: var(--apex-font-display); font-size: 1.3rem; color: var(--apex-gilt); }
.rd-tape-rows { display: flex; flex-direction: column; }
.rd-tape-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 0.45rem 0; border-bottom: 1px solid rgba(216, 196, 154, 0.5); }
.rd-tape-row:last-child { border-bottom: none; }
.rd-tape-val { font-family: var(--apex-font-ui); font-size: 0.82rem; color: var(--apex-ink-soft); display: flex; align-items: center; gap: 0.4rem; min-height: 1rem; }
.rd-tape-val--l { justify-content: flex-end; text-align: right; padding-right: 1rem; }
.rd-tape-val--r { justify-content: flex-start; text-align: left; padding-left: 1rem; }
.rd-tape-trait { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--apex-brown-mute); width: 90px; text-align: center; }
.rd-tape-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--apex-gilt); box-shadow: 0 0 0 2px rgba(199, 162, 62, 0.25); }
.rd-tape-tally { margin-top: 0.9rem; text-align: center; }
.rd-tape-score { display: inline-flex; align-items: center; gap: 0.9rem; font-family: var(--apex-font-display); font-size: 1rem; color: var(--apex-ink); }
.rd-tape-score strong { font-size: 1.25rem; color: var(--apex-forest); }
.rd-tape-score strong.rd-tape-mute { color: var(--apex-brown-mute); }
.rd-tape-sep { font-family: var(--apex-font-serif); font-style: italic; font-size: 0.8rem; color: var(--apex-brown-mute); }
.rd-tape-teaser { font-family: var(--apex-font-serif); font-style: italic; font-size: 0.78rem; color: var(--apex-brown); margin-top: 0.5rem; }

/* ---- Closing ---- */
.rd-closing {
  position: relative; width: min(440px, 92vw); height: min(84vh, 122vw);
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
  padding: 1.8rem 1.5rem;
  border: 1px solid var(--apex-gilt); border-radius: 6px;
  background: radial-gradient(120% 90% at 50% -10%, var(--apex-paper-hi), var(--apex-paper) 72%, var(--apex-paper-lo));
  box-shadow: 0 18px 44px rgba(90, 60, 20, 0.26);
}
.rd-closing::before { content: ''; position: absolute; inset: 8px; border: 1px solid var(--apex-rule); border-radius: 4px; pointer-events: none; }
.rd-closing-emblem {
  width: 50px; height: 50px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--apex-font-display); font-size: 1.6rem; color: var(--apex-forest);
  border: 1.5px solid var(--apex-gilt); box-shadow: inset 0 0 0 3px var(--apex-paper-hi);
}
.rd-closing-end { font-family: var(--apex-font-display); font-style: italic; font-weight: 500; font-size: 1.7rem; color: var(--apex-ink); margin: 0.7rem 0 0.6rem; }
.rd-closing-rule { width: 46px; height: 2px; background: var(--apex-gilt); opacity: 0.8; margin-bottom: 0.7rem; }
.rd-closing-colophon { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.66rem; color: var(--apex-brown-mute); letter-spacing: 0.04em; line-height: 1.6; }
.rd-closing-kicker { text-transform: uppercase; letter-spacing: 0.18em; font-weight: 700; color: #a8854a; font-size: 0.58rem; }
.rd-closing-actions { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1.1rem; width: 100%; max-width: 200px; }
.rd-closing-act { font-family: var(--apex-font-ui); font-size: 0.78rem; font-weight: 700; border-radius: 8px; padding: 0.55rem; cursor: pointer; }
.rd-closing-act--primary { background: var(--apex-forest); color: var(--apex-on-forest); border: 1.5px solid var(--apex-forest); }
.rd-closing-act--primary:hover { background: var(--apex-forest-deep); }
.rd-closing-act--ghost { background: var(--apex-surface); color: var(--apex-ink-soft); border: 1px solid var(--apex-rule); font-weight: 600; }
.rd-closing-act:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }

/* ---- Chrome ---- */
.rd-top {
  position: absolute; top: 0; left: 0; right: 0; z-index: 5;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.7rem clamp(0.8rem, 3vw, 1.4rem);
  background: linear-gradient(rgba(251, 245, 230, 0.85), transparent);
}
.rd-back { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; font-weight: 600; color: var(--apex-brown); background: none; cursor: pointer; }
.rd-back:hover { color: var(--apex-ink); }
.rd-back:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); border-radius: 6px; }
.rd-book-title { position: absolute; left: 50%; transform: translateX(-50%); font-family: var(--apex-font-display); font-size: 0.85rem; color: var(--apex-ink-soft); white-space: nowrap; overflow: hidden; max-width: 50vw; text-overflow: ellipsis; }
.rd-nav {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 5;
  width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(253, 250, 241, 0.92); border: 1px solid var(--apex-rule); color: var(--apex-brown);
  box-shadow: 0 3px 8px rgba(90, 60, 20, 0.16); cursor: pointer;
}
.rd-nav:hover:not(:disabled) { color: var(--apex-ink); border-color: var(--apex-gilt); }
.rd-nav:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }
.rd-nav:disabled { opacity: 0.35; cursor: default; }
.rd-nav--prev { left: clamp(0.4rem, 2vw, 1.4rem); }
.rd-nav--next { right: clamp(0.4rem, 2vw, 1.4rem); }
.rd-bottom {
  position: absolute; bottom: 0; left: 0; right: 0; z-index: 5;
  display: flex; flex-direction: column; align-items: center; gap: 0.35rem;
  padding: 1.4rem 1rem 0.8rem;
  background: linear-gradient(transparent, rgba(236, 223, 192, 0.8));
}
.rd-chapter { font-family: var(--apex-font-serif); font-style: italic; font-size: 0.74rem; color: var(--apex-brown); }
.rd-track { width: 180px; height: 3px; border-radius: 2px; background: rgba(199, 162, 62, 0.25); }
.rd-fill { height: 100%; background: var(--apex-gilt); border-radius: 2px; transition: width 0.3s var(--apex-ease); }
.rd-position { font-size: 0.6rem; font-weight: 600; letter-spacing: 0.08em; color: var(--apex-brown-mute); }

/* ---- Responsive ---- */
@media (max-width: 720px) {
  .rd-stage { padding: 52px 0.6rem 64px; }
  .rd-book-title { display: none; }
  .rd-nav { width: 32px; height: 32px; }
}

/* ---- Motion (gated) ---- */
@media (prefers-reduced-motion: no-preference) {
  .rd-view { animation: rdFade 0.32s var(--apex-ease); }
  .rd-verdict-reason,
  .rd-verdict-seal--victor,
  .rd-verdict-seal--surprise,
  .rd-verdict-stamp { animation: rdFade 0.4s var(--apex-ease); }
  .rd-loading-shimmer { animation: rdShimmer 1.5s var(--apex-ease) infinite; }

  @keyframes rdFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes rdShimmer {
    0% { opacity: 0.2; transform: translateX(-26px); }
    50% { opacity: 0.85; }
    100% { opacity: 0.2; transform: translateX(26px); }
  }
}
```

- [ ] **Step 3: Lint and build**

Run: `npm --prefix apex run lint && npm --prefix apex run build`
Expected: both pass (the new CSS uses only `--apex-*` tokens and the legacy ones are still defined at this point).

- [ ] **Step 4: Run the book tests**

Run: `npm --prefix apex run test:run -- src/components/book`
Expected: PASS (tests mock the CSS import, so they are unaffected).

- [ ] **Step 5: Commit**

```bash
git add apex/src/components/book/BookViewer.tsx apex/src/components/book/BookViewer.css
git commit -m "style(reader): Naturalist's Journal stylesheet"
```

---

## Task 13: Remove `react-pageflip`, legacy tokens, Outfit, and dead styles

The reader was the last surface on the legacy tokens and the only `react-pageflip`
user. Remove all four now.

**Files:**
- Modify: `apex/package.json` (remove `react-pageflip`)
- Modify: `apex/src/index.css` (remove the legacy `:root` block; move `body` onto `--apex-*`)
- Modify: `apex/index.html` (remove the Outfit font link)
- Modify: `apex/src/App.css` (remove dead Vite starter styles)

- [ ] **Step 1: Uninstall `react-pageflip`**

Run: `npm --prefix apex uninstall react-pageflip`
Expected: it leaves `package.json` and the lockfile without `react-pageflip`.

- [ ] **Step 2: Confirm the legacy tokens are unreferenced outside `index.css`**

Run: `grep -rnE "var\(--(accent-color|accent-hover|bg-color|bg-card|text-primary|text-secondary|vs-color|border-color|border-focus|radius|shadow-sm|shadow-lg|shadow-md|transition|font-family)\)" apex/src apex/index.html`
Expected: the only matches are inside `apex/src/index.css` `body` (handled next). If anything else matches, migrate that reference to the `--apex-*` equivalent before continuing.

- [ ] **Step 3: Remove the legacy `:root` block and migrate `body`**

In `apex/src/index.css`, delete the entire first `:root` block (the legacy tokens, lines 1-22, from `:root {` with `--bg-color` through the line `--transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);` and its closing `}`). Keep the `APEX DESIGN SYSTEM` comment and the `--apex-*` `:root` that follows.

Then replace the `body` rule:

```css
body {
  background-color: var(--apex-paper);
  color: var(--apex-ink);
  font-family: var(--apex-font-ui);
  font-size: 18px;
  /* High legibility */
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 4: Remove the Outfit font link**

Run: `grep -n "Outfit" apex/index.html`
Then delete the `<link>` line(s) that load the `Outfit` Google Font from `apex/index.html`. Leave the Fraunces / Newsreader / Hanken Grotesk link intact.

- [ ] **Step 5: Remove dead Vite starter styles**

Run: `grep -rnE "\b(logo|read-the-docs)\b|className=\"card\"" apex/src --include=*.tsx`
Expected: no matches (the `.logo`, `.card`, and `.read-the-docs` rules in `apex/src/App.css` are dead). Delete those three rule blocks from `apex/src/App.css`. If `App.css` is left empty and is imported nowhere (check with `grep -rn "App.css" apex/src`), it may be left as an empty file.

- [ ] **Step 6: Lint, build, and run the full apex suite**

Run: `npm --prefix apex run lint && npm --prefix apex run build && npm --prefix apex run test:run`
Expected: all pass with no reference to a removed token or to `react-pageflip`.

- [ ] **Step 7: Commit**

```bash
git add apex/package.json apex/package-lock.json apex/src/index.css apex/index.html apex/src/App.css
git commit -m "chore(reader): drop react-pageflip, legacy tokens, and Outfit"
```

---

## Task 14: Full verification and visual confirmation

No production code changes. Verify both packages, then drive the real reader with a
throwaway preview entry and screenshot every state, then delete the preview files.

**Files:**
- Create (temporary, never committed): `apex/preview.html`, `apex/src/preview.tsx`

- [ ] **Step 1: Run every gate**

Run, expecting all to pass:

```bash
npm --prefix apex run lint
npm --prefix apex run build
npm --prefix apex run test:run
cd trigger && bun test && bun run typecheck && cd ..
```

- [ ] **Step 2: Create the throwaway preview entry**

Create `apex/preview.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reader preview</title>
  </head>
  <body>
    <div id="preview-root"></div>
    <script type="module" src="/src/preview.tsx"></script>
  </body>
</html>
```

Create `apex/src/preview.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BookViewer } from './components/book/BookViewer';
import { CatalogService } from './services/CatalogService';
import { createMockStory, createMockStoryRecord } from './test/fixtures';
import { IBattleOutcome, IPageContent } from './types/story.types';

const surprise = new URLSearchParams(location.search).get('ending') === 'surprise';

const chapters: [string, string, string][] = [
  ['Meet the Animal', 'A lion, king of the savanna.', 'A tiger, the largest of the big cats.'],
  ['Where It Lives', 'Lions roam the open grasslands.', 'Tigers prowl dense forests.'],
  ['Hunting & Diet', 'Lions hunt in coordinated prides.', 'Tigers ambush alone, with patience.'],
  ['Family & Smarts', 'Lions live in close family prides.', 'Tigers are solitary and clever.'],
  ['Attack & Defense', 'Raking claws and a fifty mile-per-hour burst.', 'A spine-snapping forelimb swipe.'],
  ['Secret Weapons', 'A roar heard five miles away.', 'Night vision six times sharper than ours.'],
];

const pages: IPageContent[] = [
  ...chapters.flatMap(([title, a, b], i): IPageContent[] => [
    { index: i * 2 + 1, title, bodyText: a, visualPrompt: title, imageUrl: `stories/preview/${i * 2 + 1}.png`, funFact: i === 2 ? 'A tiger can eat forty kilograms of meat in one night.' : undefined, isLeftPage: true },
    { index: i * 2 + 2, title: '', bodyText: b, visualPrompt: title, imageUrl: `stories/preview/${i * 2 + 2}.png`, isLeftPage: false },
  ]),
  { index: 31, title: 'The Showdown', bodyText: 'The two finally face off across the clearing.', visualPrompt: 'showdown', imageUrl: 'stories/preview/31.png', isLeftPage: true },
  { index: 32, title: 'Outcome', bodyText: 'The dust settles.', visualPrompt: 'outcome', imageUrl: 'stories/preview/32.png', isLeftPage: false },
];

const outcome: IBattleOutcome = surprise
  ? { winnerId: 'none', logicalReasoning: 'As they squared off, a far larger crocodile surged from the river and claimed the prize. Neither saw it coming.', isSurpriseEnding: true, endingType: 'The Bigger Fish' }
  : { winnerId: 'animalA', logicalReasoning: "The lion's heavier build and relentless stamina wore the tiger down. In open ground, raw power settled it.", isSurpriseEnding: false, endingType: 'Standard Victory' };

const manifest = createMockStory({ coverImageUrl: 'stories/preview/cover.png', pages, outcome });

CatalogService.getStory = (async () => createMockStoryRecord({ manifest })) as typeof CatalogService.getStory;
CatalogService.resolveSignedUrls = (async (paths: string[]) =>
  Object.fromEntries(paths.map((p) => [p, `https://picsum.photos/seed/${encodeURIComponent(p)}/1024/1536`]))) as typeof CatalogService.resolveSignedUrls;

createRoot(document.getElementById('preview-root')!).render(
  <BookViewer storyId="preview" onClose={() => console.log('close')} />,
);
```

- [ ] **Step 3: Screenshot every state**

Start the dev server (`npm --prefix apex run dev`) and use the `playwright-cli` skill
to load `http://localhost:5173/preview.html` and capture, confirming zero console
errors at each:

- The loading state (throttle or capture the first frame).
- The cover (art-forward cartouche).
- A chapter spread (advance once; check the 3/5 image and the field note).
- The Showdown beat.
- The Tale of the Tape (stat rows, edge dots, tally).
- The Verdict sealed, then click the seal for the revealed victor (no stamp).
- The Verdict surprise: reload `http://localhost:5173/preview.html?ending=surprise`, reveal, confirm the twist and the `The Bigger Fish` stamp.
- Mobile single-page: set a 390px-wide viewport, confirm one page per turn.
- Reduced motion: emulate `prefers-reduced-motion: reduce`, confirm no shimmer or fade and the layouts render in place.

- [ ] **Step 4: Delete the preview files**

```bash
rm apex/preview.html apex/src/preview.tsx
```

Confirm they are gone and untracked: `git status --short` shows neither file.

- [ ] **Step 5: Confirm no em dashes in the changed copy and docs**

Run: `grep -rnP "[\x{2014}]" apex/src/components/book trigger/src/lib docs/specs/2026-06-16-book-reader.md docs/plans/2026-06-16-book-reader.md`
Expected: no matches.

- [ ] **Step 6: Final commit (if anything is outstanding)**

```bash
git add -A
git commit -m "test(reader): verify reader states (no production changes)" --allow-empty
```

---

## Self-Review Notes

- **Spec coverage:** reading model and responsiveness (Tasks 3, 11, 12), the six-chapter restructure (Task 1), crop-safe one-image-per-page (Task 2), the Journal spread composition with the 3/5 image (Tasks 4, 5, 12), the art-forward cover (Task 6), the Showdown (Task 11), the Tale of the Tape (Task 7), the break-the-seal Verdict with the surprise-only stamp (Task 8), the colophon closing (Task 9), chrome and loading (Tasks 10, 11, 12), the theme seam (`reader--journal`, Tasks 11, 12), the preserved service contract and lazy images (Tasks 4, 6, 11), token/dependency cleanup (Task 13), and verification with screenshots (Task 14).
- **Deferred (not in this plan, tracked in the `reader-deferred-themes` memory and to carry into the handoff):** the Plate & Caption and Full-bleed Showcase looks and the dynamic in-reader theme switcher. The semantic markup plus the `reader--journal` seam keep them a future drop-in.
- **Type consistency:** `buildViews` returns the `BookView` union consumed unchanged by `BookViewer` (`labelFor`, `renderView`); `BookPage` props (`page`, `folio`, `side`, `title?`, `signedUrl?`, `imageAlt?`) match every call site in `StorySpread` and `BookViewer`; `Verdict` reads `manifest.outcome` and the `outcomePage` from the `verdict` view; the generation pipeline passes `{ name, brief }[]` chapters that `getAspectsForAnimal` now accepts.
- **Decisions deferred to implementation (intentional, per the spec):** the exact stat rows in the Tale of the Tape adapt to the data present; the page image aspect is set to `3:4` (the spec left the precise value to planning, and this plan fixes it).

