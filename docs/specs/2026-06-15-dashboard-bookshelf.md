# Apex Dashboard Redesign: The Reading Room (Surface 2)

## Goal

Redesign the logged-in dashboard as the second surface of the clean-room Apex
overhaul. The sign-in page (surface 1) established that "the app is a book" and
framed itself as a title page. This surface makes the logged-in experience feel
like a **Reading Room**: a personal library of the matchups you have created,
with composing a new matchup framed as opening a fresh title page. It reuses the
Apex design system (the `--apex-*` tokens and primitives) and removes the last
of the old GitHub-dark coral and purple look from this surface.

## Context (current state)

`apex/` is a React 18 + Vite single-page app that generates illustrated
"Who Would Win?" storybooks. When logged in, `App.tsx` renders a bare inline
"Sign out" button above `Dashboard`, or the full-screen `BookViewer` when a
story is open. `Dashboard.tsx` today is a top-to-bottom page: a centered header,
a generator form (two animal fields, an art-style select, a Fierce Mode toggle
in a disclosure), and a grid of story cards. Its styles live in the large global
`apex/src/index.css` using the legacy tokens (`--accent-color`, `--vs-color`,
`--bg-card`, and so on) and classes (`.dashboard-container`, `.generator-form`,
`.story-card`, `.generation-overlay`, and others).

The dashboard reads the signed-in user via `useAuth`, lists stories via
`CatalogService.listStories`, subscribes to owner-filtered live updates via
`CatalogService.subscribeToStories(userId, handler)` (Supabase Realtime),
creates a story via `CatalogService.createStory({ animalA, animalB, artStyle,
fierceMode })` (non-blocking), resolves cover image URLs via
`CatalogService.resolveSignedUrls`, deletes via `CatalogService.deleteStory`,
and opens a story by calling the `onReadStory(storyId)` prop. Each story row has
a `status` of `generating | ready | failed` plus `animal_a`, `animal_b`,
`title`, `manifest`, `cover_image_path`, `progress_step`, `progress_pct`,
`error`, `created_at`, and (when ready) `manifest.outcome.winnerId`.

## Scope

### In scope

- Rebuild the dashboard to the **Reading Room** information architecture: a
  masthead, a browse bar, and a clean gallery shelf of story covers.
- A **matchup composer** that opens as a framed title-page overlay, plus a
  composer-forward **empty state** for new users.
- Status-native **story cards** for `ready`, `generating` (an "on the press"
  treatment with live progress), and `failed`.
- **Account chrome**: replace the bare inline "Sign out" button with an account
  menu in the masthead.
- **Browse**: newest-first by default, a sort control (newest, oldest, A to Z),
  and a search field that filters by either contender's name.
- Move the dashboard fully onto `--apex-*` tokens, extract its styles out of the
  global stylesheet, and remove the legacy tokens and classes that only the
  dashboard used.
- Updated component tests reflecting the new model.

### Out of scope (own later passes)

- The **book reader** (`BookViewer`). Clicking a cover opens it exactly as it
  works today.
- Any change to auth behavior, routing, the `CatalogService` API surface, or the
  backend (Supabase, Trigger.dev).
- The two-accent "one color per combatant" idea. This surface stays on the
  single forest primary.
- Real cover art direction. Covers render the existing AI-generated images; the
  faked covers in the mockups are illustrative only.

### Non-breaking migration note

The `--apex-*` tokens already live alongside the legacy tokens in `index.css`.
This pass moves the dashboard fully onto `--apex-*`, then deletes the legacy
tokens and classes that only the dashboard referenced. Legacy tokens still used
by `BookViewer` stay until the reader's own pass. Before deleting any legacy
token, confirm it is unreferenced (grep `apex/src` for it); delete only the
dashboard-only ones.

## The design

### Information architecture: the Reading Room

The shelf is the hero. The page is a masthead across the top, a browse bar, and
then a clean gallery of face-out covers filling the rest. Both jobs the surface
must serve stay first-class: browsing the whole library (the shelf itself), and
composing a new matchup (a prominent stamp in the masthead that opens the
composer, and a composer-forward empty state for first-time users).

### Masthead and account chrome

A full-width masthead with a hairline `--apex-rule` bottom border:

- **Left (brand):** the gilt `&` emblem (the `.apex-emblem` primitive at a
  smaller size), a `Hanken Grotesk` uppercase kicker `An Apex Publication`, and a
  `Fraunces` wordmark `Who Would Win?`.
- **Right (actions), pinned to the right edge:** a forest primary stamp
  `Begin a new matchup` that opens the composer, then an **account button** (a
  round avatar showing the first letter of the signed-in email, falling back to
  the `&` mark). The account button opens a small menu listing the user's email
  and a `Sign out` item that calls `useAuth().signOut`. This replaces the inline
  button currently rendered by `App.tsx`.

The `Begin a new matchup` stamp is shown whenever the library has at least one
book. In the empty state the inline composer is already the focus, so the stamp
is omitted to avoid redundancy.

### The library shelf (clean gallery)

Face-out covers in an airy responsive grid (CSS grid,
`repeat(auto-fill, minmax(...))`), generous spacing, soft warm shadows, no
skeuomorphic wood. The arrangement alone reads as a curated shelf, which keeps
the surface clean and shows the illustrated art at the largest size. Each cover
is a 3:4 card with the AI cover image (when ready) and a small paper caption
band. Below the cover sits the title (`Fraunces`) and the created date
(`Hanken Grotesk`, `--apex-brown-mute`).

### Browse: search and sort

A browse bar above the gallery:

- **Heading:** `Your Library` (`Fraunces`) with a quiet count, for example
  `12 books`.
- **Search:** a paper field (`.apex-field` styling) with a magnifier glyph that
  filters the shelf to stories whose `animal_a` or `animal_b` contains the query
  (case-insensitive). An empty query shows everything.
- **Sort:** a control offering `Newest` (default), `Oldest`, and `A to Z` (by
  title, falling back to `animal_a vs animal_b`). Sorting and search apply to the
  rendered list only; they do not refetch.

### The story card and its three states

One memoized `StoryCard` renders the correct treatment for its status.

**Ready.** The cover image fills the card (resolved signed URL). Below: title,
date, and a **Reveal winner** control (see below). On hover or keyboard focus
the card surfaces its actions: a forest `Read the book` button (calls
`onReadStory(story.id)`) and a quiet `Remove` control (calls the optimistic
delete). The whole cover is also a click target for reading. Actions are
reachable by keyboard, not hover-only.

**Generating ("on the press").** The forming cover shows an animated ink and
gilt sweep across a forest field, evoking a book being printed. A slim progress
track reflects `progress_pct`, and the live `progress_step` shows beneath it
(falling back to a quiet `Working...`). A small `On the press` caption sits in
the band. No Read action. When a Realtime UPDATE flips the row to `ready`, the
real cover develops in (a soft cross-fade), and the actions appear.

**Failed.** A muted, grayed cover with a small clay-red mark, a quiet line
`This matchup did not come together.` and the underlying `error` detail in
`--apex-error`. Only a `Remove` action; no Read and no Retry (this preserves the
current behavior).

### Reveal winner

The spoiler-hidden mechanic carries over. Ready cards show a `Reveal winner`
pill; clicking it toggles to a forest winner pill `Winner: {name}`, resolved
from `manifest.outcome.winnerId` (the existing `winnerLabel` logic:
`animalA`, `animalB`, or `None (Surprise!)`). Reveal state is per-card and
in-memory, as today.

### The matchup composer (title-page overlay)

`Begin a new matchup` opens a focused overlay that dims the shelf and centers a
framed composer styled as a fresh book's title page (the gilt double-rule frame
echoes the sign-in page). Contents, top to bottom:

1. The `&` emblem and a `Hanken Grotesk` kicker `Begin a New Matchup`.
2. Two **name slots** with the gilt `&` between them: `First contender` and
   `Second contender`, each a labeled paper field. On narrow widths they stack
   with the `&` between.
3. **Art style** as a row of selectable visual chips (a labeled radio group),
   one per style. The six styles in order: `Surprise Me`, `Watercolor`,
   `Colored Pencil Sketch`, `Painterly`, `Graphic Novel`, `3D Animated`. (This
   renames the existing `Storybook Painterly` label to `Painterly`; the
   underlying id `storybook-painterly` is unchanged.) Default selection:
   `Surprise Me`.
4. A secondary **Fierce mode** toggle (default off), tucked below the styles as a
   quiet option rather than a separate disclosure.
5. The primary stamp `Conjure the book`.

Submitting calls `CatalogService.createStory({ animalA, animalB, artStyle,
fierceMode })`, then immediately closes the overlay and resets the form. It is
non-blocking: there is no full-screen blocking generation overlay. The new
`generating` row arrives on the shelf via Realtime and shows its on-the-press
card. The overlay supports `Esc` to close, a scrim click to dismiss, focus trap,
and returns focus to the stamp on close. During the brief submit, the controls
stay interactive and only the primary stamp reflects a pending label.

### Empty state

When the library has no books, the composer renders **inline and centered** as
the page's hero (the same `MatchupComposer`, rendered without the overlay scrim),
under a short welcome such as `Conjure your first matchup.` This makes the very
first action obvious. Once a book exists, the shelf takes over and composing
moves behind the masthead stamp.

### Atmosphere and motion

The page uses the warm paper gradient and faint grain from the Apex system. On
load, cards reveal with a gentle staggered fade and rise. The on-the-press sweep
loops while generating; the generating-to-ready cover develops with a soft
cross-fade; the winner pill reveals with a small scale-in. All motion is gated
behind `@media (prefers-reduced-motion: no-preference)`; with reduced motion
requested, everything renders in final position with no transition or looping
animation.

### Responsive behavior

The gallery reflows from several columns down to one. The masthead keeps the
brand left and actions right, collapsing the kicker and tightening spacing on
small screens. The composer overlay becomes a near-full-width sheet with the two
name slots stacked. The browse bar wraps so search and sort sit below the
heading on narrow widths.

### Accessibility

- The composer fields have associated labels; the art-style chips form a labeled
  radio group (accessible name `Art style`); Fierce mode is a labeled checkbox.
- Search has a visually-hidden label; sort is a labeled control.
- The account menu is keyboard operable and closes on `Esc` and outside click.
- Visible `:focus-visible` rings in forest on all interactive elements, including
  covers, chips, and menu items.
- Decorative glyphs (the emblem, the `&` between slots, status marks) are
  `aria-hidden`. Generating progress uses `role="progressbar"` with
  `aria-valuenow/min/max`. The failed error uses `role="alert"`.
- Contrast meets WCAG AA, reusing the verified Apex ink-on-paper and
  on-forest pairings.

## Component structure

Break the surface into small, well-bounded units under
`apex/src/components/dashboard/`:

- **`Dashboard.tsx`** (orchestrator): owns data and state (stories, Realtime
  subscription, resolved cover URLs, revealed winners, search query, sort order,
  composer open state). Renders the masthead, the browse bar, and either the
  gallery or the empty-state composer. Keeps the preserved data effects and
  handlers.
- **`Masthead.tsx`**: brand, the `Begin a new matchup` stamp, and the account
  menu. Receives the user email, `onCompose`, and `onSignOut`.
- **`MatchupComposer.tsx`**: the title-page form (name slots, art-style chips,
  fierce toggle, conjure). Renders in an `overlay` or `inline` variant. Receives
  `onCreate` and (for overlay) `onClose`.
- **`StoryCard.tsx`**: the status-aware card (extracted from the current inline
  component), with the ready, on-the-press, and failed treatments.
- **`Dashboard.css`**: all dashboard styling, on `--apex-*` tokens. The
  components import this one stylesheet for the surface (the subcomponents only
  ever compose the dashboard, so one cohesive sheet is simpler than four).

## CSS and token migration

- Add `apex/src/components/dashboard/Dashboard.css` built entirely on `--apex-*`.
- Delete the dashboard-only blocks from `apex/src/index.css`:
  `.dashboard-container`, `.dashboard-header`, `.generator-section`,
  `.advanced-options*`, `.provider-selector*`, `.generator-form`,
  `.input-group`, `.input-icon`, `.vs-badge`, `.generate-btn`,
  `.stories-section`, `.empty-state`, `.empty-icon`, `.story-grid`,
  `.story-card*`, `.custom-cover*`, `.cover-*`, `.story-info`, `.winner-badge`,
  `.reveal-winner-btn`, `.card-actions`, `.read-btn`, `.delete-btn*`,
  `.story-progress*`, `.story-error`, and the `.generation-*` overlay block, plus
  their `@media` rules.
- Then remove legacy `:root` tokens that are no longer referenced anywhere in
  `apex/src` after the deletions (likely `--accent-color`, `--vs-color`,
  `--bg-card*`, and similar). Verify each with a grep before removing; keep any
  token still used by `BookViewer` or other surfaces.

## Behavioral contract (preserved)

These calls and behaviors are unchanged: `listStories` on mount,
`subscribeToStories(user.id, handler)` with INSERT/UPDATE/DELETE reconciliation
(deduped by id, new rows prepended), `resolveSignedUrls` batch resolution for
ready covers, `createStory({ animalA, animalB, artStyle, fierceMode })`
non-blocking with optimistic form clear, `deleteStory` with optimistic removal
and reload-on-failure, and `onReadStory(storyId)` to open the reader. No
provider or model selector is reintroduced.

## Testing

Vitest plus Testing Library, the existing stack. The service-call contract above
is the stable anchor; the tests that assert UI shape are intentionally rewritten
to the new model (the handoff treats `Dashboard.test.tsx` as a contract to evolve
deliberately, not break silently):

- **Empty state:** with no stories, the inline composer is shown and the welcome
  copy renders.
- **Compose (empty state):** filling the two name slots, choosing a style chip,
  toggling Fierce mode, and submitting calls `createStory` with the exact values
  and then clears and resets the form. (Runs against the inline composer, so no
  overlay step is needed.)
- **Compose (with library):** clicking `Begin a new matchup` opens the overlay;
  `Esc` and scrim click close it.
- **Non-blocking:** with `createStory` pending, no blocking "creating" overlay
  appears and the composer controls stay interactive.
- **Art style chips:** the six chips render in order with the renamed `Painterly`
  label, default `Surprise Me`; selecting one updates the submitted `artStyle`.
- **Status cards:** a generating row shows the progress bar and step and no Read;
  a ready row shows the cover, Read (calls `onReadStory`), and reveal-winner
  toggling to the winner; a failed row shows its error, Remove, and no Read or
  Retry.
- **Realtime:** generating to ready on UPDATE swaps the on-the-press card for the
  ready card; INSERT prepends and dedupes by id.
- **Delete:** optimistic removal calls `deleteStory`.
- **Browse:** search filters by contender name; sort reorders (newest default).
- **Account:** the masthead exposes a Sign out action that calls `signOut`.

## Implementation (files touched)

- `apex/src/App.tsx`: remove the inline sign-out chrome; render `Dashboard`
  (which now owns the masthead) and `BookViewer` as today.
- `apex/src/components/dashboard/Dashboard.tsx`: rebuild to the Reading Room,
  preserving the data and Realtime logic.
- `apex/src/components/dashboard/Masthead.tsx`,
  `MatchupComposer.tsx`, `StoryCard.tsx`: new components.
- `apex/src/components/dashboard/Dashboard.css`: new, on `--apex-*`.
- `apex/src/components/dashboard/Dashboard.test.tsx`: rewritten to the new model.
- `apex/src/types/artStyle.ts`: rename the `Storybook Painterly` label to
  `Painterly` (id unchanged).
- `apex/src/index.css`: delete dashboard-only classes and now-unreferenced legacy
  tokens.

Verification gate: `npm --prefix apex run lint`, `npm --prefix apex run build`,
and `npm --prefix apex run test:run` all pass, plus driving the running dev
server with `playwright-cli` to screenshot each state (empty, composer overlay,
generating, ready, failed, mobile) with zero console errors. No em dashes in any
copy or doc (verify with `grep`).

## Future surfaces (not built here)

The same tokens and primitives extend next to the redesigned `BookViewer`
reader and the generation progress experience. The two-accent per-combatant
system remains an option to revisit then.
