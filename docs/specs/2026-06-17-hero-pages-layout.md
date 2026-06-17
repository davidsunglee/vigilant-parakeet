# Hero Pages Layout: Full Art with Text Below (Cover, Showdown, Verdict)

## Goal

Stop the reader's three "hero" pages (cover, showdown, verdict) from cropping their
artwork and occluding the animals with overlaid text. Unify all three on a single
pattern: a full, uncropped 3:2 artwork on top, with the page's text in a panel
directly below it.

## Context (current state)

The reader has three full-bleed hero views, each rendering an image with text laid
on top of it:

- **Cover** (`BookCover.tsx`, `.rd-cover`): container is `aspect-ratio: 3 / 2` and
  the cover image is generated at `3:2`, so the art is shown in full. But the title
  cartouche is absolutely positioned over the lower image (`.rd-cover-cartouche`,
  `bottom: 1.8rem`), covering the animals where they meet.
- **Showdown** (inline JSX in `BookViewer.tsx`, `.rd-showdown`): container is roughly
  landscape/square (`width: min(940px, 95vw); height: min(82vh, 66vw)`). The image is
  generated at `3:4` portrait with `object-fit: cover`, so the portrait is cropped
  top and bottom to fill the wider box. The intro caption is overlaid at the bottom
  (`.rd-showdown-caption`).
- **Verdict** (`Verdict.tsx`, `.rd-verdict`): same container and `3:4` cover-crop as
  the showdown (uses the outcome image, page 32). The verdict cartouche is centered
  over the image (`.rd-verdict-cartouche`, `top: 50%`), blocking the central action.

Two root problems compound:

1. **Aspect-ratio crop.** Showdown and verdict art is generated `3:4` portrait but
   displayed in a landscape/square container with `object-fit: cover`, slicing off
   the top and bottom. The cover avoids this only because its container matches its
   3:2 source.
2. **Overlay occlusion.** All three pages paint text on top of the art, so any
   centered or full-frame composition gets covered.

Generation aspect ratios today (`trigger/src/lib/pipeline.ts`): cover is `3:2`; every
page image (chapters, showdown index 31, outcome index 32) is `3:4`.

## Scope

### In scope

- A shared hero layout: full 3:2 art on top, text panel below, applied to cover,
  showdown, and verdict.
- Generation: render pages 31 (showdown) and 32 (outcome) at `3:2`; chapters stay
  `3:4`.
- Reader components: restructure `BookCover.tsx` and `Verdict.tsx`; extract the
  showdown into a new `Showdown.tsx`; rework the relevant `BookViewer.css` rules.
- Re-render the existing 4 books' showdown and outcome images at `3:2`.
- Test updates for the reader components and the generation aspect ratios.

### Out of scope

- Changing chapter (spread) pages, the Tale of the Tape, or the closing page.
- Changing the verdict reveal logic (the seal stays; only its container moves).
- Regenerating narrative text or chapter images.
- New reader themes (the work stays inside the existing Journal look).

## The design

### Shared hero layout

Introduce one wrapper used by all three hero pages:

```
.rd-hero                (vertical flex column, width-bounded, height-capped to stage)
  .rd-hero-art          (aspect-ratio: 3 / 2; holds the <img>, no crop)
  .rd-hero-panel        (text region: kicker, title, body, or verdict content)
```

- **Width and height.** The hero is width-bounded like today's cover
  (`width: min(900px, 94vw)`) and the whole stack is capped to the stage height. The
  art keeps a 3:2 shape; the panel takes its natural height. On shorter viewports the
  art scales down first so art and panel stay on screen together. Concretely: cap the
  art region with a `max-height` derived from viewport height and let its width follow
  the 3:2 ratio, so the art shrinks before the panel is squeezed.
- **Art.** The `<img>` fills `.rd-hero-art`. Because the source is now 3:2 and the
  region is 3:2, `object-fit: cover` shows the full image with no crop. (`contain` is
  the fallback if any source is off-ratio.)
- **No scrims, no absolute text.** The per-page scrim layers and absolutely
  positioned cartouche/caption blocks are removed. Text lives in `.rd-hero-panel` in
  normal flow.
- **Look.** The panel keeps the Journal styling already used by the cartouches
  (paper-toned background, gilt rule, display/serif type) so the redesign reads as the
  same publication.

### Cover

Art on top. The panel below holds the existing cover furniture in flow order: the
"An Apex Publication" kicker, the `&` emblem, "Who Would Win?", and the matchup names
(`Animal A & Animal B`). No card floats over the art.

### Showdown

Art on top. The panel below holds the "The Showdown" kicker and the intro body text
(`page.bodyText`). Same panel treatment as the others.

### Verdict

Art (the outcome image, page 32) shown immediately on top, always fully visible. The
panel below holds the seal-and-reveal flow, unchanged in behavior:

- Sealed: the "The verdict is in. Break the seal." button.
- Revealed (standard): the Victor seal (label + winner name) and the reasoning
  paragraph.
- Revealed (surprise): the "An Unexpected Turn" seal, the ending-type stamp, and the
  reasoning paragraph.

Revealing expands the panel; the art does not move. The outcome art depicts both
animals in a scene rather than declaring a winner, so showing it before the seal is
broken is not treated as a spoiler. The actual reveal is the Victor text.

### Component structure

Make the three hero pages parallel, self-contained components:

- `BookCover.tsx`: restructure to `.rd-hero` art + panel.
- `Verdict.tsx`: restructure to `.rd-hero` art + panel; keep the `revealed` state and
  the standard/surprise branches.
- `Showdown.tsx` (new): extract the showdown JSX currently inline in
  `BookViewer.tsx`'s `renderView`. Props: the showdown `page` and its signed image
  URL. `BookViewer.tsx` renders `<Showdown ... />` for the `showdown` view kind.
- `BookViewer.css`: replace the `.rd-cover*`, `.rd-showdown*`, and `.rd-verdict*`
  overlay rules with the shared `.rd-hero`, `.rd-hero-art`, and `.rd-hero-panel`
  rules plus the per-page panel content styles.

### Generation (`trigger/`)

In `pipeline.ts`, the page-image loop currently calls
`generateImage(page.visualPrompt, { aspectRatio: '3:4', styleAnchor })` for every
page. Change it so pages with index 31 and 32 request `aspectRatio: '3:2'` while all
other pages stay `3:4`. No prompt change is required: the showdown/outcome visual
prompts already include both animals and crop-safe margin guidance, and with text no
longer overlaid the art can use the full frame. `3:2` already maps to `1536x1024` in
`openai-image.ts`.

### Existing-book remediation

Re-render `stories/<id>/31.png` and `stories/<id>/32.png` for all 4 existing books at
`3:2`, reusing each book's already-stored visual prompt and style anchor (all four
books now have valid prompts for 31/32). This is a re-render at the new aspect, not a
narrative regeneration, performed with a one-off script in the same shape as the
showdown remediation already used (service client + `ImageClient` + `uploadImage`
upsert). The manifest needs no change.

## Testing

- `Verdict.test.tsx`: the outcome image renders; sealed state shows the break-the-seal
  button; revealing shows the victor name (standard) or ending type (surprise) and the
  reasoning; the text is in the panel, not an absolutely positioned overlay.
- `BookCover.test.tsx`: the cover image renders and the title/matchup text renders in
  the panel.
- `Showdown` (new test, or via `BookViewer.test.tsx`): the showdown image renders and
  the kicker plus intro text render in the panel.
- `BookViewer.test.tsx`: `renderView` routes the `showdown` kind to the new component;
  existing navigation/labeling assertions still pass.
- `pipeline.test.ts`: pages 31 and 32 request `aspectRatio: '3:2'`; chapter pages
  request `3:4` (assert against `image.generateImage` call args).

## Layout risk and fallback

A 3:2 image plus a full verdict paragraph is tall. On short windows the art shrinks to
keep both visible. If the art ever becomes too small, the fallback is to let the panel
scroll while the art holds a minimum size. Start with scale-to-fit and only add panel
scrolling if testing shows the art getting too small.

## Files touched

- `trigger/src/lib/pipeline.ts` (3:2 for pages 31/32) and
  `trigger/src/lib/__tests__/pipeline.test.ts`.
- `apex/src/components/book/BookCover.tsx`, `Verdict.tsx`, `Showdown.tsx` (new),
  `BookViewer.tsx`, `BookViewer.css`, and the matching `*.test.tsx` files.
- A throwaway re-render script for the 4 existing books (not committed).
