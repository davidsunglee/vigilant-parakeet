# Hand-off: Apex Redesign, Surface 2 (Dashboard as Bookshelf)

## How to use this document

You are picking up an in-progress, clean-room redesign of the `apex/` web app.
Surface 1 (the sign-in page) is done. Your job is **surface 2: the dashboard,
reimagined as a "bookshelf."**

Start with the **brainstorming skill** (process first). Do not jump to code.
The dashboard redesign involves a real information-architecture rethink, so
explore intent and lock a direction with the user before building. The visual
companion (browser mockups) worked very well last session for look-and-feel
decisions; offer it again. Once a design is approved, write a spec to
`docs/specs/`, then build with test-driven development and the frontend-design
principles, screenshot the real running app to verify, and commit on a feature
branch.

Read these before asking your first question:
- `docs/specs/2026-06-15-apex-login-redesign.md` (the established design system)
- `apex/src/components/auth/SignIn.tsx` and `SignIn.css` (the reference surface)
- `apex/src/components/dashboard/Dashboard.tsx` and its tests (what you are
  redesigning)

## Project in one paragraph

`apex/` is a React 18 + Vite single-page app that generates illustrated
"Who Would Win?" style storybooks: a user names two things and the app generates
an illustrated showdown server-side (Supabase + Trigger.dev). Logged-out users
see the sign-in page; logged-in users see the dashboard (a generator form plus a
grid of their stories) and can open any story in a full-screen book reader.

## What was completed (surface 1: login)

The sign-in page was rebuilt as the app's "storybook title page" and established
the **Apex** design language. It is merged into `main` (the `redesign/apex-login`
branch has been deleted; as of this writing `main` is ahead of `origin/main`
locally and has not been pushed). Files: `apex/src/components/auth/SignIn.tsx`,
`SignIn.css`, plus
`apex/src/components/auth/SignIn.test.tsx` (6 tests, written first). Fonts and
the document title were updated in `apex/index.html`. The design tokens and
reusable primitives were added to `apex/src/index.css`.

## The Apex design system (already established, reuse it)

Defined as `--apex-*` CSS variables in `apex/src/index.css`. Full rationale in
the login spec. Summary:

- **Palette:** Daylight Paper ivory (`--apex-paper-hi #FBF5E6`,
  `--apex-paper #F2E7CE`, `--apex-paper-lo #ECDFC0`, `--apex-surface #FDFAF1`),
  Ink text (`--apex-ink #2A2018`, `--apex-ink-soft`, `--apex-brown`,
  `--apex-brown-mute`), Forest Green accent (`--apex-forest #3E6B4A`,
  `--apex-forest-deep #335A3E`, `--apex-on-forest`), Gilt and rules
  (`--apex-gilt #C7A23E`, `--apex-rule`, `--apex-field-border`), feedback
  (`--apex-error #A23B2A`, `--apex-focus`).
- **Type:** `--apex-font-display` Fraunces (display headings), `--apex-font-serif`
  Newsreader (italic literary asides only), `--apex-font-ui` Hanken Grotesk
  (all form controls, labels, body UI).
- **Primitives (reuse, do not reinvent):** `.apex-field`, `.apex-btn`,
  `.apex-btn--ghost`, `.apex-emblem` (the gilt "&" mark), `.apex-divider`.
- **Atmosphere:** warm paper gradient, faint paper grain, gilt double-rule frame,
  gentle staggered entrance, all motion gated behind
  `@media (prefers-reduced-motion: no-preference)`.
- **Brand:** the mark is an ampersand "&" meaning "this & that" (the matchup).
  The kicker phrase is "An Apex Publication." The login framed itself as a book's
  title page.

## Hard constraints and preferences (carry these forward)

- **No em dashes** anywhere in copy, UI text, or docs. Use commas, parentheses,
  colons, or restructure. Verify with `grep "—"` before committing prose.
- **Clean room.** No remnants of the old GitHub-dark coral/purple look in any
  redesigned surface.
- **Free to redo the IA and interaction model.** The user explicitly invited
  this. The "bookshelf" framing is a starting point, not a fixed spec.
- **No Tailwind.** Plain CSS plus the `--apex-*` CSS variables.
- **Incremental, non-breaking migration.** The `--apex-*` tokens live alongside
  the legacy tokens in `index.css`. When you migrate the dashboard, move it fully
  onto `--apex-*` and remove the legacy tokens/classes that only the dashboard
  used. Do not remove legacy tokens still referenced by the book reader
  (`BookViewer`), which is a later surface.
- **Accessibility:** labeled controls, visible focus rings, sufficient contrast,
  honor reduced motion.

## Current state of the codebase

- **Branch:** Surface 1 (login) is merged into `main`. Start surface 2 on a new
  branch off `main` (for example `redesign/apex-dashboard`). The tree is clean.
- **What you are redesigning:** `apex/src/components/dashboard/Dashboard.tsx`.
  Its styles currently live in the large global `apex/src/index.css` (classes
  like `.dashboard-container`, `.generator-section`, `.generator-form`,
  `.story-grid`, `.story-card`, `.generation-overlay`). Consider extracting
  dashboard styles into a `Dashboard.css` as part of the migration.
- **Behavior to preserve (or evolve deliberately):** the dashboard reads the
  signed-in user via `useAuth`, lists stories via `CatalogService.listStories`,
  subscribes to live updates via `CatalogService.subscribeToStories(userId,
  handler)` (Supabase Realtime), creates a story via
  `CatalogService.createStory({ animalA, animalB, artStyle, fierceMode })`
  (non-blocking, no full-screen overlay), resolves cover image URLs via
  `CatalogService.resolveSignedUrls`, and deletes via
  `CatalogService.deleteStory`. Reading a story calls the `onReadStory(storyId)`
  prop, which opens `BookViewer`.
- **Story data model:** each story has `status` of `generating | ready |
  failed`, plus `animal_a`, `animal_b`, `title`, `manifest`, `cover_image_path`,
  `progress_step`, `progress_pct`, `error`, and (when ready)
  `manifest.outcome.winnerId`. Generating rows show a progress bar and step;
  failed rows show an error and no Read button.
- **Generator inputs today:** two animal fields, an art-style select (Surprise
  Me, Watercolor, Colored Pencil Sketch, Storybook Painterly, Graphic Novel, 3D
  Animated), and a Fierce Mode toggle (default off).
- **Tests:** `Dashboard.test.tsx` is extensive (rendering, status-aware cards,
  realtime transitions, form submission, delete, art-style picker). Treat these
  as the behavioral contract. Under TDD, update them intentionally as the UI
  changes; do not silently break them.
- **Run the app:** `npm --prefix apex run dev` then open `http://localhost:5173/`
  (needs `apex/.env`, which exists). Sign in to reach the dashboard, or mock auth
  as the tests do.
- **Verify gate:** `npm --prefix apex run lint`, `npm --prefix apex run build`,
  `npm --prefix apex run test:run`. The repo root `npm run verify` runs the full
  pipeline (apex plus trigger and supabase tests).

## Surface 2 goal: the dashboard as a bookshelf

The login set up the idea that "the app is a book." The dashboard is the chance
to make the logged-in experience feel like a **library or bookshelf of the
matchups the user has created**, with composing a new matchup framed as starting
a new book. This is a vision to brainstorm and refine with the user, not a
finished spec. Things worth deciding together:

- The shelf/library metaphor: how stories are arranged (spines, covers, a real
  shelf), browsing, sorting, empty state.
- The "compose a new matchup" experience: where it lives and how it feels (the
  two combatants, art style, fierce mode), and how it relates to the shelf.
- Status-native treatments for `generating` (a book being printed or bound, with
  live progress), `ready`, and `failed` stories.
- Account chrome: the current sign-out is a bare inline button in `App.tsx`;
  redesign it to fit.
- Responsive behavior and the same accessibility and reduced-motion standards.

## Suggested workflow (this worked well last session)

1. **Brainstorming skill first.** Explore context, then ask questions one at a
   time. Offer the visual companion (its own message) for the look-and-feel
   decisions; use the terminal for conceptual or scope questions.
2. **Lock direction with mockups** before writing any code.
3. **Write the spec** to `docs/specs/YYYY-MM-DD-dashboard-bookshelf.md`, run the
   spec self-review, get user approval. Match the existing spec style and avoid
   em dashes.
4. **TDD:** write component tests first, watch them fail, implement minimally.
5. **Build to the design** using the `--apex-*` system and frontend-design
   principles.
6. **Verify for real:** run lint/build/test, then drive the running app with the
   `playwright-cli` skill and screenshot each state (empty, generating, ready,
   failed, the composer, mobile). Confirm zero console errors.
7. **Commit on the feature branch** only after verification passes.

## Pointers

- Login spec / design system: `docs/specs/2026-06-15-apex-login-redesign.md`
- Reference surface: `apex/src/components/auth/SignIn.tsx`, `SignIn.css`
- Project memory: `no-em-dashes`, `apex-redesign` (in this project's memory dir)
