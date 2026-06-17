# Hand-off: Apex Redesign, Surface 4 (the Generation Progress Experience)

## How to use this document

You are picking up an in-progress, clean-room redesign of the `apex/` web app.
Surfaces 1 (sign-in), 2 (dashboard), and 3 (the book reader) are done and merged
to `main`. Your job is **surface 4: the generation progress experience**, what a
reader sees and feels while a book they conjured is being generated.

Start with the **brainstorming skill** (process first). Do not jump to code. This
surface is thinner today than the others (it is currently just one state on a
dashboard card), so the first job is to decide *what the experience should be*,
not just restyle what exists. Explore intent and lock a direction with the user
before building. The visual companion (browser mockups) has worked very well for
look-and-feel decisions in all three prior sessions; offer it again (as its own
message), and use the terminal for conceptual or scope questions. Once a design is
approved, write a spec to `docs/specs/`, run the spec self-review, get user
approval, then write a plan to `docs/plans/` with the writing-plans skill, and
build it with subagent-driven-development (fresh implementer per task plus
two-stage review: spec compliance, then code quality). Screenshot the real running
UI to verify, then finish the branch.

Read these before asking your first question:
- `docs/specs/2026-06-15-apex-login-redesign.md` (the design system, full rationale)
- `docs/specs/2026-06-15-dashboard-bookshelf.md` (surface 2; defines the current
  generating "on the press" card and the non-blocking generation model)
- `docs/specs/2026-06-16-book-reader.md` (surface 3; the latest house style, the
  theme-seam pattern, and the in-scope-into-`trigger/` precedent)
- `apex/src/components/dashboard/StoryCard.tsx` and the `rr-card--generating`
  / `rr-press*` rules in `apex/src/components/dashboard/Dashboard.css` (the current
  progress UI you are redesigning)
- `apex/src/components/dashboard/Dashboard.tsx` (the Realtime subscription and the
  non-blocking `createStory` flow)
- `trigger/src/lib/pipeline.ts` (where the progress steps are emitted)

## Project in one paragraph

`apex/` is a React 18 + Vite single-page app that generates illustrated
"Who Would Win?" storybooks: a user names two things and the app generates an
illustrated showdown server-side (Supabase + Trigger.dev). Logged-out users see
the sign-in page; logged-in users see the dashboard (a "Reading Room" shelf plus a
title-page composer) and can open any ready story in a full-screen book reader.
Generation runs server-side and reports progress that the dashboard watches live.
The moment between "Conjure the book" and "the book is ready to read" is the last
major experience still wearing a minimal first-pass treatment.

## What was completed (surfaces 1 to 3)

- **Surface 1 (sign-in):** rebuilt as the app's "storybook title page" and
  established the Apex design language. Merged.
- **Surface 2 (dashboard):** rebuilt as the "Reading Room": a clean gallery of
  face-out covers, a title-page composer overlay, a masthead account menu, and
  status-native cards including the generating "on the press" treatment. Crucially,
  this pass **removed the old full-screen blocking generation overlay**: generation
  is now non-blocking and watched on the shelf via Realtime. Merged.
- **Surface 3 (book reader):** rebuilt as the "Naturalist's Journal" (a responsive
  two-page spread behind a `reader--journal` theme seam, with a break-the-seal
  Verdict climax), and slimmed the generator from 12 aspects to 6 chapters with
  crop-safe portrait page images. This pass also removed the last legacy `:root`
  tokens, the Outfit font, and `react-pageflip`. Merged to `main` and pushed to
  `origin`. As of 2026-06-16 `main` is in sync with `origin/main`. Spec:
  `docs/specs/2026-06-16-book-reader.md`; plan: `docs/plans/2026-06-16-book-reader.md`.

## The Apex design system (already established, reuse it)

Defined as `--apex-*` CSS variables in `apex/src/index.css`. Full rationale in the
login spec. Summary:

- **Palette:** Daylight Paper ivory (`--apex-paper-hi #FBF5E6`, `--apex-paper`,
  `--apex-paper-lo`, `--apex-surface`), Ink text (`--apex-ink #2A2018`,
  `--apex-ink-soft`, `--apex-brown`, `--apex-brown-mute`), Forest Green accent
  (`--apex-forest #3E6B4A`, `--apex-forest-deep`, `--apex-on-forest`), Gilt and
  rules (`--apex-gilt #C7A23E`, `--apex-rule`, `--apex-field-border`), feedback
  (`--apex-error #A23B2A` clay red, `--apex-focus`).
- **Type:** `--apex-font-display` Fraunces (display), `--apex-font-serif`
  Newsreader (italic literary asides), `--apex-font-ui` Hanken Grotesk (UI/body).
- **Primitives (reuse):** `.apex-field`, `.apex-btn`, `.apex-btn--ghost`,
  `.apex-emblem` (the gilt "&" mark), `.apex-divider`, and the `.rr-sr-only`
  visually-hidden utility.
- **Atmosphere:** warm paper radial gradient, faint paper grain, gilt rules,
  gentle staggered entrance, all motion gated behind
  `@media (prefers-reduced-motion: no-preference)`.
- **Brand:** the mark is an ampersand "&" meaning "this & that" (the matchup). The
  kicker phrase is "An Apex Publication." The reader frames generation as a book
  being **printed / pressed** ("on the press", a gilt sweep).

## Hard constraints and preferences (carry these forward)

- **No em dashes** anywhere in copy, UI text, or docs. Use commas, parentheses,
  colons, or restructure. Verify with `grep` before committing prose. (Note: the
  generator's existing LLM prompt strings in `trigger/src/lib/llm.ts` still contain
  pre-existing em dashes; they are internal prompt text, out of scope so far, but
  if you touch that copy, clean it.)
- **Clean room.** No remnants of the old GitHub-dark coral/purple/dark look.
- **Free to redo the interaction model.** The user has invited this on every
  surface. The current on-the-press card is a starting point, not a fixed spec.
- **No Tailwind.** Plain CSS plus the `--apex-*` variables, per-component CSS files.
- **Incremental, non-breaking migration.** All surfaces are now on `--apex-*` and
  the legacy tokens are gone, so there is no token migration left.
- **Accessibility:** labeled controls, visible focus rings, sufficient contrast,
  honor reduced motion. Progress needs `role="progressbar"` semantics (the current
  card has them) and a polite live region if you announce step changes; gate the
  sweep/shimmer animations behind reduced motion.
- **Scope into `trigger/` is allowed when it serves the surface** (the reader pass
  set this precedent). If you reframe the progress *copy*, the step strings are
  emitted in `trigger/src/lib/pipeline.ts`; decide that scope explicitly with the
  user, as on the reader pass.

## Current state of the generation progress experience (what you are redesigning)

There is no dedicated progress screen. The entire current experience is **one
state of the dashboard `StoryCard`** (`apex/src/components/dashboard/StoryCard.tsx`,
the `story.status === 'generating'` branch), styled by the `rr-card--generating`
and `rr-press*` rules in `Dashboard.css`:

- The forming cover shows an animated ink-and-gilt **sweep** across a forest field
  with the gilt "&" mark, evoking a book on a printing press.
- A slim **progress track** (`rr-ptrack` / `rr-pbar`) reflects `progress_pct`
  (`role="progressbar"`, `aria-valuenow`), with the live `progress_step` beneath it
  (`rr-pstep`, falling back to a quiet "Working..."). A small "On the press"
  caption sits in the band. The meta shows the title and the date as "Just now".
  There is no Read action while generating.
- When a Realtime UPDATE flips the row to `ready`, the real cover **develops in**
  (a soft cross-fade, `rrDevelopIn`) and the ready actions appear.
- The composer (`MatchupComposer`) submits via `CatalogService.createStory` and
  closes immediately (non-blocking); the new `generating` row arrives on the shelf
  via Realtime, so the user is dropped back on the shelf watching the card, not on
  a dedicated "generating" screen.
- The **failed** state is a grayed cover with a small clay-red "!" mark, the line
  "This matchup did not come together." plus the underlying `error`, and only a
  Remove action.

## Generation data and progress model

`StoryRecord` (`apex/src/types/story.types.ts`): `status`
(`generating | ready | failed`), `progress_step` (string), `progress_pct`
(number), `error`, `animal_a`, `animal_b`, `title`, `cover_image_path`,
`manifest`, `created_at`. Image fields are Supabase Storage paths.

The pipeline (`trigger/src/lib/pipeline.ts`) reports progress via
`deps.db.updateProgress(storyId, step, pct)` at these milestones, in order:

- `Researching animal profiles...` (5%)
- `Designing animal illustrations...` (10%)
- `Simulating the showdown...` (15%)
- `Illustrating pages...` (25%)
- `Illustrating page {n} of {total}...` (per page image, ramping ~25% to ~95%;
  `total` is now ~14 after the reader pass)
- `Saving your story...` (98%)

Image generation dominates wall-clock time (each image is throttled), so the book
spends most of the wait in the "Illustrating page n of total" phase. The dashboard
receives these as live `UPDATE`s via
`CatalogService.subscribeToStories(userId, handler)` (Supabase Realtime), which the
`Dashboard.tsx` orchestrator reconciles by id (INSERT prepends, UPDATE replaces,
DELETE removes).

## Behavioral contract (preserve, evolve intentionally)

- **Non-blocking generation.** Do not reintroduce a full-screen blocking overlay
  that traps the user until the book is done, unless the user explicitly chooses
  that. Surface 2 deliberately removed it.
- The Realtime model: `subscribeToStories`, INSERT/UPDATE/DELETE reconciliation,
  `progress_step` / `progress_pct` driving the live UI.
- `createStory` stays non-blocking; the failed state still offers only Remove (no
  Retry today). The generating-to-ready cover cross-fade is a beat worth keeping or
  elevating.

## Surface 4 goal: the generation progress experience

This is a vision to brainstorm and refine, not a finished spec. The central
question is **what this experience should be**, since today it is minimal. Things
worth deciding together:

- **The concept and emotional target.** The brand frames generation as a book
  being printed/pressed/conjured. How magical and present should the wait feel?
  Quietly informative, or a small delightful "watch it being made" moment?
- **Where the experience lives.** Keep it entirely as the on-the-press shelf card
  (enhanced)? Add an optional focused "press room" / progress view the user can
  open from the generating card to watch one book come to life? Show progress at
  the moment of submit (a brief confirmation that it is on the press) before
  dropping back to the shelf? Stay non-blocking either way.
- **The progress narrative.** The current step strings are functional
  ("Illustrating page 7 of 14..."). Reframe the pipeline phases (research, design,
  simulate the showdown, illustrate, bind/save) as evocative, on-brand beats in the
  storybook voice. If you change the copy, decide whether to edit the strings in
  `trigger/src/lib/pipeline.ts` (in scope, with the user's nod) or map them to
  friendlier labels client-side.
- **The page-illustration phase** is the long pole; consider showing it
  meaningfully (for example a sense of pages accruing) rather than a single bar
  crawling for most of the wait.
- **The finish / reveal.** The generating-to-ready "develops in" cross-fade could
  become a more climactic "your book is ready" moment (a gilt seal, a chime of
  motion), with a clear call to read it.
- **The failed state**, redesigned in the Apex voice, and whether to introduce a
  Retry (today there is none; that may be a backend decision to scope or defer).
- **Accessibility:** keep the `progressbar` semantics; add a polite live region if
  step changes are announced; gate the sweep and any new motion behind reduced
  motion; ensure the failed `role="alert"` stays.
- **Responsiveness** down to phone widths, and reduced-motion fallbacks for every
  new animation.

Note the relationship to surface 2: the generating and failed treatments currently
live inside the dashboard `StoryCard`. Expect to evolve that card (and possibly
extract a focused progress view) rather than build an isolated screen. Keep the
shelf coherent.

## Suggested workflow (this worked well the last three sessions)

1. **Brainstorming skill first.** Explore context, then ask questions one at a
   time. Offer the visual companion (its own message); use the browser for
   look-and-feel and the terminal for conceptual or scope questions. Because this
   surface is thin today, spend early questions on *what the experience is* and
   *where it lives*, not just its styling.
2. **Lock direction with mockups** before writing code.
3. **Write the spec** to `docs/specs/YYYY-MM-DD-generation-progress.md`, run the
   spec self-review, get user approval. Match the existing spec style, no em dashes.
4. **Write the plan** with the writing-plans skill to
   `docs/plans/YYYY-MM-DD-generation-progress.md`: bite-sized TDD tasks with exact
   code, no placeholders, frequent commits.
5. **Execute with subagent-driven-development:** a fresh implementer per task, then
   a spec-compliance review, then a code-quality review, with fix loops; a final
   holistic review after the last task.
6. **Verify for real:** run `npm --prefix apex run lint`, `build`, and `test:run`
   (and the `trigger` suite if you touch the pipeline). Driving the live generating
   states needs a story row mid-generation, and the dashboard is behind Supabase
   auth that cannot be automated headlessly, so the approach that has worked is a
   throwaway preview entry (a `preview.html` plus a small `preview.tsx`) that mounts
   the real component(s) with mock `StoryRecord`s across statuses (generating at
   several `progress_pct`/`progress_step` values, the generating-to-ready
   transition, failed), screenshot via the `playwright-cli` skill across states
   (including mobile and reduced motion), then delete the preview files (never
   commit them). Confirm zero console errors. Remember the preview must
   `import './index.css'` so the `--apex-*` tokens resolve.
7. **Finish the branch** with the finishing-a-development-branch skill. `main` has
   GitHub branch protection that expects pull requests; pushing straight to `main`
   works for this account (it bypasses the rule) but a PR is the cleaner path.

## Pointers

- Design system / specs: `docs/specs/2026-06-15-apex-login-redesign.md`,
  `docs/specs/2026-06-15-dashboard-bookshelf.md`, `docs/specs/2026-06-16-book-reader.md`
  (plans alongside in `docs/plans/`).
- Current progress UI: `apex/src/components/dashboard/StoryCard.tsx` (the
  `generating` and `failed` branches) and the `rr-card--generating` / `rr-press*` /
  `rr-failed` / `rrDevelopIn` / `rrSweep` rules in
  `apex/src/components/dashboard/Dashboard.css`.
- Live updates: `apex/src/components/dashboard/Dashboard.tsx` (the
  `subscribeToStories` effect and the `createStory` handler) and
  `apex/src/services/CatalogService.ts`.
- Progress emission: `trigger/src/lib/pipeline.ts` (the `updateProgress`
  milestones) and the `db.updateProgress` adapter in `trigger/src/lib/db.ts`.
- Data model: `apex/src/types/story.types.ts` (`StoryRecord`).
- Run the app: `npm --prefix apex run dev` (needs `apex/.env`, which exists).
- Project memory: `apex-redesign` (overall state and what is done/pending),
  `no-em-dashes`, `reader-deferred-themes` (deferred reader looks, unrelated to
  this surface but part of the same redesign).
