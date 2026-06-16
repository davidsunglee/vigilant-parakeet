# Apex Book Reader Redesign: The Naturalist's Journal (Surface 3)

## Goal

Redesign the full-screen book reader (`BookViewer`) as the third surface of the
clean-room Apex overhaul. The sign-in page (surface 1) framed the app as a
storybook title page, and the dashboard (surface 2) became the Reading Room. This
surface is the payoff: opening a conjured matchup and actually reading it. It
reuses the Apex design system (the `--apex-*` tokens and primitives), removes the
last of the legacy GitHub-dark tokens, drops the `react-pageflip` dependency, and
adds the climactic "who won and why" reveal the reader has never had.

This pass also reaches into the generator (`trigger/`) to slim the book from
twelve thin aspect pages to six richer chapters. The earlier surfaces kept the
backend out of scope; this one intentionally includes it, because the book's
length is set in `trigger/src/lib/pipeline.ts`, not in the reader, and a shorter,
better-paced book is part of the redesign.

## Context (current state)

`apex/` is a React 18 + Vite single-page app that generates illustrated
"Who Would Win?" storybooks server-side (Supabase + Trigger.dev). `BookViewer`
is lazy-loaded from `App.tsx` (`React.lazy` + `Suspense`, fallback "Loading
book...") and rendered full-screen when a dashboard cover is opened via
`onReadStory(storyId)`; `onClose` returns to the dashboard.

The current reader loads the story with `CatalogService.getStory(storyId)`, reads
`record.manifest` (`IStoryManifest`), and batch-resolves signed URLs for the cover
and every page image via `CatalogService.resolveSignedUrls`. It renders on the
third-party `react-pageflip` (`HTMLFlipBook`) library: a skeuomorphic page-curl
front cover, pages, a "Predictions Checklist" page with a dead "Confirm
Predictions" button, and a back cover reading "The End." It flips on Left/Right
arrows and nav arrows. `BookViewer.tsx` and `BookViewer.css` still reference the
legacy tokens (`--accent-color`, `--bg-color`, `--bg-card`, `--border-color`,
`--border-focus`, `--radius`, `--shadow-sm`, `--shadow-lg`, `--text-primary`,
`--text-secondary`, `--transition`, `--vs-color`), plus `--shadow-md`, which is
referenced but never defined in `index.css` (a latent bug).

The manifest carries a full `outcome` (`winnerId`, `logicalReasoning`,
`isSurpriseEnding`, `endingType`) and rich per-animal `stats`
(weight, length, speed, weaponry, armor, brainSize) that the current reader never
surfaces. The book has no climax: it just ends with "The End."

The generator (`trigger/src/lib/pipeline.ts`) builds the book from twelve
`ASPECTS`, each written for both animals as a facing pair (24 pages, indices 1-24),
plus a "Showdown" page (index 31) and an "Outcome" page (index 32). One image is
generated per page plus the cover (27 images), throttled to two in flight with a
15-second gap, so image count dominates generation time.

## Scope

### In scope

- Rebuild `BookViewer` as a calm two-page spread reader in the Apex
  "Naturalist's Journal" look, built behind a theme seam (a single shipped look,
  others deferred).
- Replace `react-pageflip` with a lightweight in-house spread/pagination that
  collapses to one page per turn on narrow viewports, and remove the dependency.
- New reading surfaces: an art-forward cover, the six chapter spreads, a Showdown
  beat, a spread-spanning Tale of the Tape, a break-the-seal Verdict (the new
  climax), and a colophon closing page.
- New reader chrome: a quiet "Library" back route, a soft page/progress
  indicator, unobtrusive navigation, and an on-brand loading state.
- Slim the generated book in `trigger/` from twelve aspects to six chapters, and
  make page images crop-safe so one image per page serves any layout.
- Move the reader fully onto `--apex-*`, then delete the now-unreferenced legacy
  tokens, the Outfit font link, and dead Vite starter styles.
- Updated component and pipeline tests reflecting the new model.

### Out of scope (own later passes)

- The deferred reader looks (Plate & Caption, Full-bleed Showcase) and a dynamic
  in-reader theme switcher. Tracked in the `reader-deferred-themes` memory; carry
  them into the handoff. The shipped reader is built behind the theme seam so they
  remain a future drop-in.
- The generation progress experience on the dashboard (surface 2 owns the
  on-the-press card; this pass does not redesign it).
- Auth, routing, the `CatalogService` API surface, and the Supabase/Trigger.dev
  infrastructure beyond the pipeline content and image-sizing changes named here.
- The two-accent "one color per combatant" idea. The reader stays on the single
  forest primary.

### Non-breaking migration note

The reader is the last surface on the legacy tokens. This pass moves it fully onto
`--apex-*`, then deletes the legacy `:root` tokens that nothing else references
(verify each with a grep across `apex/src` before removing). The pipeline change is
content-only: the reader renders whatever pages the manifest holds, so a shorter
book needs no reader change to display, and a slimmer manifest and the new reader
ship together cleanly.

## The design

### Reading model and responsiveness

A calm two-page spread. On a wide viewport the reader shows two facing pages; as
the viewport narrows past a breakpoint, the spread becomes one page per turn. It
is the same paginated model at two column counts, not two interaction models. Page
turns are a quiet cross-dissolve (or short slide), never a 3D curl, so the
reduced-motion path is trivial (turns become instant).

Navigation: unobtrusive previous/next arrows, Left/Right arrow keys, and swipe on
touch. `Esc` exits to the dashboard. The keydown listener is registered on the
window and cleaned up on unmount (preserved from today).

The book is modeled as an ordered sequence of leaves. Each story chapter
contributes two leaves (animal A, animal B). The cover, Showdown, Tale of the
Tape, Verdict, and closing page are full-width panels that occupy the whole spread
in both layouts. On a wide viewport the two leaves of a chapter are shown together
as a spread and navigation advances by spread or panel; on a narrow viewport
navigation advances one leaf or panel at a time. Folios (page numbers) on chapter
pages are numbered sequentially from the reading order, independent of the raw
manifest `index`.

### The book's structure (reading order)

1. Cover / title page.
2. The story: six chapter spreads (animal A left, animal B right).
3. The Showdown (the buildup beat).
4. The Tale of the Tape (the stats-and-advantage scorecard).
5. The Verdict (the break-the-seal climax).
6. The closing page (the colophon).

### The Journal look and the theme seam

The reader ships a single, pixel-perfect look, the "Naturalist's Journal": soft
paper stock, soft-edged vignette illustrations, Fraunces chapter titles, narration
in Newsreader, fun facts as italic margin field notes, and gilt folios and rules.

It is built behind a theme seam on purpose. Every page renders one stable, semantic
structure (chapter title, illustration, narration, fun fact, folio). The active
look is selected by a class on the reader root (`reader--journal`), and the visual
treatment lives in CSS scoped under that class. This costs almost nothing extra and
keeps the deferred looks a future drop-in, but all polish goes into the one shipped
look. We do not build Plate or Full-bleed in this pass.

### Spread composition (the hero)

Each story page, in the Journal look:

- The chapter title (Fraunces italic, `--apex-forest`) with a short `--apex-rule`
  hairline sits at the top of the left page (animal A). The right page (animal B)
  has no title; its illustration aligns with the left page's via an equivalent
  spacer so the two vignettes sit level.
- The illustration is a soft-edged vignette occupying about three-fifths of the
  page height. The art leads the page.
- The narration (Newsreader, `--apex-ink-soft`) sits beneath the illustration with
  a Fraunces forest drop cap. Narration is short (two to three sentences).
- When a page carries a fun fact, it appears as an italic Newsreader field note at
  the foot of the page with a gilt left border. Absent otherwise.
- A gilt Fraunces folio sits in the outer bottom corner (left page bottom-left,
  right page bottom-right).
- If a page's `imageUrl` has not resolved, a quiet paper placeholder shows the
  `visualPrompt`, matching today's fallback behavior.

### The cover

The cover is this book's title page and reuses the sign-in motif: a thin gilt
frame, the `&` emblem, the Fraunces "Who Would / Win?" lockup ("Win?" italic in
forest), and the matchup names joined by a gilt ampersand (the brand's quiet
"this & that" rather than a loud VS).

The chosen treatment is art-forward. The AI cover image fills the cover behind a
soft top-to-bottom scrim for legibility; an uppercase "An Apex Publication" kicker
sits at the top; and a paper cartouche near the foot (a gilt-ruled panel with an
inset hairline) holds the emblem, "Who Would Win?", and the matchup
(`animalA.commonName` and `animalB.commonName` with the gilt ampersand between).
When `coverImageUrl` is absent, the cartouche sits on the paper gradient with no
image (matching today's no-cover case).

### The Showdown

The Showdown renders the generated showdown page (its image and narration) as a
single dramatic, image-forward beat that fills the spread, the hinge between the
story and the payoff. It carries a short caption or the showdown `bodyText` and no
folio.

### The Tale of the Tape

A scorecard that spans the spread, using the center gutter as the dividing line
between the two contenders.

- A centered header: an uppercase "Before the Verdict" kicker, "Tale of the Tape"
  in Fraunces, and a short gilt rule.
- Contender headers: each name with a small gilt initial medallion, joined by the
  gilt ampersand.
- Rows: the advantage comparison is driven by `manifest.checklist.items`, one row
  per trait, with a gilt advantage dot on the side the checklist marks. The hard
  stats (`weight`, `length`, `speed`, and others available on `animal.stats`)
  appear as paired value rows. Animal A's values sit on the left, animal B's on the
  right, flanking the trait label in the gutter. The row set adapts to the data
  available; a matchup thin on data shows fewer rows.
- A tally footer counts the checklist advantages ("Lion 4, on paper, 2 Tiger") and
  an italic teaser hands off to the verdict.

The tally builds anticipation without spoiling: a lead on paper is not the winner,
and the surprise ending exists to upend it.

### The Verdict

The climax, and a deliberate mirror of the cover so the book opens and closes on
the same chord. The Outcome illustration fills the spread behind a soft scrim, and
a centered paper cartouche holds the verdict.

The winner is hidden until the reader breaks the seal. On arrival the cartouche
shows a sealed state (a wax seal reading "The verdict is in"); pressing it (a
labeled button, also operable by keyboard) breaks the seal and reveals the result,
which develops in. With reduced motion requested, the reader lands on the revealed
state with no animation. The break-the-seal control carries the spoiler suspense
the dashboard preserves all the way to the end.

The revealed verdict adapts to the outcome:

- Standard win (`isSurpriseEnding` false, a real `winnerId`): the seal names the
  victor (the matching `commonName`, in forest), the `logicalReasoning` follows in
  Newsreader italic, and there is no ending-type stamp.
- Surprise ending (`isSurpriseEnding` true, `winnerId` "none"): the seal reframes
  to a twist (a gilt mark, no name), and the `endingType` is named in a gilt stamp
  (one of External Event, Trait-Based Retreat, The Bigger Fish, Mutual Neutrality),
  with the reasoning telling the story. The stamp appears only here, so a rare
  ending reads as rare.

### The closing page

A colophon that bookends the cover inside the same gilt frame: the `&` emblem,
"The End" in Fraunces italic, a gilt rule, and a quiet colophon (the "An Apex
Publication" kicker, the matchup, and the created date). Two ways onward: a primary
forest "Read it again" (returns to the cover) and a ghost "Back to the Reading
Room" (calls `onClose`).

### Chrome and loading

- Top: a quiet "Library" back control at the top-left (a left chevron plus the
  word "Library") that calls `onClose`, and the book's title centered (the matchup
  with the gilt ampersand). The top chrome floats over the paper with a faint
  legibility gradient.
- Bottom: a soft page indicator, the current chapter name (Newsreader italic), a
  thin gilt progress bar, and a soft position count rendered as a fraction ("3 / 11").
- Navigation: unobtrusive circular previous/next arrows on the sides (paper fill,
  gilt-rule border), in addition to keys and swipe.
- Loading: while the manifest and signed URLs resolve, the `&` emblem, "Opening
  the book..." in Newsreader italic, and a faint gilt shimmer gated behind
  `prefers-reduced-motion`. This replaces the bare "Loading book..." text.

### Atmosphere and motion

The reader sits on the warm Apex paper radial gradient with the faint paper grain,
reusing the treatment established on the dashboard. Page turns cross-dissolve, the
verdict seal breaks, and the loading shimmer plays, all gated behind
`@media (prefers-reduced-motion: no-preference)`. With reduced motion requested,
turns are instant, the verdict lands revealed, and nothing loops.

### Responsive behavior

The spread collapses to a single page per turn on narrow viewports. The cover,
Tale of the Tape, Verdict, and closing panels reflow to a single column and stay
legible at phone widths. Chrome tightens (the back control may shorten to its
chevron, the title may truncate) but stays reachable. Touch targets meet a
comfortable minimum.

### Accessibility

- The reader is a labeled region with a clear, keyboard-reachable exit (the
  "Library" control and `Esc`). Focus is managed on open and restored on close,
  consistent with the composer overlay added in surface 2.
- Navigation arrows, the break-the-seal control, and the closing actions have
  clear accessible names and visible `:focus-visible` forest rings.
- Illustrations use meaningful `alt` text; decorative glyphs (the emblem, the
  ampersand, the seal mark, gilt dots and rules) are `aria-hidden`.
- The progress indicator exposes position to assistive tech.
- Images keep `loading="lazy"` and `decoding="async"` (preserved).
- Contrast meets WCAG AA, reusing the verified Apex ink-on-paper and on-forest
  pairings; text over illustrations sits on scrims or paper cartouches that hold
  contrast.
- Honors `prefers-reduced-motion`.

## Content and generation slimming (`trigger/`)

### The six chapters

The twelve aspects collapse into six richer chapters. Ten of the original twelve
topics survive, folded together; only Overall Threat Level is dropped outright, and
Speed & Agility is folded into Attack & Defense rather than kept as its own page.

1. **Meet the Animal**: Scientific Classification and Size & Weight.
2. **Where It Lives**: Natural Habitat.
3. **Hunting & Diet**: Hunting & Diet and Senses (named "Hunting & Diet" so it
   reads sensibly for non-predators; senses appear as how the animal finds food).
4. **Family & Smarts**: Social Behavior and Intelligence.
5. **Attack & Defense**: Weapons & Offense and Defenses & Armor. The prompt also
   features speed or agility when it is exceptional and central to attacking or
   escaping (a cheetah's sprint, a peregrine's dive), and stays quiet about it
   otherwise.
6. **Secret Weapons**: one surprising special ability.

Each chapter still generates a left page (animal A) and a right page (animal B), so
six chapters give twelve story pages, plus the Showdown and Outcome pages.

### Generation pipeline changes

- Replace the twelve-entry `ASPECTS` string array in `pipeline.ts` with six chapter
  definitions carrying a display name (the page title) and a brief describing the
  combined topic for the page. Update `LlmClient.getAspectsForAnimal` to take these
  definitions and instruct the model to write one page per chapter covering the
  brief, titled with the name, including the Attack & Defense speed clause. The
  page-pairing loop iterates six chapters (story indices 1 through 12); the Showdown
  and Outcome pages are appended as today.
- The fun-fact rule (at most three across the pages) scales down with the shorter
  list; cap at roughly two to three and keep them genuinely surprising.
- The checklist and outcome generation (`getShowdownAndOutcome`) is unchanged; the
  reader's Tale of the Tape consumes the existing four-trait checklist plus the
  animal stats.

This brings the book to about fourteen story pages and about fifteen images (from
about twenty-six pages and twenty-seven images), with per-page images kept.

### The image pipeline (one crop-safe image per page)

One image is generated per page, and every layout (the Journal vignette now, a
full-bleed or framed plate later) crops from that single source. We never generate
per-layout images.

- **Crop-safe composition**: the page and cover visual prompts instruct the model
  to keep the subject centered with generous margin and nothing critical at the
  edges, so the same image survives a soft-edged vignette, a framed plate, or an
  edge-to-edge full bleed without cutting off the animal. This is the one
  generation change that keeps the deferred looks free.
- **Size and aspect**: page images currently request `4:3`, which maps to
  1536x1024 on `gpt-image-2`. Since the reader pages are portrait and a future
  full-bleed page would be portrait, generate page images at a portrait or square
  aspect (for example `3:4`, 1024x1536, or `1:1`, 1024x1024) so the single source
  crops gracefully to both the Journal vignette and a portrait full bleed. The
  exact choice is finalized in planning against the provider. Note 1536px is the
  `gpt-image-2` long-edge ceiling; crop-safe composition, not raw resolution, is
  the main lever.

## Component structure

Small, well-bounded units under `apex/src/components/book/`:

- **`BookViewer.tsx`** (orchestrator): loads the story and resolves signed URLs
  (preserved contract), builds the ordered list of leaves and panels, owns the
  current position, navigation (keys, swipe, arrows, `Esc`), and the verdict reveal
  state. Renders the chrome and the current view with the cross-dissolve.
- **`BookPage.tsx`**: one Journal page (title, vignette, narration, fun fact,
  folio). The atomic unit shown two-up in a spread on wide viewports and singly on
  narrow ones.
- **`StorySpread.tsx`**: a chapter spread composed of two `BookPage`s; also renders
  the Showdown beat.
- **`BookCover.tsx`**, **`TaleOfTheTape.tsx`**, **`Verdict.tsx`**,
  **`ClosingPage.tsx`**: the full-width panels.
- **`ReaderChrome.tsx`**: the back control, centered title, progress indicator, and
  navigation arrows.
- **`BookViewer.css`**: all reader styling, on `--apex-*`, scoped under the
  `reader--journal` theme class (one stylesheet for the surface, matching the
  dashboard's one-sheet pattern).

## Token and dependency migration

- Move the reader fully onto `--apex-*`. Remove every legacy token reference from
  the reader markup and styles, and the latent `--shadow-md` reference.
- Remove `react-pageflip` from `apex/package.json` and the lockfile.
- After migration, grep `apex/src` for each remaining legacy `:root` token in
  `index.css` (`--accent-color`, `--accent-hover`, `--bg-color`, `--bg-card`,
  `--text-primary`, `--text-secondary`, `--vs-color`, `--border-color`,
  `--border-focus`, `--radius`, `--shadow-sm`, `--shadow-lg`, `--transition`, the
  `--font-family` Outfit default); delete the ones nothing references and keep any
  still in use.
- Drop the Outfit Google Fonts link in `apex/index.html` and update the
  `body { font-family }` default to the Apex UI font once Outfit is unreferenced.
- Confirm `apex/src/App.css` Vite starter styles (`.logo`, `.card`,
  `.read-the-docs`) are dead and remove them.

## Behavioral contract (preserved)

These calls and behaviors are unchanged: `BookViewer` receives `{ storyId, onClose }`
and is lazy-loaded from `App.tsx` via `React.lazy` and `Suspense`;
`CatalogService.getStory(storyId)` loads `record.manifest`;
`CatalogService.resolveSignedUrls` batch-resolves the cover and page image paths;
`onClose` returns to the dashboard; images keep `loading="lazy"` and
`decoding="async"`; the keydown listener is cleaned up on unmount. The dead
"Confirm Predictions" button is removed.

## Testing

Vitest plus Testing Library for the reader, and the existing Vitest suite for the
pipeline. The service-call contract is the stable anchor; UI-shape assertions are
rewritten deliberately to the new model.

Reader (`apex/src/components/book/BookViewer.test.tsx` and any per-component tests):

- Loading state shows before the manifest resolves; content renders after.
- Cover renders the title, both animal names, and the cover image from the signed
  URL with the lazy attributes; the no-cover case renders the cartouche without an
  image.
- Chapter spreads render the narration for both pages, the chapter title on the
  left page, the generated image from the signed URL versus the `visualPrompt`
  placeholder, and the fun-fact field note when present and not otherwise.
- Tale of the Tape renders trait rows, both contender names, advantage marks from
  the checklist, and the tally.
- Verdict: the winner is hidden until the seal is broken; breaking it reveals the
  victor and reasoning; a standard win shows no ending stamp; a surprise ending
  shows the reframed seal and the ending-type stamp.
- Closing page renders the colophon and both actions ("Read it again" returns to
  the cover; "Back to the Reading Room" calls `onClose`).
- Navigation: arrow keys and nav arrows advance and retreat; the "Library" control
  and `Esc` call `onClose`; the keydown listener is cleaned up on unmount.

Pipeline (`trigger/src/lib/__tests__/pipeline.test.ts`):

- Generation produces six chapters (twelve story pages) plus the Showdown and
  Outcome pages, and the corresponding image count.
- The chapter titles and the Attack & Defense speed clause are present.

Verification gate: `npm --prefix apex run lint`, `npm --prefix apex run build`, and
`npm --prefix apex run test:run`, plus the `trigger` test suite, all pass. Drive the
real reader with a throwaway preview entry (a `preview.html` plus a small
`preview.tsx` that mounts `BookViewer` with a mock manifest and mocked
`CatalogService`), screenshot via the `playwright-cli` skill across states (loading,
cover, a chapter spread, the Showdown, the Tale of the Tape, the Verdict sealed and
revealed and surprise, mobile single-page, and reduced motion), confirm zero
console errors, then delete the preview files (never commit them). No em dashes in
any copy or doc (verify with `grep`).

## Deferred (tracked for a future session)

- The two unbuilt looks (Plate & Caption, Full-bleed Showcase) and a dynamic
  in-reader theme switcher, captured in the `reader-deferred-themes` memory and to
  be carried into the handoff. The shipped reader's theme seam keeps them a future
  drop-in.
- The generation progress experience remains the next surface after this one.
