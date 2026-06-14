# Foundation Slice — Server-Side Generation & Durable Persistence

## Goal

Re-platform story generation so it runs server-side and survives the browser
closing, and replace per-browser IndexedDB storage with a durable, multi-user
backend. After this slice, a logged-in user can start one or more story
generations, navigate away or close the tab, browse their existing library while
work continues, and return to find completed books — all persisted in a real
database with images in object storage. This is the foundation every later slice
(pods, usage dashboards, mobile) builds on.

## Context (current state)

The app today is two pieces:

- **`apex/`** — a React 18 + Vite single-page app. `StoryGeneratorService`
  orchestrates the entire generation pipeline **in the browser**, calling
  `LlmService` and `ImageService`, and persists finished `IStoryManifest`
  objects to **IndexedDB** via `StorageService` (`localforage`). Images are
  stored as base64 data URIs inside the manifest. There is no auth and no shared
  or cross-device catalog — the library is whatever lives in that one browser.
- **`server/`** — a Bun + Elysia HTTP proxy. It is stateless: a provider
  registry (`server/src/registry.ts`) plus adapters
  (`server/src/providers/*` for Gemini / OpenAI / Anthropic LLM and image)
  exposed over `/api/llm`, `/api/image`, `/api/providers`. It holds the provider
  API keys and forwards calls. It has no database and no concept of users.

Because orchestration runs client-side, you cannot browse while generating, you
cannot generate on one device and read on another, and there is no way to track
who generated what or what it cost.

## Scope

### In scope

- Move the full generation pipeline into a **durable Trigger.dev task** that
  runs server-side with checkpointed steps.
- Persist the catalog to **Supabase Postgres** and images to **Supabase
  Storage**; remove IndexedDB as the system of record.
- Add **minimal Supabase Auth** so every story has a real owner and row-level
  security is correct from day one.
- Add a **Supabase Edge Function** that authorizes a user, creates the story
  row, and triggers the generation task.
- Refactor the **web client** to: authenticate, trigger generation, read its
  catalog from Postgres, watch generation progress live, and render books from
  Storage.
- **Retire the Elysia proxy**; relocate the provider adapters into the
  Trigger.dev task.
- Add a **static web host** (Vercel by default) that serves the built SPA.

### Goals delivered

- **Goal 5 (durable persistence)** — Postgres + Storage replace IndexedDB.
- **Goals 1 & 2 (async + parallel generation)** — generation is a background
  task; each story is an independent run, so parallelism is free.
- **Foundational half of Goal 3 (login)** — minimal auth + per-user catalogs via
  RLS. (Richer auth/profile features remain a later concern.)

### Deferred (own later slices)

- **Pods / shared catalogs (Goal 8)** — no `pod_id`, no shared read policies
  yet. The schema should not preclude adding them.
- **Per-user spend dashboard (Goal 4)** — not built here, but generation
  provider calls are tagged with the owner's `userId` using the providers'
  native request-metadata fields (OpenAI `user`, Anthropic `metadata.user_id`)
  so the data exists to aggregate later. A dedicated AI gateway (e.g.
  Helicone / Portkey) for richer per-user cost analytics is part of the spend
  slice, not this one.
- **Mobile client (Goal 7)** — web only. The backend it would consume
  (Supabase + the Edge Function + Trigger.dev) is established here.

### Non-goals (explicitly not in this slice)

- Offline reading / IndexedDB as an offline cache. IndexedDB persistence is
  removed, not repurposed.
- The advanced in-UI provider/model picker (`AiConfigContext` + Dashboard
  advanced options). Model selection moves server-side with fixed defaults
  (below); the picker is removed or stubbed for this slice.
- Cost-optimized per-call model routing as a shipped feature. The task is built
  so models are configurable per call, but a documented default is used; tuning
  is a follow-up.
- Any change to the book content/structure, the 26-page format, art-style
  controls, or surprise-ending logic. The pipeline is **ported**, not redesigned.

## Platform decisions (settled)

| Concern | Choice |
|---|---|
| Database, auth, object storage, catalog API | **Supabase** (Postgres + Auth + Storage + PostgREST + Edge Functions) |
| Durable background generation | **Trigger.dev** (cloud, runs the task compute) |
| Static web hosting for the SPA | **Vercel** (default; swappable — no lock-in) |
| Text model | **Opus 4.6** (`claude-opus-4-6`) via the Anthropic adapter, adaptive thinking |
| Image model | **gpt-image-2** via the OpenAI adapter, quality pinned (default `medium`) |
| Per-user spend tracking (data only) | Tag provider calls with `userId` for later aggregation |

Rationale for the platform choice is recorded in the brainstorming discussion
that produced this spec; in short: Postgres + RLS make per-user and (later)
pod-scoped catalogs nearly declarative, Trigger.dev runs the generation compute
and streams progress, and the stack is the most portable of the options weighed.

## Target architecture

Four hosting tiers, each with one job:

| Tier | Responsibility | Holds provider/secret keys? |
|---|---|---|
| **Static host** (Vercel) | Serve the built SPA's static files via CDN | No |
| **Supabase** | Auth, Postgres catalog, Storage images, the `create-story` Edge Function | Service-role key (server-side only) |
| **Trigger.dev** | Run the durable `generateStory` task | OpenAI + Anthropic keys live here |
| **Browser (loaded SPA)** | Calls the three above with scoped tokens | No |

Request flow:

```
Web client (apex, React)
  1. auth ───────────────────────────▶ Supabase Auth
  2. POST create-story ──────────────▶ Supabase Edge Function
         (verify JWT, insert stories row, trigger task)
         ◀──────────── { storyId } ────┘
  3. read catalog (supabase-js → PostgREST + RLS) ──▶ Supabase Postgres
  4. watch progress (Supabase Realtime on stories row) ──▶ Supabase Postgres
  5. render book images (signed URLs) ──▶ Supabase Storage

Trigger.dev  generateStory task (durable, checkpointed steps)
  - holds OpenAI + Anthropic keys; uses the relocated provider adapters
  - writes images → Supabase Storage, progress + manifest + status → Postgres
```

Key property: each pipeline step is a checkpointed `step.run()`, so a failure
mid-pipeline resumes from the last successful step rather than re-paying for the
whole book (a meaningful cost at ~$1.50–4 of provider spend per book).

## Data model

### `stories` table

Structured columns drive the catalog/library; the full manifest is JSONB with
**Storage paths instead of base64 image data**.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `owner_id` | `uuid` | references `auth.users`, not null |
| `status` | `text` | `generating` \| `ready` \| `failed` |
| `animal_a` | `text` | |
| `animal_b` | `text` | |
| `title` | `text` | nullable until known |
| `art_style` | `text` | mirrors `StoryGeneratorOptions.artStyle` |
| `fierce_mode` | `boolean` | |
| `cover_image_path` | `text` | Storage path, nullable until generated |
| `manifest` | `jsonb` | full `IStoryManifest`, image fields hold Storage paths |
| `progress_step` | `text` | human-readable current step |
| `progress_pct` | `int` | 0–100 |
| `error` | `text` | populated on `failed` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | maintained by trigger or task |

Reserve room for `pod_id uuid` in a later slice; do not add it now.

### Row-level security

- Enable RLS on `stories`.
- Policies: an authenticated user may `select` / `insert` / `update` / `delete`
  only rows where `owner_id = auth.uid()`.
- The Edge Function and the Trigger.dev task act with elevated rights
  (service-role key) to insert/update on the user's behalf; user-facing reads go
  through PostgREST under RLS.

### Storage

- Private bucket `story-images`.
- Layout: `stories/{storyId}/cover.png`, `stories/{storyId}/{pageIndex}.png`.
- Storage RLS so only the owner can read their objects (pod read access added
  later). Client renders via short-lived **signed URLs**.

### Realtime

- Add `stories` to the Supabase Realtime publication so the client can subscribe
  to row changes (progress + status) for its own rows under RLS.

## Generation pipeline (durable task)

`generateStory({ storyId, animalA, animalB, options, generationConfig })`
re-implements the current `StoryGeneratorService` flow as resumable Trigger.dev
steps. Each step updates `progress_step` / `progress_pct` on the `stories` row.

1. **Profiles** — fetch both animal profiles (2 calls).
2. **Visual anchor** — canonical visual descriptions for consistent imagery.
3. **Outcome + narrative** — roll surprise-ending, then showdown/outcome and the
   12 aspects per animal (parallel, as today).
4. **Cover image** — gpt-image-2 → upload to Storage; set `cover_image_path`.
5. **Page images** — generate in batches within provider concurrency limits →
   upload each to Storage.
6. **Assemble & finalize** — build `IStoryManifest` with Storage paths, write it
   to `manifest`, set `title`, set `status = ready`.

On any unrecoverable error the task sets `status = failed` and `error`; completed
steps remain checkpointed so a retry does not repeat them.

`generationConfig` carries model + image-quality selection with defaults of
Opus 4.6 (adaptive thinking) for text and gpt-image-2 (`medium`) for images. The
task supports per-call model selection so aspect generation can later be routed
to a cheaper model without code changes; this slice ships the defaults.

Provider calls are tagged with `owner_id` using the providers' native
request-metadata fields (OpenAI `user`, Anthropic `metadata.user_id`) to enable
later per-user cost aggregation; a dedicated AI gateway is deferred to the spend
slice.

## Triggering & progress

- **`create-story` Edge Function** (Deno/TypeScript): verifies the caller's
  Supabase JWT, inserts a `stories` row (`status = generating`,
  `owner_id = auth.uid()`), triggers the Trigger.dev `generateStory` task with
  the new `storyId` and request parameters, and returns `{ storyId }`. It holds
  the Trigger.dev secret key and Supabase service-role key; neither reaches the
  browser.
- **Progress**: the client subscribes to its `stories` rows via **Supabase
  Realtime**. This single subscription covers in-progress `progress_step` /
  `progress_pct` updates, the final `ready`/`failed` transition, and new rows
  appearing in the library. (Trigger.dev's own run-level Realtime is a possible
  future enhancement for richer detail but is not required here.)

## Auth

- Enable **Supabase Auth** with at least one provider — Google OAuth and email
  magic link are the recommended starting set.
- The client gains a minimal sign-in view; the library and generation actions
  require a session.
- `auth.uid()` is the owner referenced by every `stories` row and every RLS
  policy.

## Configuration & secrets

| Secret | Location |
|---|---|
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Trigger.dev environment variables |
| Trigger.dev secret key | Supabase Edge Function env (to trigger the task) |
| Supabase service-role key | Supabase Edge Function env |
| Supabase anon key + project URL | Web client (public, RLS-protected) |

The existing `server/.env` provider keys move to Trigger.dev. Gemini keys may be
retained if the Gemini adapters are kept available, but the slice's defaults are
Opus 4.6 + gpt-image-2.

## Codebase changes

| Item | Disposition |
|---|---|
| `apex/src/services/StoryGeneratorService.ts` | **Move** orchestration into the Trigger.dev `generateStory` task |
| `apex/src/services/LlmService.ts`, `ImageService.ts` | **Replace** — provider-calling logic lives in the task; client versions removed |
| `apex/src/services/StorageService.ts` | **Replace** with Supabase catalog reads + Storage; IndexedDB removed |
| `apex/src/contexts/AiConfigContext.tsx` + Dashboard model picker | **Remove/stub** — model selection moves server-side with defaults |
| `apex/src/components/dashboard/Dashboard.tsx` | **Update** — trigger via Edge Function, render library from Supabase, show live progress |
| `apex/src/components/book/BookViewer.tsx` | **Update** — resolve Storage paths to signed URLs instead of consuming base64 |
| `apex/src/types/story.types.ts`, `artStyle.ts` | **Keep** — shared shape; image fields now hold Storage paths |
| `server/src/providers/*`, `server/src/registry.ts` | **Move** into the Trigger.dev task project |
| `server/src/index.ts`, `server/src/routes/*` (Elysia) | **Delete** after adapters are relocated |
| Supabase schema migrations, RLS policies, `story-images` bucket | **New** |
| `create-story` Edge Function | **New** |
| Trigger.dev project + `generateStory` task | **New** |
| Web client: Supabase client, Auth UI, Realtime subscription | **New** |
| Static-host (Vercel) config incl. SPA catch-all rewrite to `index.html` | **New** |

## Repository structure (target, indicative)

```
apex/        # web client (kept; refactored)
supabase/    # migrations, RLS policies, functions/create-story/, config
trigger/     # Trigger.dev project: generateStory task + relocated providers/
             #   (trigger.config.ts, package.json)
server/      # removed once providers are relocated
```

Exact layout (workspace vs. separate projects) is an implementation-plan detail.

## Risks & open questions

- **Provider concurrency limits** — gpt-image-2 image generation must be batched
  to respect OpenAI rate limits; the task must cap concurrent image calls
  (today's client chunks 4 at a time — preserve a similar bound).
- **Anthropic adapter update** — the existing adapter targets older usage; it
  must call `claude-opus-4-6` with adaptive thinking. Confirm the installed SDK
  version supports the required parameters.
- **Storage URL strategy** — signed URLs (with TTL) vs. authenticated reads for
  ~25 images per book; choose during planning, favoring signed URLs.
- **Realtime + RLS** — confirm `stories` is added to the Realtime publication and
  that change events are correctly filtered to the owner.
- **Cost control** — image quality is pinned to `medium` by default; revisit if
  output fidelity is insufficient. Re-running a failed book re-pays only for
  steps after the last checkpoint.

## Acceptance criteria

- A new user can sign in (Google or email magic link) and sees an empty library.
- Submitting a generation returns immediately; the new story appears in the
  library as `generating` with a live-updating progress indicator, and the user
  can navigate around the library while it runs.
- Closing the tab and reopening it later shows the same story either still
  `generating` or `ready` — generation does not depend on the tab staying open.
- Two generations started close together run concurrently as independent runs.
- A completed story persists in Postgres; its images are objects in the
  `story-images` Storage bucket (no base64 in the database); the book renders in
  `BookViewer` from Storage.
- A second browser/device, signed in as the same user, sees the same library.
- A user cannot read or modify another user's stories or images (RLS verified).
- The Elysia proxy is removed and no client code calls provider APIs directly.
- The built SPA is served by the static host, and deep links resolve via the
  SPA catch-all rewrite.
- Provider calls carry the owner's `userId` via native provider metadata
  (verified in provider dashboards/logs), establishing the data for later spend
  aggregation.
```
