# Hand-off: Apex Redesign, Surface 3 (the Book Reader)

## How to use this document

You are picking up an in-progress, clean-room redesign of the `apex/` web app.
Surfaces 1 (sign-in) and 2 (dashboard) are done and merged. Your job is
**surface 3: the book reader** (`BookViewer`), the full-screen view that opens
when a reader taps a story on the shelf.

Start with the **brainstorming skill** (process first). Do not jump to code.
The reader is the literal payoff of the whole "the app is a book" concept, so
explore intent and lock a direction with the user before building. The visual
companion (browser mockups) has worked very well for look-and-feel decisions in
both prior sessions; offer it again (as its own message), and use the terminal
for conceptual or scope questions. Once a design is approved, write a spec to
`docs/specs/`, run the spec self-review, get user approval, then write a plan to
`docs/plans/` with the writing-plans skill, and build it with
subagent-driven-development (fresh implementer per task plus two-stage review:
spec compliance, then code quality). Screenshot the real running UI to verify,
then finish the branch.

Read these before asking your first question:
- `docs/specs/2026-06-15-apex-login-redesign.md` (the design system, full rationale)
- `docs/specs/2026-06-15-dashboard-bookshelf.md` (surface 2 spec, same house style)
- `apex/src/components/book/BookViewer.tsx`, `BookViewer.css`, and
  `BookViewer.test.tsx` (what you are redesigning)
- `apex/src/components/dashboard/` (Masthead, MatchupComposer, StoryCard,
  Dashboard.tsx, Dashboard.css) as a reference for how an Apex surface is built

## Project in one paragraph

`apex/` is a React 18 + Vite single-page app that generates illustrated
"Who Would Win?" storybooks: a user names two things and the app generates an
illustrated showdown server-side (Supabase + Trigger.dev). Logged-out users see
the sign-in page; logged-in users see the dashboard (a "Reading Room" shelf plus
a title-page composer) and can open any ready story in a full-screen book
reader. The reader is the last major surface still wearing the old look.

## What was completed (surfaces 1 and 2)

- **Surface 1 (sign-in):** rebuilt as the app's "storybook title page" and
  established the Apex design language. Merged to `main`.
- **Surface 2 (dashboard):** rebuilt as the "Reading Room": a clean gallery of
  face-out covers (shelf as hero), a title-page composer that opens in a focused
  overlay from a masthead "Begin a new matchup" stamp (and renders inline as the
  empty state), a masthead account menu that owns sign-out, status-native cards
  (an animated "on the press" generating state, ready, failed), and search plus
  sort. Built test-first via subagent-driven development with per-task and final
  reviews. Merged to `main` and pushed to `origin`; branch
  `redesign/apex-dashboard` deleted. As of 2026-06-16 `main` is in sync with
  `origin/main`.

## The Apex design system (already established, reuse it)

Defined as `--apex-*` CSS variables in `apex/src/index.css`. Full rationale in
the login spec. Summary:

- **Palette:** Daylight Paper ivory (`--apex-paper-hi #FBF5E6`,
  `--apex-paper #F2E7CE`, `--apex-paper-lo #ECDFC0`, `--apex-surface #FDFAF1`),
  Ink text (`--apex-ink #2A2018`, `--apex-ink-soft`, `--apex-brown`,
  `--apex-brown-mute`), Forest Green accent (`--apex-forest #3E6B4A`,
  `--apex-forest-deep`, `--apex-on-forest`), Gilt and rules (`--apex-gilt
  #C7A23E`, `--apex-rule`, `--apex-field-border`), feedback (`--apex-error
  #A23B2A`, `--apex-focus`).
- **Type:** `--apex-font-display` Fraunces (display headings), `--apex-font-serif`
  Newsreader (italic literary asides), `--apex-font-ui` Hanken Grotesk (form
  controls, labels, body UI).
- **Primitives (reuse, do not reinvent):** `.apex-field`, `.apex-btn`,
  `.apex-btn--ghost`, `.apex-emblem` (the gilt "&" mark), `.apex-divider`, and
  the `.rr-sr-only` visually-hidden label utility (added this session to
  `index.css`).
- **Atmosphere:** warm paper radial gradient, faint paper grain, gilt rules,
  gentle staggered entrance, all motion gated behind
  `@media (prefers-reduced-motion: no-preference)`.
- **Brand:** the mark is an ampersand "&" meaning "this & that" (the matchup).
  The kicker phrase is "An Apex Publication."

## Hard constraints and preferences (carry these forward)

- **No em dashes** anywhere in copy, UI text, or docs. Use commas, parentheses,
  colons, or restructure. Verify before committing prose.
- **Clean room.** No remnants of the old GitHub-dark coral/purple/dark look in
  the redesigned reader.
- **Free to redo the interaction model.** The user has invited this on every
  surface. The current page-flip is a starting point, not a fixed spec.
- **No Tailwind.** Plain CSS plus the `--apex-*` variables, per-component CSS
  files (the dashboard used one `Dashboard.css` for its component cluster; the
  reader can follow the same one-stylesheet-per-surface pattern).
- **Incremental, non-breaking migration.** See the token note below.
- **Accessibility:** labeled controls, visible focus rings, sufficient contrast,
  honor reduced motion. The composer overlay this session added a focus trap and
  focus restore; a full-screen reader has similar concerns (focus management,
  keyboard nav, an escape route).

## Current state of the reader (what you are redesigning)

`apex/src/components/book/BookViewer.tsx` is a full-screen reader built on the
third-party `react-pageflip` (`HTMLFlipBook`) library. It:

- Receives `{ storyId, onClose }`. It is lazy-loaded in `App.tsx` via
  `React.lazy` + `Suspense` (fallback text "Loading book..."), rendered when a
  dashboard cover is opened via `onReadStory(storyId)`; `onClose` returns to the
  dashboard.
- Loads the story with `CatalogService.getStory(storyId)` and reads
  `record.manifest` (an `IStoryManifest`). It batch-resolves signed URLs for the
  cover and every page image via `CatalogService.resolveSignedUrls`.
- Renders, as flip-book pages: a **front cover** (cover image plus "Who Would
  Win?" and `animalA.commonName` vs `animalB.commonName`), **pages 1 to 32**
  (each: title on left pages, a generated image or a `visualPrompt` placeholder,
  `bodyText`, an optional fun-fact box, a page number), a **Predictions
  Checklist** page (trait rows with a CheckCircle marking each animal's
  advantage), and a **back cover** reading "The End."
- Flips on Left/Right arrow keys and on prev/next nav arrows; a "Back to Library"
  button calls `onClose`. Shows a "Loading book..." state until the manifest
  loads.

**Notable gap and opportunity:** the manifest carries `outcome` (`winnerId`,
`logicalReasoning`, `isSurpriseEnding`, `endingType`) but the current reader
never surfaces it. There is no climactic "who won and why" reveal; the book just
ends with "The End." The dashboard deliberately keeps the winner a spoiler
behind a "Reveal winner" toggle, so the reader is the natural place to stage the
result. Worth designing the payoff with the user.

## Story data model (the reader's content)

`IStoryManifest` (see `apex/src/types/story.types.ts`): `metadata` (title, etc.),
`animalA`/`animalB` (`IAnimalEntity`: `commonName`, `scientificName`, `stats`
weight/length/speed/weaponry/armor/brainSize, `habitat`), `coverImageUrl`,
`pages` (`IPageContent[]`, ideally 32: `index`, `title`, `bodyText`,
`visualPrompt`, `imageUrl?`, `funFact?`, `isLeftPage`), `checklist`
(`items: { traitName, animalAAdvantage, animalBAdvantage }[]`), `outcome`
(`winnerId`, `logicalReasoning`, `isSurpriseEnding`, `endingType` which is one of
`Standard Victory | External Event | Trait-Based Retreat | The Bigger Fish |
Mutual Neutrality`), and optional `visualAnchor`. Image fields are Supabase
Storage paths resolved to signed URLs at view time, not raw URLs.

## Behavioral contract (treat as a contract, evolve intentionally under TDD)

`BookViewer.test.tsx` is thorough; it mocks `react-pageflip`, `CatalogService`
(`getStory`, `resolveSignedUrls`), and the CSS import. It covers: the loading
state; the front cover (title, animal names, cover image with `loading="lazy"`
and `decoding="async"`, and the no-cover case); pages (all bodyText renders,
titles on left pages, generated image from signed URL vs the `visualPrompt`
placeholder, the fun-fact box present/absent); the checklist (trait rows, animal
names in the header); navigation (arrow keys call flipPrev/flipNext, the close
button calls `onClose`, keydown listener cleaned up on unmount); and the back
cover. Preserve the service-call contract (`getStory`, `resolveSignedUrls`) and
the `onClose` and lazy-image behavior; rewrite the UI-shape assertions
deliberately as the design changes, do not silently break them.

## Token and dependency migration

- The reader is the **last surface on the legacy tokens**. `BookViewer.tsx` and
  `BookViewer.css` still reference: `--accent-color`, `--accent-hover`,
  `--bg-color`, `--bg-card`, `--border-color`, `--border-focus`, `--radius`,
  `--shadow-sm`, `--shadow-lg`, `--text-primary`, `--text-secondary`,
  `--transition`, `--vs-color` (and a couple of inline `color="var(--accent-color)"`
  refs in the TSX). Note: the CSS also references `--shadow-md`, which is **not
  defined** in `index.css` (only `--shadow-sm` and `--shadow-lg` exist), a
  latent bug to clean up while migrating.
- Once the reader moves onto `--apex-*`, you can delete the remaining legacy
  `:root` tokens in `index.css`, drop the `Outfit` Google Fonts link in
  `apex/index.html`, and update the `body { font-family }` default (Outfit was
  kept only for the legacy surfaces). Verify each token is unreferenced with a
  grep across `apex/src` before deleting. `apex/src/App.css` holds unused Vite
  starter styles (`.logo`, `.card`, `.read-the-docs`); confirm and remove if dead.
- Decide with the user whether to **keep `react-pageflip`** (skeuomorphic page
  curl), replace it with a calmer Apex spread or scroll, or rethink the model
  entirely. If kept, remember it is mocked in tests. If replaced, remove the
  dependency.

## Surface 3 goal: the book reader

The login set up the title page and the dashboard set up the shelf; the reader is
where the reader actually reads the book they conjured. This is a vision to
brainstorm and refine, not a finished spec. Things worth deciding together:

- The reading model and page/spread layout (page-flip vs Apex spread vs scroll),
  on paper-stock backgrounds with the Apex type.
- The cover / title-page treatment (reuse the title-page motif from sign-in).
- Per-page composition of illustration plus narration, and the fun-fact and
  page-number treatments.
- The **outcome reveal**: how and when the winner, the reasoning, and the
  ending type (including the surprise-ending case) are staged as a climax.
- The trait checklist redesign.
- Chrome: the close/back control, a page or progress indicator, and the loading
  state.
- Responsiveness (it must work down to phone widths) and reduced motion (any
  page-turn animation must be gated and degrade to no animation).

## Suggested workflow (this worked well the last two sessions)

1. **Brainstorming skill first.** Explore context, then ask questions one at a
   time. Offer the visual companion (its own message); use the browser for
   look-and-feel and the terminal for conceptual or scope questions.
2. **Lock direction with mockups** before writing code.
3. **Write the spec** to `docs/specs/YYYY-MM-DD-book-reader.md`, run the spec
   self-review, get user approval. Match the existing spec style, no em dashes.
4. **Write the plan** with the writing-plans skill to
   `docs/plans/YYYY-MM-DD-book-reader.md`: bite-sized TDD tasks with exact code,
   no placeholders, frequent commits.
5. **Execute with subagent-driven-development:** a fresh implementer subagent per
   task, then a spec-compliance review, then a code-quality review, with fix
   loops; a final holistic review after the last task.
6. **Verify for real:** run `npm --prefix apex run lint`, `build`, and
   `test:run`. Driving the real reader needs a ready story with a manifest, and
   the dashboard is behind Supabase auth that cannot be automated headlessly, so
   the approach that worked was a throwaway preview entry (a `preview.html` plus
   a small `preview.tsx`) that mounts the real component(s) with a mock manifest
   and mocked `CatalogService`, screenshot via the `playwright-cli` skill across
   states (loading, cover, a spread, the outcome reveal, mobile, reduced motion),
   then delete the preview files (never commit them). Confirm zero console
   errors.
7. **Finish the branch** with the finishing-a-development-branch skill. Note:
   `main` has GitHub branch protection that expects pull requests; pushing
   straight to `main` works for this account but a PR is the cleaner path.

## Pointers

- Design system / login spec: `docs/specs/2026-06-15-apex-login-redesign.md`
- Dashboard spec and plan: `docs/specs/2026-06-15-dashboard-bookshelf.md`,
  `docs/plans/2026-06-15-dashboard-bookshelf.md`
- Reference surfaces: `apex/src/components/auth/SignIn.tsx` + `SignIn.css`;
  `apex/src/components/dashboard/*`
- Reader to redesign: `apex/src/components/book/BookViewer.tsx`, `BookViewer.css`,
  `BookViewer.test.tsx`
- Tokens and primitives: `apex/src/index.css`
- Run the app: `npm --prefix apex run dev` (needs `apex/.env`, which exists)
- Project memory: `apex-redesign`, `no-em-dashes`
