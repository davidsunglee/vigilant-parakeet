# Apex Generation Progress Redesign: The Press Room (Surface 4)

## Goal

Redesign the generation progress experience, what a reader sees and feels while a
book they conjured is being made, as the fourth surface of the clean-room Apex
overhaul. The sign-in page (surface 1) framed the app as a storybook title page,
the dashboard (surface 2) became the Reading Room, and the reader (surface 3)
became the Naturalist's Journal. This surface is the wait between "Conjure the
book" and "the book is ready to read", the last experience still wearing a
minimal first-pass treatment.

Today that moment is a single state of a dashboard card: a thin bar and a
functional step string. This pass turns it into a small, on-brand "watch it being
made" moment. Generation is framed as a book on the press: an ambient on-the-press
shelf card is the default, and tapping it opens a focused, leavable **Press Room**
where the book is printed plate by plate and finished with a quiet "hot off the
press" cover reveal. It stays non-blocking throughout.

This pass also reaches into the backend (`trigger/` and `supabase/`), because the
progress data is emitted there, not in the app. It replaces the free-form progress
strings with a normalized, canonical progress representation that the client maps
to display copy, and it adds a resume-cheap "Try again" for failed books. The
earlier surfaces kept most of the backend out of scope; the reader pass set the
precedent that reaching into the generator is allowed when it serves the surface.

## Context (current state)

`apex/` is a React 18 + Vite single-page app that generates illustrated
"Who Would Win?" storybooks server-side (Supabase + Trigger.dev). A logged-in user
sees the Reading Room (`Dashboard`), composes a matchup, and opens any ready story
in the full-screen `BookViewer`.

The generation progress experience is currently **one state of the dashboard
`StoryCard`** (`apex/src/components/dashboard/StoryCard.tsx`, the
`status === 'generating'` branch), styled by the `rr-card--generating` and
`rr-press*` rules in `Dashboard.css`:

- A forming cover shows an animated ink-and-gilt sweep across a forest field with
  the gilt `&` mark. A slim progress track (`rr-ptrack` / `rr-pbar`) reflects
  `progress_pct` with `role="progressbar"`, the live `progress_step` shows beneath
  it (falling back to "Working..."), and a small "On the press" caption sits in the
  band. There is no Read action while generating and no way to focus on one book.
- When a Realtime UPDATE flips the row to `ready`, the real cover develops in
  (a soft cross-fade, `rrDevelopIn`) and the ready actions appear.
- The failed state is a grayed cover with a clay-red "!" mark, the line "This
  matchup did not come together." plus the underlying `error`, and only a Remove
  action.

The composer (`MatchupComposer`) submits via `CatalogService.createStory` and
closes immediately; the new `generating` row arrives on the shelf via Realtime, so
the user lands on the shelf watching the card. Surface 2 deliberately removed the
old full-screen blocking generation overlay, so generation is non-blocking and
watched on the shelf.

### Data and progress model (current)

`StoryRecord` (`apex/src/types/story.types.ts`) carries `status`
(`generating | ready | failed`), `progress_step` (string), `progress_pct`
(number), `error`, `animal_a`, `animal_b`, `title`, `cover_image_path`,
`manifest`, and timestamps. The `public.stories` table
(`supabase/migrations/20260614000001_create_stories.sql`) defines
`progress_step text` and `progress_pct int not null default 0`.

The pipeline (`trigger/src/lib/pipeline.ts`) reports progress via
`deps.db.updateProgress(storyId, step, pct)` (the adapter in
`trigger/src/lib/db.ts` writes `{ progress_step, progress_pct }`) at these
milestones, in order:

- `Researching animal profiles...` (5%)
- `Designing animal illustrations...` (10%)
- `Simulating the showdown...` (15%)
- `Illustrating pages...` (25%)
- `Illustrating page {n} of {total}...` (per page image, ramping ~25% to ~95%;
  `total` is `rawPages.length`, about 14 after the reader pass)
- `Saving your story...` (98%)

Image generation dominates wall-clock time (each image is throttled to two in
flight with a 15-second gap), so the book spends most of the wait in the
page-illustration phase. The dashboard receives these as live UPDATEs via
`CatalogService.subscribeToStories(userId, handler)` and reconciles by id.

### Generation control flow (current)

- `CatalogService.createStory` invokes the `create-story` Edge Function
  (`supabase/functions/create-story/index.ts`), which verifies the caller's JWT,
  inserts a `generating` row (with `progress_step: "Queued…", progress_pct: 0`),
  and triggers the `generate-story` Trigger.dev task by REST, returning
  `{ storyId }`.
- The `generate-story` task (`trigger/src/trigger/generateStory.ts`) runs
  `runGenerationPipeline`, calls `finalize` on success and `fail` only on the
  terminal attempt (after 3 automatic attempts). The pipeline already does
  cost-resumption: narrative phases reload from the `manifest` checkpoint, and each
  image is skipped if its Storage object already exists.
- The task carries an explicit non-goal in code: "no user-facing manual retry in
  this slice." There is no Retry today; the failed card offers only Remove.

## Scope

### In scope

- A two-tier generation progress experience sharing one progress source: an
  enhanced ambient **shelf card** and a focused, opt-in **Press Room** opened from
  it. Both stay non-blocking.
- The Press Room as a full-screen, leavable overlay rendered by the dashboard,
  with states for setting the press, printing the pages (the Press Bed), binding,
  the "hot off the press" cover reveal, and the failed "press jammed" state.
- A redesigned generating card (the on-the-press treatment, evolved) and a
  redesigned failed card in the Apex voice, with a new **Try again**.
- A normalized, canonical progress representation: replace `progress_step` +
  `progress_pct` with a single `progress jsonb` column the pipeline emits, and a
  client mapping module that owns the display copy and derives the percent.
- A resume-cheap retry: a new `retry-story` Edge Function and
  `CatalogService.retryStory`, wired onto the failed card.
- The on-brand progress copy (the bookmaking beats), chosen client-side.
- Accessibility (progressbar semantics, a polite live region, focus management,
  reduced motion) and responsiveness down to phone widths.
- Updated and new tests across the app, the pipeline, and the Edge Functions.

### Out of scope (own later passes)

- The reader (`BookViewer`) and its deferred looks. Reading a ready book is
  unchanged; "Read the book" from the reveal opens the reader exactly as today.
- Auth, routing structure, the Realtime subscription model, and the
  Supabase/Trigger.dev infrastructure beyond the progress column, the retry
  function, and the pipeline emission named here.
- Provider or model selection (still chosen server-side), and any change to the
  generation content itself (chapters, images, outcome).
- Storage cleanup on delete or retry (the existing deferral stands).
- The two-accent "one color per combatant" idea. This surface stays on the single
  forest primary.

### Migration note (clean, pre-release)

There is no deployed Supabase database yet (the first release ships after this
feature), so the schema is free to change cleanly rather than accrete. This pass
edits `supabase/migrations/20260614000001_create_stories.sql` to define a single
`progress jsonb` column in place of `progress_step text` and
`progress_pct int`, and rebuilds the local database from migrations
(`supabase db reset`) to verify. The realtime/storage migration
(`20260614000002_storage_and_realtime.sql`) is checked to confirm it does not
reference the dropped columns (it should not). The `apex` `StoryRecord` type,
`create-story`, `finalize`, and `db.updateProgress` move to the new column in the
same pass, so nothing references the old fields after it lands.

## The design

### Concept and the two tiers

Generation is a book being printed. The experience is two tiers reading from the
same live story row, not an either/or:

- **The shelf card (ambient).** The always-present state on the Reading Room
  shelf. Most people glance at the shelf and never click in, so the card reads well
  on its own and doubles as the door to the Press Room.
- **The Press Room (focused, opt-in).** The full "watch it being made" view,
  entered from the card. Where the pages print in one at a time and the reveal
  happens.

Both render their copy from one client function, `describeProgress`, so the words
and state never drift.

### The shelf card

One memoized `StoryCard` keeps rendering the correct treatment for its status. The
`ready` treatment and the generating-to-ready develop-in cross-fade are unchanged
from surface 2.

**Generating ("on the press").** The forming cover keeps the forest field, the
gilt `&` mark, and the looping ink-and-gilt sweep. Over it: an "On the press"
caption, the current beat (`describeProgress(...).label`, for example "Printing the
pages"), a slim gilt progress track reflecting the derived percent, the count
("{page} of {total}") once printing has begun, and a quiet "Watch it print" invite.
The whole cover is a control that opens the Press Room for this book (`onWatch`).
The track keeps `role="progressbar"` with `aria-valuenow` from the derived percent.
There is no Read action while generating.

**Failed ("the press jammed").** A muted, grayed cover with a small clay-red mark
and a quiet "The press jammed" caption. Below: the title, the line "This matchup
did not come together." and the underlying `error`, with two actions: **Try again**
(calls `onRetry`) and **Remove** (calls `onDelete`). The error line keeps
`role="alert"`.

### The Press Room (architecture and entry)

The Press Room is a full-screen overlay rendered by `Dashboard` when a new
`watchingStoryId` state is set. It is opened from any generating card's "Watch it
print" control, and it reads the **live story row straight from the dashboard's
existing `stories` state**, so it needs no second Realtime subscription and always
reflects the latest progress. Generation continues server-side whether the room is
open or closed.

- "Read the book" on the reveal calls the same `onReadStory(id)` the ready cards
  use, so App swaps in `BookViewer`.
- "Back to the shelf" and `Esc` close the overlay (`onClose` clears
  `watchingStoryId`).
- The overlay is a labeled, focus-managed surface consistent with the composer
  overlay and the reader: focus moves into the room on open and is restored to the
  originating card on close, and focus is trapped while open.

### The Press Room states

The room derives everything from `describeProgress(story.status, story.progress)`.

**Setting the press** (`queued`, `researching`, `designing`, `simulating`). The
press bed is quiet and not yet populated, because the page count is not known until
the pages are assembled. The beat narrates the warmup ("Studying the contenders",
"Drawing the plates", "Staging the showdown") above a gilt progress rule. The `&`
emblem anchors the stage.

**Printing the pages** (`illustrating`). The hero: the **Press Bed**, a grid of
`total` plate slots that ink in one per finished page. A printed plate is an
abstract pressed sheet (a gilt `&` on a forest field), not the real page image
(per-page image paths are not exposed mid-flight, and the real art is saved for the
cover reveal). The currently printing plate carries a soft gilt highlight; the rest
are empty paper. Above the bed: an "On the press" eyebrow, the beat title
("Printing the pages"), a thin gilt progress rule, and the count
("Plate {page} of {total}"). This is the long pole, so it is the centerpiece, and
the accruing plates make "how far along am I" unmistakable.

**Binding** (`binding`). A brief beat as the plates gather: "Binding the book".

**Hot off the press** (`status === 'ready'`). The finish. The real cover develops
in (a soft cross-fade) with a gilt "Hot off the press" line, the title, and two
ways onward: a primary forest **Read the book** (calls `onReadStory`) and a ghost
**Back to the shelf** (calls `onClose`). The winner stays sealed: this moment shows
the cover art for the first time, not the outcome, so the reader's break-the-seal
Verdict stays the place the winner is revealed. If the cover signed URL has not
resolved yet, a quiet paper placeholder holds the frame and the cover cross-fades
in when the URL arrives (the dashboard's existing signed-URL effect resolves the
watched row's cover once it is ready).

**The press jammed** (`status === 'failed'`). If a book fails while the room is
open, the room shows the failed state in place: the "press jammed" line and the
underlying reason, with **Try again** (calls `onRetry`) and **Remove** (calls
`onDelete`, which also closes the room). The reason uses `role="alert"`.

### Atmosphere and motion

The Press Room sits on the warm Apex paper radial gradient with the faint paper
grain, reusing the dashboard and reader treatment. The card sweep loops, the plates
ink in as each page finishes, the plates gather at binding, and the cover develops
in at the reveal. All motion is gated behind
`@media (prefers-reduced-motion: no-preference)`. With reduced motion requested,
the sweep does not loop, plates appear in their final state with no animation, and
the cover lands developed in with no cross-fade.

### Responsive behavior

The Press Room is supported at every width as a full-screen view (the natural
pattern on a phone, consistent with the reader and the composer overlay); it is
never dropped on mobile in favor of the card. The enhanced card stays the calm
shelf fallback on all widths, not a mobile-only substitute.

The Press Bed grid reflows to fewer columns (about four at phone width) and stays
legible down to phone widths; the cover reveal and the room chrome reflow to a
single column with stacked, full-width actions. The shelf card scales as today.
Touch targets meet a comfortable minimum, and the "Watch it print" control and the
back control stay reachable at narrow widths.

### Accessibility

- The card progress track and the Press Bed expose `role="progressbar"` with
  `aria-valuenow` (the derived percent), `aria-valuemin={0}`, and
  `aria-valuemax={100}`.
- A polite live region (`aria-live="polite"`) in the Press Room announces the
  current beat label as it changes, so step changes are spoken without interrupting.
- The Press Room is a labeled overlay with a keyboard-reachable exit (the back
  control and `Esc`), focus moved in on open and restored on close, and focus
  trapped while open.
- The "Watch it print" control, "Try again", "Remove", "Read the book", and "Back
  to the shelf" have clear accessible names and visible forest `:focus-visible`
  rings.
- Decorative glyphs (the emblem, the sweep, the gilt plate marks, the seal-free
  reveal) are `aria-hidden`. The failed reason uses `role="alert"`.
- Contrast meets WCAG AA, reusing the verified Apex ink-on-paper and on-forest
  pairings; text over the forest field and the cover sits on scrims or holds
  contrast on its own.

## The progress data contract

### Canonical progress

The pipeline stops emitting prose and emits a normalized, structured progress
value. It is persisted in a single `progress jsonb` column on `public.stories`
(replacing `progress_step` and `progress_pct`) and shaped as a discriminated union
on `phase`:

```ts
export type StoryProgress =
  | { phase: 'queued' }
  | { phase: 'researching' }
  | { phase: 'designing' }
  | { phase: 'simulating' }
  | { phase: 'illustrating'; page: number; total: number }
  | { phase: 'binding' };
```

The terminal states `ready` and `failed` stay on `status`; `progress` describes
only the in-flight phases. `StoryProgress` is defined in `apex`'s
`story.types.ts` (for `StoryRecord.progress`) and mirrored in `trigger`'s
`story.types.ts` (for the pipeline and the db adapter). The JSON shape is the
contract both sides agree on.

`StoryRecord.progress_step: string | null` and `progress_pct: number` are replaced
by `progress: StoryProgress | null`.

### The client mapping (one place for copy)

A single module, `apex/src/components/dashboard/describeProgress.ts`, maps a
canonical value to display data:

```ts
describeProgress(status, progress) -> {
  phase: string,        // the phase key, or 'ready' / 'failed'
  label: string,        // the on-brand beat, the one place wording lives
  pct: number,          // derived percent for the bar and aria-valuenow
  page?: number,        // present while illustrating
  total?: number,       // present while illustrating
}
```

This is the only file that holds the display words and the percent curve, which is
exactly the "client chooses the exact copy" seam the design calls for. The beats:

| Canonical | Beat label (`label`) | Derived `pct` |
| --- | --- | --- |
| `{phase:'queued'}` | Queued | 0 |
| `{phase:'researching'}` | Studying the contenders | 5 |
| `{phase:'designing'}` | Drawing the plates | 10 |
| `{phase:'simulating'}` | Staging the showdown | 15 |
| `{phase:'illustrating', page, total}` | Printing the pages | `min(95, round(25 + (page/total)*70))` |
| `{phase:'binding'}` | Binding the book | 98 |
| `status === 'ready'` | Hot off the press | 100 |
| `status === 'failed'` | The press jammed | (n/a) |

While illustrating, components compose the count from `page` and `total`
("Plate {page} of {total}" in the room, "{page} of {total}" on the card). The first
illustrating update carries `page: 0` so the room learns `total` and the bed
materializes the moment printing begins. None of these strings use em dashes.

## Backend changes

### Migration (`supabase/`)

- Edit `20260614000001_create_stories.sql` to replace the `progress_step text` and
  `progress_pct int not null default 0` columns with `progress jsonb` (nullable,
  no default). Rebuild the local database from migrations to verify, and confirm
  `20260614000002_storage_and_realtime.sql` does not reference the dropped columns.

### Pipeline and db adapter (`trigger/`)

- `trigger/src/types/story.types.ts`: add the mirrored `StoryProgress` type.
- `trigger/src/lib/db.ts`: change `updateProgress(client, storyId, progress)` to
  write `{ progress }` (the `step, pct` parameters are removed). `finalize` drops
  the `progress_pct: 100` write and just sets `status: 'ready'` with the manifest
  and title; the client reads `status` for the terminal state.
- `trigger/src/lib/pipeline.ts`: `PipelineDeps.db.updateProgress` becomes
  `(storyId, progress: StoryProgress) => Promise<void>`. Replace the six prose
  calls with canonical values, in the same order: `{phase:'researching'}`,
  `{phase:'designing'}`, `{phase:'simulating'}`,
  `{phase:'illustrating', page: 0, total}` before the loop,
  `{phase:'illustrating', page: completed, total}` per page, and `{phase:'binding'}`
  at save. The pipeline no longer hardcodes the percent weights (they move to the
  client mapping).
- `trigger/src/trigger/generateStory.ts`: update the `db.updateProgress` adapter
  binding to the new signature.

### create-story Edge Function (`supabase/functions/create-story/`)

- The insert sets `progress: { phase: 'queued' }` (and `status: 'generating'`),
  replacing the `progress_step` / `progress_pct` fields. Nothing else changes.

### retry-story Edge Function (new) and CatalogService

- New `supabase/functions/retry-story/index.ts`, mirroring `create-story`'s shape
  (CORS, injected `Deps`, JWT verification). It accepts `{ storyId }`, loads the
  row with the service client, and requires that the row belongs to the caller and
  has `status === 'failed'` (otherwise a 4xx). It resets the row
  (`status: 'generating'`, `error: null`, `progress: { phase: 'queued' }`),
  rebuilds the task payload from the row's columns (`storyId`, `ownerId`,
  `animalA`, `animalB`, `options: { artStyle, fierceMode }`, the server-side
  `generationConfig`), and re-triggers `generate-story` by REST. On a trigger
  failure it rolls the row back to `failed` with the error, as `create-story` does.
  Because the pipeline resumes from the `manifest` checkpoint and skips images that
  already exist in Storage, a retry is cheap rather than a full restart.
- `CatalogService.retryStory(id)` invokes the `retry-story` function and returns
  the `storyId`.

### Dashboard wiring

- `Dashboard` owns `watchingStoryId`, passes `onWatch` to generating cards, renders
  the `PressRoom` overlay for the live watched row (with its resolved cover URL),
  and passes `onReadStory`, `onClose`, `onRetry`, and `onDelete` into it.
- The failed card's "Try again" calls a handler that optimistically flips the row
  to `generating` (with `progress: { phase: 'queued' }`) and calls
  `CatalogService.retryStory`, reloading on failure, mirroring the optimistic
  delete pattern. The Realtime UPDATE then drives the live progress.

## Component structure

Small, well-bounded units under `apex/src/components/dashboard/`:

- **`PressRoom.tsx`** (new): the focused overlay. Receives the live `story`, the
  resolved `coverUrl`, and `onReadStory`, `onRetry`, `onDelete`, `onClose`. Derives
  its copy from `describeProgress` and renders the setting-the-press, Press Bed,
  binding, reveal, and failed states, plus focus management and `Esc` handling.
- **`PressRoom.css`** (new): all Press Room styling, on `--apex-*`, scoped under a
  `press-room` root class, reusing the paper gradient and grain (one stylesheet for
  the surface, matching the dashboard and reader one-sheet pattern).
- **`describeProgress.ts`** (new): the canonical-to-copy mapping and percent
  derivation, the single home for the beat wording.
- **`StoryCard.tsx`**: the generating treatment evolves (beat from
  `describeProgress`, derived percent, the count, the "Watch it print" control via a
  new `onWatch` prop) and the failed treatment gains "Try again" via a new
  `onRetry` prop.
- **`Dashboard.tsx`**: the `watchingStoryId` state, the `PressRoom` overlay, and
  the retry handler, alongside the preserved data and Realtime logic.
- **`Dashboard.css`**: the `rr-card--generating` and `rr-failed` rules update for
  the evolved card (the "Watch it print" invite and the "Try again" action).

Types and backend: `StoryProgress` in `apex/src/types/story.types.ts` and
`trigger/src/types/story.types.ts`; `StoryRecord.progress` replaces the two old
fields; `CatalogService.retryStory`; the new `retry-story` function; the edits to
`pipeline.ts`, `db.ts`, `generateStory.ts`, `create-story`, and the migration.

## Behavioral contract (preserved)

These calls and behaviors are unchanged unless named above: `listStories` on mount;
`subscribeToStories(user.id, handler)` with INSERT/UPDATE/DELETE reconciliation
(deduped by id, new rows prepended); `resolveSignedUrls` batch resolution for ready
covers; `createStory` non-blocking with the composer closing immediately and the
new generating row arriving via Realtime; `deleteStory` optimistic with
reload-on-failure; `onReadStory(storyId)` to open the reader; the generating-to-ready
develop-in cross-fade on the ready card. Generation stays non-blocking: the Press
Room is opt-in and leavable, and submitting still drops the user on the shelf.

## Testing

Vitest plus Testing Library for the app, the existing Vitest suite for the
pipeline, and the existing Deno test harness for the Edge Functions. The
service-call and progress-shape contracts are the stable anchors; UI-shape
assertions are rewritten deliberately to the new model.

App (`apex/src`):

- `describeProgress`: each phase maps to the expected label and percent; the
  illustrating percent ramps with `page`/`total` and clamps at 95; `ready` and
  `failed` map to their terminal labels.
- `StoryCard`: a generating row renders the beat, the progress track with the
  derived `aria-valuenow`, the count while illustrating, and the "Watch it print"
  control (calls `onWatch`); a failed row renders the reason with `role="alert"`,
  "Try again" (calls `onRetry`), and "Remove" (calls `onDelete`), and no Read.
- `PressRoom`: setting-the-press for the pre-illustrating phases (no plates, the
  warmup beat); the Press Bed renders `total` plates with `page` of them printed
  and the count; binding; the reveal renders the cover and "Read the book" (calls
  `onReadStory`) and "Back to the shelf" (calls `onClose`); the failed state renders
  the reason, "Try again", and "Remove"; `Esc` calls `onClose`; focus is moved in on
  open and restored on close.
- `Dashboard`: the "Watch it print" control opens the Press Room overlay for the
  live row; "Try again" calls `retryStory` and optimistically flips the row to
  generating; the experience stays non-blocking (no blocking overlay on submit).

Pipeline and db (`trigger/src/lib/__tests__`):

- The pipeline emits the canonical progress values in order, including
  `{phase:'illustrating', page, total}` with `page` ramping from 0 to `total`.
- `db.updateProgress` writes `{ progress }` to the row; `finalize` sets `ready`
  without a percent field.

Edge Functions (`supabase/functions`):

- `create-story`: the insert uses `progress: { phase: 'queued' }`.
- `retry-story` (new): rejects without a JWT (401); rejects a non-owner or a
  non-failed row (4xx); on a valid failed row, resets the row and re-triggers the
  task and returns `{ storyId }`; rolls the row back to `failed` on a trigger
  failure.

Verification gate: `npm --prefix apex run lint`, `npm --prefix apex run build`, and
`npm --prefix apex run test:run`, plus the `trigger` test suite and the
`create-story` / `retry-story` Deno tests, all pass. Drive the real progress states
with a throwaway preview entry (a `preview.html` plus a small `preview.tsx` that
mounts `StoryCard` and `PressRoom` with mock `StoryRecord`s across statuses and
`progress` phases, including illustrating at several `page`/`total` values, binding,
the generating-to-ready reveal, and failed). The preview must `import './index.css'`
so the `--apex-*` tokens resolve. Screenshot via the `playwright-cli` skill across
states (setting the press, the Press Bed at a few counts, binding, the reveal,
failed, mobile single-column, and reduced motion), confirm zero console errors, then
delete the preview files (never commit them). No em dashes in any copy or doc
(verify with `grep`).

## Deferred (tracked for a future session)

- Storage cleanup on delete and on retry (the existing deferral stands; retry
  reuses existing objects rather than orphaning them, so it does not add cleanup
  debt).
- Surfacing per-page art live in the Press Bed (the plates are abstract by design;
  exposing per-page Storage paths mid-flight is a larger backend change and is not
  needed for the experience).
- The two-accent per-combatant color system remains an option to revisit later.
