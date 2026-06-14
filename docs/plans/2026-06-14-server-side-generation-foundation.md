# Plan — Foundation Slice: Server-Side Generation & Durable Persistence

**Spec:** `docs/specs/2026-06-14-server-side-generation-foundation.md`

## Goal

Re-platform story generation so it runs server-side (Trigger.dev) and survives the
browser closing, and replace per-browser IndexedDB with a durable, multi-user
backend (Supabase Postgres + Storage + Auth). A logged-in user starts one or more
generations, navigates away or closes the tab while work continues server-side,
browses their existing library, and returns to completed books — all persisted in
Postgres with images in object storage and scoped per-user by row-level security.
This is the foundation every later slice (pods, spend dashboards, mobile) builds on.

## Architecture summary

Four hosting tiers, each with one job (per the spec's target architecture):

- **Static host (Vercel)** serves the built `apex/` SPA. Holds no secrets.
- **Supabase** provides Auth (Google OAuth + email magic link), the Postgres
  `stories` catalog (RLS-scoped to `owner_id = auth.uid()`), the private
  `story-images` Storage bucket, Realtime on `stories`, and the `create-story`
  Edge Function. Holds the service-role key (server-side only).
- **Trigger.dev** runs the durable `generate-story` task (the relocated
  `StoryGeneratorService` pipeline + provider adapters). Holds the OpenAI +
  Anthropic keys.
- **Browser (SPA)** authenticates, invokes `create-story` (returns `{ storyId }`
  immediately), reads its catalog from PostgREST under RLS, watches progress via
  Supabase Realtime, and renders books from short-lived signed Storage URLs.

Request flow: client → `create-story` Edge Function (verify JWT, insert `stories`
row with `status='generating'`, trigger the Trigger.dev task, return `{ storyId }`)
→ the task generates server-side, uploading images to Storage and writing
`progress_step`/`progress_pct`/`manifest`/`status` to the `stories` row → the
client's Realtime subscription reflects live progress and the final
`ready`/`failed` transition.

**Cost-resumption mechanism (important deviation — see Risk Assessment):**
Trigger.dev v4 retries re-invoke the task's `run` from the top; it has no
Inngest-style `step.run()` memoization. The spec's "resume from the last
checkpoint rather than re-paying for the whole book" is delivered via **idempotent
checkpoint persistence + skip-if-exists**: narrative phases persist their output to
the `stories.manifest` JSONB and are skipped on re-run if already present; each
image checks Storage for its object and is skipped if it already exists. This
faithfully delivers the spec's cost intent without the memoization primitive the
spec's prose implies.

## Tech stack

- **Web client:** React 18 + TypeScript + Vite 5, Vitest + Testing Library
  (existing). New: `@supabase/supabase-js` v2.
- **Background task:** Trigger.dev v4 (`@trigger.dev/sdk`), Node runtime,
  `@anthropic-ai/sdk`, `openai`, `@supabase/supabase-js`, `p-limit`. Tests via
  `bun test` (matches the current `server/` convention).
- **Backend platform:** Supabase (Postgres + Auth + Storage + Realtime + Edge
  Functions in Deno), managed via the Supabase CLI and SQL migrations.
- **Static host:** Vercel (SPA catch-all rewrite).
- **Retired:** Bun + Elysia proxy in `server/` (deleted after adapters relocate).

## Repository structure (target)

Three independently-deployed top-level projects plus the retired proxy:

```
apex/        # web client (kept; refactored to Supabase + Auth + Realtime)
supabase/    # migrations, RLS policies, functions/create-story/, config.toml
trigger/     # Trigger.dev project: generate-story task + relocated providers/
server/      # DELETED once providers are relocated
```

`apex/`, `trigger/`, and `supabase/functions/*` each have their own
`package.json`/deps and deploy independently. The shared manifest shape
(`story.types.ts`) and art-style descriptors (`artStyle.ts`) are **duplicated**
into `trigger/` (small, stable interface files) rather than introducing a monorepo
workspace; the contract between the task (writer) and the client (reader) is the
`IStoryManifest` JSON stored in `stories.manifest` (with Storage paths in image
fields). See Risk Assessment for the drift mitigation.

---

## File Structure

### New — Supabase backend (`supabase/`)

- `supabase/config.toml` (Create) — local Supabase config; enables email + Google auth providers and Realtime.
- `supabase/migrations/20260614000001_create_stories.sql` (Create) — `stories` table, `updated_at` trigger, RLS enable + per-owner select/insert/update/delete policies.
- `supabase/migrations/20260614000002_storage_and_realtime.sql` (Create) — private `story-images` bucket, owner-scoped `storage.objects` policies, add `stories` to `supabase_realtime` publication, set `replica identity full`.
- `supabase/functions/create-story/index.ts` (Create) — Deno Edge Function: verify JWT → insert `stories` row (service role) → trigger Trigger.dev task via REST → return `{ storyId }`.
- `supabase/functions/create-story/deno.json` (Create) — import map / Deno config for the function.
- `supabase/.env.example` (Create) — documents `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_SECRET_KEY`, `TRIGGER_API_URL` for the function.

### New — Trigger.dev project (`trigger/`)

- `trigger/package.json` (Create) — deps + `"test": "bun test"`.
- `trigger/trigger.config.ts` (Create) — `defineConfig` with project ref, default retry policy, dirs.
- `trigger/tsconfig.json` (Create) — TS config for the task project.
- `trigger/README.md` (Create) — deploy-time workflow: `trigger.dev login`/`init`, replace the `proj_REPLACE_ME` sentinel in `trigger.config.ts` with the real project ref, set provider/Supabase env vars, then `deploy`.
- `trigger/src/types/story.types.ts` (Create) — duplicated manifest types (image fields hold Storage paths).
- `trigger/src/types/artStyle.ts` (Create) — duplicated art-style descriptors + `FIERCE_MODE_DESCRIPTOR` + `getArtStyleDescriptor`.
- `trigger/src/providers/types.ts` (Create) — relocated provider interfaces; `LlmRequest`/`ImageRequest` gain optional `userId`; `ImageRequest` gains `quality`.
- `trigger/src/providers/anthropic-llm.ts` (Create) — relocated Anthropic adapter; threads `metadata.user_id`.
- `trigger/src/providers/openai-image.ts` (Create) — relocated OpenAI image adapter; threads `quality` + `user`.
- `trigger/src/providers/openai-llm.ts` (Create) — relocated OpenAI LLM adapter (kept available); threads `user`.
- `trigger/src/lib/llm.ts` (Create) — relocated `LlmService` prompt methods, calling the adapter directly (no `fetch`).
- `trigger/src/lib/image.ts` (Create) — relocated `ImageService` (styled prompt + retry), calling the adapter directly.
- `trigger/src/lib/supabase.ts` (Create) — service-role Supabase client factory for the task.
- `trigger/src/lib/storage.ts` (Create) — `uploadImage(path, base64)`, `imageExists(path)` helpers against `story-images`.
- `trigger/src/lib/db.ts` (Create) — `stories`-row helpers: `loadCheckpoint`, `updateProgress`, `saveManifest`, `setCoverPath`, `finalize`, `fail`.
- `trigger/src/lib/pipeline.ts` (Create) — pure `runGenerationPipeline(deps, payload)` (ported `StoryGeneratorService` orchestration with injected I/O).
- `trigger/src/trigger/generateStory.ts` (Create) — the `generate-story` task wrapping `runGenerationPipeline` with real deps + retry + terminal-fail handling.
- `trigger/src/providers/__tests__/openai-image.test.ts` (Test) — relocated + extended for `quality`/`user`.
- `trigger/src/providers/__tests__/anthropic-llm.test.ts` (Test) — relocated + extended for `metadata.user_id`.
- `trigger/src/lib/__tests__/pipeline.test.ts` (Test) — orchestration + checkpoint/skip-if-exists tests (mirrors current `StoryGeneratorService.test.ts`).

### Modify / replace — Web client (`apex/`)

- `apex/package.json` (Modify) — add `@supabase/supabase-js` (Task 7); remove `localforage` (Task 12, alongside `StorageService`'s deletion — deferred so the dependency outlives no importer and Task 8's `tsc -b` stays green).
- `apex/src/lib/supabase.ts` (Create) — browser Supabase client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- `apex/src/contexts/AuthContext.tsx` (Create) — session state + `signInWithEmail` / `signInWithGoogle` / `signOut`.
- `apex/src/components/auth/SignIn.tsx` (Create) — minimal sign-in view (magic link + Google).
- `apex/src/components/auth/SignIn.css` (Create) — minimal styling for the sign-in view.
- `apex/src/services/CatalogService.ts` (Create) — replaces `StorageService`: list/get/create/subscribe/signed-URLs/delete against Supabase.
- `apex/src/services/CatalogService.test.ts` (Test) — CatalogService unit tests with a mocked supabase client.
- `apex/src/contexts/AuthContext.test.tsx` (Test) — AuthContext behavior with a mocked supabase client.
- `apex/src/types/story.types.ts` (Modify) — keep manifest interfaces; add `StoryRecord` (the `stories` row shape) + `StoryStatus`.
- `apex/src/App.tsx` (Modify) — wrap in `AuthProvider`; gate on session (SignIn vs Dashboard/BookViewer); remove `AiConfigProvider`.
- `apex/src/components/dashboard/Dashboard.tsx` (Modify) — trigger via `CatalogService.createStory`; list from Postgres; Realtime live progress; `generating`/`ready`/`failed` cards; remove provider/model picker + `useAiConfig`.
- `apex/src/components/dashboard/Dashboard.test.tsx` (Modify) — rewrite against `CatalogService` + fake Realtime channel + `AuthContext`.
- `apex/src/components/book/BookViewer.tsx` (Modify) — load row via `CatalogService.getStory`; resolve Storage paths → signed URLs.
- `apex/src/components/book/BookViewer.test.tsx` (Modify) — rewrite against `CatalogService` + signed-URL resolution.
- `apex/src/test/fixtures.ts` (Modify) — add `createMockStoryRecord`; keep `createMockStory` for manifest rendering.
- `apex/vite.config.ts` (Modify) — remove the `/api → localhost:3000` dev proxy.
- `apex/vercel.json` (Create) — SPA catch-all rewrite to `/index.html`.
- `apex/.env.example` (Create) — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

### Delete — Client services + Elysia proxy

- `apex/src/services/StoryGeneratorService.ts` + `.test.ts` (Delete) — moved to `trigger/`.
- `apex/src/services/LlmService.ts` + `.test.ts` (Delete) — moved to `trigger/`.
- `apex/src/services/ImageService.ts` + `.test.ts` (Delete) — moved to `trigger/`.
- `apex/src/services/StorageService.ts` + `.test.ts` (Delete) — replaced by `CatalogService`.
- `apex/src/contexts/AiConfigContext.tsx` + `.test.tsx` (Delete) — model selection moves server-side.
- `server/` (Delete entire directory) — Elysia proxy retired after adapters relocate.

### Docs

- `README.md` (Modify) — update architecture pointer to the new four-tier stack.
- `apex/README.md` (Modify) — replace IndexedDB/Gemini-proxy architecture with Supabase + Trigger.dev + Vercel; update env vars.

---

## Tasks

### Task 1 — `stories` table migration (schema + RLS)

**Files:**
- Create: `supabase/config.toml`, `supabase/migrations/20260614000001_create_stories.sql`

**Steps:**
- [ ] **Step 1: Scaffold Supabase config** — create `supabase/config.toml` with `project_id = "vigilant-parakeet"`, `[auth] enabled = true`, `site_url`/`additional_redirect_urls` for local dev (`http://localhost:5173`), `[auth.email] enable_signup = true` (magic link), and an `[auth.external.google] enabled = true` block reading `client_id`/`secret` from env (`env(SUPABASE_AUTH_GOOGLE_CLIENT_ID)` etc.). Add a comment that hosted projects configure providers in the dashboard.
- [ ] **Step 2: Create the `stories` table** — in the migration, `create table public.stories` with exactly these columns: `id uuid primary key default gen_random_uuid()`, `owner_id uuid not null references auth.users(id) on delete cascade`, `status text not null default 'generating' check (status in ('generating','ready','failed'))`, `animal_a text not null`, `animal_b text not null`, `title text`, `art_style text not null default 'surprise'`, `fierce_mode boolean not null default false`, `cover_image_path text`, `manifest jsonb`, `progress_step text`, `progress_pct int not null default 0`, `error text`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. Add a SQL comment noting `pod_id uuid` is intentionally reserved for a later slice and not added now.
- [ ] **Step 3: Add the `updated_at` trigger** — create `public.set_updated_at()` (`new.updated_at = now(); return new;`) and a `before update on public.stories for each row execute function public.set_updated_at()` trigger.
- [ ] **Step 4: Enable RLS** — `alter table public.stories enable row level security;`.
- [ ] **Step 5: Add per-owner policies** — four policies named `"Owners can select own stories"`, `"...insert..."`, `"...update..."`, `"...delete..."`: `for select using ((select auth.uid()) = owner_id)`, `for insert with check ((select auth.uid()) = owner_id)`, `for update using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)`, `for delete using ((select auth.uid()) = owner_id)`.
- [ ] **Step 6: Add an index** — `create index stories_owner_created_idx on public.stories (owner_id, created_at desc);` for the catalog listing.
- [ ] **Step 7: Validate the migration applies** — run `supabase db reset` (or `supabase migration up`) against the local stack and confirm it completes without error.

**Acceptance criteria:**
- The migration creates the `stories` table with all 15 columns and the `status` CHECK constraint exactly as specified.
  Verify: `grep -oE "^[[:space:]]*(id|owner_id|status|animal_a|animal_b|title|art_style|fierce_mode|cover_image_path|manifest|progress_step|progress_pct|error|created_at|updated_at) (uuid|text|jsonb|boolean|int|timestamptz)" supabase/migrations/20260614000001_create_stories.sql | sort -u | wc -l` returns `15` (each of the 15 columns defined exactly once, one per line), and `grep -E "status text not null default 'generating' check \(status in \('generating','ready','failed'\)\)" supabase/migrations/20260614000001_create_stories.sql` returns one match (the status CHECK constraint).
- RLS is enabled and four owner-scoped policies exist using `auth.uid() = owner_id`.
  Verify: `grep -c "auth.uid()) = owner_id" supabase/migrations/20260614000001_create_stories.sql` returns `5` (one per policy + the update `with check`), and `grep -n "enable row level security" supabase/migrations/20260614000001_create_stories.sql` returns one match.
- The migration applies cleanly to a fresh database.
  Verify: run `cd supabase && supabase db reset` and confirm it exits 0 with no `ERROR:` lines in output (requires local Supabase via `supabase start`).
- `pod_id` is not added but is documented as reserved.
  Verify: `grep -i "pod_id" supabase/migrations/20260614000001_create_stories.sql` matches only inside a SQL comment line (a line beginning with `--`), and no `add column pod_id` / `pod_id uuid` column definition exists.

**Model tier:** standard

---

### Task 2 — Storage bucket, Storage RLS, and Realtime publication

**Files:**
- Create: `supabase/migrations/20260614000002_storage_and_realtime.sql`

**Steps:**
- [ ] **Step 1: Create the private bucket** — `insert into storage.buckets (id, name, public) values ('story-images', 'story-images', false) on conflict (id) do nothing;`.
- [ ] **Step 2: Add an owner-scoped SELECT policy on `storage.objects`** — policy `"Owners can read own story images"` `for select to authenticated using (bucket_id = 'story-images' and (storage.foldername(name))[1] = 'stories' and exists (select 1 from public.stories s where s.id::text = (storage.foldername(name))[2] and s.owner_id = (select auth.uid())))`. Add a comment: object layout is `stories/{storyId}/cover.png` and `stories/{storyId}/{pageIndex}.png`, so `foldername` yields `['stories', storyId]`.
- [ ] **Step 3: Add owner-scoped insert/update/delete policies** — three more policies on `storage.objects` with the same `bucket_id`/`foldername`/`exists(...)` predicate (using `with check` for insert/update) so a future authenticated-write path is covered; note in a comment that the task itself writes with the service-role key and bypasses RLS.
- [ ] **Step 4: Add `stories` to the Realtime publication** — `alter publication supabase_realtime add table public.stories;` (the `supabase_realtime` publication exists by default on Supabase).
- [ ] **Step 5: Set replica identity** — `alter table public.stories replica identity full;` so UPDATE payloads (progress changes) carry all columns to subscribers.
- [ ] **Step 6: Validate** — run `supabase db reset` and confirm both migrations apply without error.

**Acceptance criteria:**
- A private `story-images` bucket is created.
  Verify: `grep -n "story-images', false" supabase/migrations/20260614000002_storage_and_realtime.sql` returns one match (the `public = false` bucket insert).
- Storage SELECT is gated to the owning user via the `stories` subquery on the `{storyId}` path segment.
  Verify: open `supabase/migrations/20260614000002_storage_and_realtime.sql` and confirm the SELECT policy contains both `(storage.foldername(name))[2]` and `s.owner_id = (select auth.uid())` within a single `exists (...)` predicate.
- `stories` is added to the Realtime publication and uses full replica identity.
  Verify: `grep -E "add table public.stories|replica identity full" supabase/migrations/20260614000002_storage_and_realtime.sql` returns 2 matches.
- Both migrations apply cleanly in sequence.
  Verify: run `cd supabase && supabase db reset` and confirm exit 0 with no `ERROR:` lines (requires local Supabase).

**Model tier:** standard

---

### Task 3 — Trigger.dev project scaffold + relocated provider adapters

**Files:**
- Create: `trigger/package.json`, `trigger/trigger.config.ts`, `trigger/tsconfig.json`, `trigger/README.md`, `trigger/src/providers/types.ts`, `trigger/src/providers/anthropic-llm.ts`, `trigger/src/providers/openai-image.ts`, `trigger/src/providers/openai-llm.ts`, `trigger/src/types/story.types.ts`, `trigger/src/types/artStyle.ts`
- Test: `trigger/src/providers/__tests__/anthropic-llm.test.ts`, `trigger/src/providers/__tests__/openai-image.test.ts`

**Steps:**
- [ ] **Step 1: Scaffold `trigger/package.json`** — `"name": "trigger"`, `"type": "module"`, scripts `"dev": "trigger dev"`, `"deploy": "trigger deploy"`, `"test": "bun test"`; dependencies `@trigger.dev/sdk` (v4), `@anthropic-ai/sdk` (`^0.39.0`), `openai` (`^6.34.0`), `@supabase/supabase-js` (`^2`), `p-limit` (`^6.2.0`); devDependencies `@types/bun`.
- [ ] **Step 2: Scaffold `trigger/trigger.config.ts`** — `import { defineConfig } from "@trigger.dev/sdk";` and `export default defineConfig({ project: "proj_REPLACE_ME", dirs: ["./src/trigger"], retries: { default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000, randomize: true } } })`. Use the literal sentinel `proj_REPLACE_ME` as the `project` value, and add a comment block documenting the exact deploy-time replacement: run `npx trigger.dev@latest login`, then `npx trigger.dev@latest init` from `trigger/` to create/link the cloud project and obtain its `proj_...` reference, then replace `proj_REPLACE_ME` with that reference before `npx trigger.dev@latest deploy`. The unit suite (`bun test`) does not need a real ref; deploy does.
- [ ] **Step 3: Scaffold `trigger/tsconfig.json`** — `target`/`module` `ESNext`, `moduleResolution` `Bundler`, `strict: true`, `types: ["bun"]`, `skipLibCheck: true`.
- [ ] **Step 4: Copy the shared types** — copy `apex/src/types/story.types.ts` verbatim to `trigger/src/types/story.types.ts`, and add a top-of-file comment: "Duplicated from apex/src/types/story.types.ts — keep in sync. Image fields (`coverImageUrl`, `IPageContent.imageUrl`) now hold Supabase Storage paths, not base64."
- [ ] **Step 5: Copy the art-style descriptors** — copy `apex/src/types/artStyle.ts` verbatim to `trigger/src/types/artStyle.ts` (includes `ART_STYLE_OPTIONS`, `FIERCE_MODE_DESCRIPTOR`, `StoryGeneratorOptions`, `getArtStyleDescriptor`).
- [ ] **Step 6: Relocate provider interfaces with metadata + quality** — copy `server/src/providers/types.ts` to `trigger/src/providers/types.ts`; add `userId?: string` to both `LlmRequest` and `ImageRequest`, and add `quality?: 'low' | 'medium' | 'high'` to `ImageRequest`.
- [ ] **Step 7: Relocate the Anthropic adapter + thread user metadata** — copy `server/src/providers/anthropic-llm.ts` to `trigger/src/providers/anthropic-llm.ts`; in `messages.create({...})` add `...(request.userId && { metadata: { user_id: request.userId } })`. Keep `DEFAULT_MODEL = 'claude-sonnet-4-20250514'`, `max_tokens: 4096`, the structured-output tool, and the array-wrapping logic unchanged.
- [ ] **Step 8: Relocate the OpenAI image adapter + thread quality + user** — copy `server/src/providers/openai-image.ts` (and its `mapAspectRatioToSize`) to `trigger/src/providers/openai-image.ts`; in `images.generate({...})` add `...(request.quality && { quality: request.quality })` and `...(request.userId && { user: request.userId })`. Keep `DEFAULT_MODEL = 'gpt-image-2'` and the size maps.
- [ ] **Step 9: Relocate the OpenAI LLM adapter + thread user** — copy `server/src/providers/openai-llm.ts` (and `prepareSchemaForOpenAI`) to `trigger/src/providers/openai-llm.ts`; add `...(request.userId && { user: request.userId })` to `chat.completions.create({...})`.
- [ ] **Step 10: Relocate + extend the OpenAI image test** — copy `server/src/providers/__tests__/openai-image.test.ts` to `trigger/src/providers/__tests__/openai-image.test.ts`; add a test "passes quality when provided" asserting `callArgs.quality === 'medium'` for `adapter.generate({ prompt, quality: 'medium' })`, and a test "passes user when userId provided" asserting `callArgs.user === 'user-123'` for `adapter.generate({ prompt, userId: 'user-123' })`.
- [ ] **Step 11: Relocate + extend the Anthropic test** — copy `server/src/providers/__tests__/anthropic-llm.test.ts` to `trigger/src/providers/__tests__/anthropic-llm.test.ts`; add a test asserting `messages.create` is called with `metadata.user_id === 'user-123'` when `generate({ ..., userId: 'user-123' })` is called (mock the client like the existing tests do).
- [ ] **Step 12: Run the adapter tests** — `cd trigger && bun install && bun test` and confirm all adapter tests pass.
- [ ] **Step 13: Document the Trigger.dev deploy workflow** — create `trigger/README.md` capturing the deploy-time project-ref workflow so the scaffold is not left undeployable: (1) `npx trigger.dev@latest login`; (2) `npx trigger.dev@latest init` (run from `trigger/`) to create/link the cloud project and obtain the `proj_...` reference; (3) replace the `proj_REPLACE_ME` sentinel in `trigger.config.ts` with that reference; (4) set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` as Trigger.dev environment variables; (5) `npx trigger.dev@latest deploy`. Note explicitly that `proj_REPLACE_ME` is an intentional sentinel that MUST be replaced before deploy.

**Acceptance criteria:**
- The Trigger.dev project scaffolds with a v4 config and `bun test` wiring.
  Verify: `grep -n "defineConfig" trigger/trigger.config.ts` returns a match, and `grep -n '"test": "bun test"' trigger/package.json` returns a match.
- The OpenAI image adapter threads `quality` and `user` into the SDK call.
  Verify: `grep -E "request.quality|request.userId" trigger/src/providers/openai-image.ts` returns at least 2 matches, and `cd trigger && bun test src/providers/__tests__/openai-image.test.ts` exits 0 with the "passes quality"/"passes user" tests passing.
- The Anthropic adapter threads `metadata.user_id` and keeps Claude Sonnet 4 defaults.
  Verify: `grep -E "metadata: \{ user_id|claude-sonnet-4-20250514|max_tokens: 4096" trigger/src/providers/anthropic-llm.ts` returns 3 matches, and `cd trigger && bun test src/providers/__tests__/anthropic-llm.test.ts` exits 0.
- Shared types are duplicated with a sync note.
  Verify: `grep -in "keep in sync" trigger/src/types/story.types.ts` returns a match, and `grep -n "IStoryManifest" trigger/src/types/story.types.ts` returns a match.
- The Trigger.dev deploy-time project-ref workflow is documented and the config carries a replaceable sentinel rather than a silently-broken value.
  Verify: `grep -n "proj_REPLACE_ME" trigger/trigger.config.ts` returns a match, and `grep -E "trigger.dev@latest init|proj_REPLACE_ME|trigger.dev@latest deploy" trigger/README.md` returns at least 3 matches (the init step, the sentinel to replace, and the deploy step).

**Model tier:** standard

---

### Task 4 — Pure generation pipeline with injected dependencies

**Files:**
- Create: `trigger/src/lib/llm.ts`, `trigger/src/lib/image.ts`, `trigger/src/lib/pipeline.ts`
- Test: `trigger/src/lib/__tests__/pipeline.test.ts`

**Steps:**
- [ ] **Step 1: Relocate `LlmService` as a class calling the adapter** — create `trigger/src/lib/llm.ts` exporting `class LlmClient` constructed with an `ILlmProvider` adapter and a `model` + optional `userId`. Port `getAnimalProfile`, `getAspectsForAnimal`, `getShowdownAndOutcome`, `getAnimalVisualDescriptions` verbatim from `apex/src/services/LlmService.ts`, replacing the `callLlm` `fetch('/api/llm/generate')` body with `this.adapter.generate({ prompt, systemPrompt, model: this.model, responseSchema, userId: this.userId })` and returning `response.data`. Keep all prompt strings and JSON schemas byte-for-byte identical.
- [ ] **Step 2: Relocate `ImageService` as a class calling the adapter** — create `trigger/src/lib/image.ts` exporting `class ImageClient` constructed with an `IImageProvider` adapter and `model`, `quality`, optional `userId`. Port `generateImage(prompt, options)` from `apex/src/services/ImageService.ts` keeping the styled-prompt prefix and the 3-attempt retry/backoff; replace the `fetch('/api/image/generate')` body with `this.adapter.generate({ prompt: styledPrompt, model: this.model, aspectRatio: options?.aspectRatio, quality: this.quality, userId: this.userId })`; return the base64 portion of `imageDataUri` (strip the `data:image/png;base64,` prefix) so the caller uploads raw bytes.
- [ ] **Step 3: Define the pipeline dependency interface** — in `trigger/src/lib/pipeline.ts`, define `interface PipelineDeps { llm: LlmClient; image: ImageClient; storage: { uploadImage(path: string, base64: string): Promise<string>; imageExists(path: string): Promise<boolean> }; db: { loadCheckpoint(storyId: string): Promise<Partial<IStoryManifest> | null>; updateProgress(storyId: string, step: string, pct: number): Promise<void>; saveManifest(storyId: string, manifest: Partial<IStoryManifest>): Promise<void>; setCoverPath(storyId: string, path: string): Promise<void> } }` and `interface GenerateStoryPayload { storyId: string; ownerId: string; animalA: string; animalB: string; options: StoryGeneratorOptions; }`.
- [ ] **Step 4: Port the orchestration into `runGenerationPipeline`** — port `StoryGeneratorService.generateStory` (`apex/src/services/StoryGeneratorService.ts`) into `export async function runGenerationPipeline(deps: PipelineDeps, payload: GenerateStoryPayload): Promise<IStoryManifest>`. Preserve exactly: the 12 aspect names, surprise-ending roll (1-in-7) and `determineEndingType`, the cover prompt text, the parallel `Promise.all([outcome, aspectsA, aspectsB, cover])`, the page index scheme (aspect pairs 1–24, showdown 31, outcome 32, left/right alternation), and the final manifest assembly. Replace `onProgress?.(...)` calls with `await deps.db.updateProgress(payload.storyId, step, pct)`.
- [ ] **Step 5: Make image steps write to Storage and skip-if-exists** — for the cover, compute `coverPath = \`stories/${storyId}/cover.png\``; `if (await deps.storage.imageExists(coverPath))` reuse it, else generate via `deps.image.generateImage(...)` then `await deps.storage.uploadImage(coverPath, base64)` and `await deps.db.setCoverPath(storyId, coverPath)`. For each page, `pagePath = \`stories/${storyId}/${page.index}.png\``; same skip-or-generate-then-upload pattern. Set `manifest.coverImageUrl = coverPath` and `page.imageUrl = pagePath` (Storage paths, never base64).
- [ ] **Step 6: Make narrative phases resume from the checkpoint** — at the top, `const cp = await deps.db.loadCheckpoint(storyId)`; for the profiles, visual-anchor, and outcome/aspects phases, reuse `cp.animalA`/`cp.visualAnchor`/`cp.outcome`/`cp.pages` when present instead of re-calling the LLM, and call `await deps.db.saveManifest(storyId, partial)` after each phase completes so a re-run skips it.
- [ ] **Step 7: Pin the OpenAI image concurrency** — generate page images with `pLimit(2)` and a 15_000 ms inter-request delay (`if (completed > 0) await sleep(15000)` before each call), matching the current OpenAI-path bound in `StoryGeneratorService.ts`; do not use the looser Gemini-era `6`/`0`.
- [ ] **Step 8: Write the pipeline test** — create `trigger/src/lib/__tests__/pipeline.test.ts` using `bun:test`; build fake `deps` (in-memory `llm`/`image`/`storage`/`db` with `mock()` fns), fix `Math.random` to 0.5, and port the relevant assertions from `apex/src/services/StoryGeneratorService.test.ts`: 26 pages; indices 1/2 … 23/24, 31, 32; left/right alternation; 27 image generations on a clean run (cover + 26 pages); `updateProgress` called with the milestone steps; `imageUrl`/`coverImageUrl` set to `stories/{id}/...` paths.
- [ ] **Step 9: Add a skip-if-exists test** — add a test where `storage.imageExists` returns `true` for all paths and assert `image.generateImage` is called `0` times and the returned manifest still has all 26 page paths + cover path (proves checkpoint resumption saves cost).
- [ ] **Step 10: Add a userId-threading test** — construct `LlmClient`/`ImageClient` with `userId: 'owner-xyz'` and a spy adapter; run a minimal path and assert the adapter received `userId: 'owner-xyz'` (covers the spend-tagging data requirement at the client layer).
- [ ] **Step 11: Run the tests** — `cd trigger && bun test` and confirm green.

**Acceptance criteria:**
- The ported pipeline produces 26 pages with the exact index/left-right scheme and stores Storage paths (not base64) in image fields.
  Verify: `cd trigger && bun test src/lib/__tests__/pipeline.test.ts` exits 0, including the assertions for 26 pages, indices 31/32, and `imageUrl` values matching `stories/{id}/{index}.png`.
- A clean run generates exactly 27 images (cover + 26 pages); a fully-cached run generates 0.
  Verify: `cd trigger && bun test src/lib/__tests__/pipeline.test.ts` exits 0 with both the "27 image generations" and the "skip-if-exists → 0 generations" tests passing.
- OpenAI image concurrency is capped at 2 with a 15s inter-request delay.
  Verify: `grep -E "pLimit\(2\)|15_000|15000" trigger/src/lib/pipeline.ts` returns at least 2 matches (the limit and the delay).
- The owner `userId` is threaded into provider calls.
  Verify: `cd trigger && bun test src/lib/__tests__/pipeline.test.ts` exits 0 with the userId-threading test passing; and `grep -n "userId" trigger/src/lib/llm.ts trigger/src/lib/image.ts` returns at least 2 matches.

**Model tier:** capable

---

### Task 5 — `generate-story` Trigger.dev task (durable wiring)

**Files:**
- Create: `trigger/src/lib/supabase.ts`, `trigger/src/lib/storage.ts`, `trigger/src/lib/db.ts`, `trigger/src/trigger/generateStory.ts`
- Test: `trigger/src/lib/__tests__/db.test.ts`

**Steps:**
- [ ] **Step 1: Service-role Supabase client** — create `trigger/src/lib/supabase.ts` exporting `createServiceClient()` that returns `createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })`.
- [ ] **Step 2: Storage helpers** — create `trigger/src/lib/storage.ts` with `uploadImage(client, path, base64)` (decode base64 to a `Buffer`/`Uint8Array`, `client.storage.from('story-images').upload(path, bytes, { contentType: 'image/png', upsert: true })`, return `path`) and `imageExists(client, path)` (`client.storage.from('story-images').list(dirname)` then check the filename is present, or attempt `download` and treat a non-error as existence) returning a boolean.
- [ ] **Step 3: DB row helpers** — create `trigger/src/lib/db.ts` with `loadCheckpoint(client, storyId)` (`select manifest from stories where id=...`, return `manifest` or `null`), `updateProgress(client, storyId, step, pct)` (`update stories set progress_step=step, progress_pct=pct`), `saveManifest(client, storyId, manifest)` (merge into `manifest` JSONB), `setCoverPath(client, storyId, path)` (`update ... set cover_image_path=path`), `finalize(client, storyId, manifest, title)` (`update ... set manifest=manifest, title=title, status='ready', progress_pct=100`), and `fail(client, storyId, error)` (`update ... set status='failed', error=error`).
- [ ] **Step 4: Define the task** — create `trigger/src/trigger/generateStory.ts`: `export const generateStory = task({ id: "generate-story", retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 }, run: async (payload: GenerateStoryPayload & { generationConfig: GenerationConfig }) => { ... } })`. Define `interface GenerationConfig { textModel: string; imageModel: string; imageQuality: 'low'|'medium'|'high' }`.
- [ ] **Step 5: Wire real deps inside `run`** — build the service client; instantiate `new AnthropicLlmAdapter(process.env.ANTHROPIC_API_KEY!)` → `new LlmClient(adapter, generationConfig.textModel, payload.ownerId)` and `new OpenAiImageAdapter(process.env.OPENAI_API_KEY!)` → `new ImageClient(imageAdapter, generationConfig.imageModel, generationConfig.imageQuality, payload.ownerId)`; build `storage`/`db` dep objects bound to the client; call `await runGenerationPipeline(deps, payload)`; then `await finalize(client, storyId, manifest, manifest.metadata.title)`.
- [ ] **Step 6: Terminal failure handling** — wrap the `run` body so that when an error propagates after retries are exhausted, the task sets `status='failed'` and `error`. Implement via Trigger.dev's `catchError`/`handleError` lifecycle hook (or a try/catch that, on the final attempt determined by `ctx.attempt.number >= ctx.attempt.maxAttempts`, calls `fail(client, storyId, message)` before rethrowing) so transient failures still retry but the terminal state is recorded. Add a code comment citing Non-goal: no user-facing manual retry in this slice.
- [ ] **Step 7: Apply generationConfig defaults** — if `generationConfig` is absent or partial, default `textModel='claude-sonnet-4-20250514'`, `imageModel='gpt-image-2'`, `imageQuality='medium'` at the top of `run`.
- [ ] **Step 8: Unit-test the db helpers** — create `trigger/src/lib/__tests__/db.test.ts` using `bun:test` with a fake supabase client (chainable `from().update().eq()` mock) and assert: `updateProgress` issues an update with `progress_step`/`progress_pct`; `finalize` sets `status='ready'` and `progress_pct=100`; `fail` sets `status='failed'` and `error`.
- [ ] **Step 9: Run tests** — `cd trigger && bun test` and confirm green.

**Acceptance criteria:**
- The task is defined with id `generate-story` and an automatic retry policy.
  Verify: `grep -E 'id: "generate-story"|maxAttempts: 3' trigger/src/trigger/generateStory.ts` returns 2 matches.
- The task finalizes to `ready` on success and to `failed` with an error only after retries are exhausted.
  Verify: open `trigger/src/trigger/generateStory.ts` and confirm `finalize(...)` runs after `runGenerationPipeline` and that the terminal-fail path is guarded by an attempt check or `catchError`/`handleError` hook (not called on every transient error); and `cd trigger && bun test src/lib/__tests__/db.test.ts` exits 0 with the `status='ready'` and `status='failed'` assertions passing.
- Provider keys come from Trigger.dev env, not the client.
  Verify: `grep -E "process.env.ANTHROPIC_API_KEY|process.env.OPENAI_API_KEY" trigger/src/trigger/generateStory.ts` returns 2 matches and no API key string literals appear in the file.
- Default models are Claude Sonnet 4 + gpt-image-2 (medium).
  Verify: `grep -E "claude-sonnet-4-20250514|gpt-image-2|'medium'" trigger/src/trigger/generateStory.ts` returns 3 matches.

**Model tier:** capable

---

### Task 6 — `create-story` Edge Function

**Files:**
- Create: `supabase/functions/create-story/index.ts`, `supabase/functions/create-story/deno.json`, `supabase/.env.example`

**Steps:**
- [ ] **Step 1: Scaffold the function config** — create `supabase/functions/create-story/deno.json` with an imports map pinning `@supabase/supabase-js` to `jsr:@supabase/supabase-js@2`.
- [ ] **Step 2: Handle CORS** — in `index.ts`, define `corsHeaders` (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`, `Access-Control-Allow-Methods: POST, OPTIONS`) and short-circuit `OPTIONS` with a 204.
- [ ] **Step 3: Verify the caller's JWT** — read the `Authorization: Bearer <jwt>` header; create a service-role client via `createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })`; call `const { data: { user }, error } = await supabase.auth.getUser(jwt)`; return `401` JSON if missing/invalid.
- [ ] **Step 4: Validate the request body** — parse `{ animalA, animalB, artStyle, fierceMode }`; require non-empty `animalA`/`animalB` strings; default `artStyle='surprise'`, `fierceMode=false`; return `400` JSON on invalid input.
- [ ] **Step 5: Insert the story row** — `const { data: story, error } = await supabase.from('stories').insert({ owner_id: user.id, status: 'generating', animal_a: animalA, animal_b: animalB, art_style: artStyle, fierce_mode: fierceMode, progress_step: 'Queued…', progress_pct: 0 }).select('id').single();` return `500` JSON on error.
- [ ] **Step 6: Trigger the Trigger.dev task via REST** — `POST ${Deno.env.get('TRIGGER_API_URL') ?? 'https://api.trigger.dev'}/api/v1/tasks/generate-story/trigger` with headers `Authorization: Bearer ${Deno.env.get('TRIGGER_SECRET_KEY')}` and `Content-Type: application/json`, body `{ payload: { storyId: story.id, ownerId: user.id, animalA, animalB, options: { artStyle, fierceMode }, generationConfig: { textModel: 'claude-sonnet-4-20250514', imageModel: 'gpt-image-2', imageQuality: 'medium' } } }`. Add a comment that the Deno runtime uses the REST endpoint rather than the Node `@trigger.dev/sdk` to avoid runtime-compat risk.
- [ ] **Step 7: Roll back on trigger failure** — if the trigger POST is not `ok`, update the row to `status='failed', error='Failed to enqueue generation'` (best effort) and return `502` JSON.
- [ ] **Step 8: Return the storyId** — on success, return `200` JSON `{ storyId: story.id }` with `corsHeaders`.
- [ ] **Step 9: Document env** — create `supabase/.env.example` listing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_SECRET_KEY`, `TRIGGER_API_URL` with a comment that these are set as Supabase function secrets (`supabase secrets set ...`), never shipped to the browser.

**Acceptance criteria:**
- The function verifies the JWT and derives `owner_id` from the authenticated user (never trusts a client-supplied owner).
  Verify: open `supabase/functions/create-story/index.ts` and confirm `supabase.auth.getUser(jwt)` is called and the insert uses `owner_id: user.id` (not a value read from the request body).
- The function inserts a `generating` row and returns `{ storyId }`.
  Verify: `grep -E "status: 'generating'|storyId: story.id|\.insert\(" supabase/functions/create-story/index.ts` returns at least 3 matches.
- The task is triggered via the Trigger.dev REST endpoint using the secret key from env, and the default model/quality config is sent.
  Verify: `grep -E "/api/v1/tasks/generate-story/trigger|TRIGGER_SECRET_KEY|claude-sonnet-4-20250514|imageQuality: 'medium'" supabase/functions/create-story/index.ts` returns at least 4 matches.
- CORS preflight is handled.
  Verify: `grep -E "OPTIONS|Access-Control-Allow-Origin" supabase/functions/create-story/index.ts` returns at least 2 matches.

**Model tier:** standard

---

### Task 7 — Web client Supabase client, Auth context, and sign-in view

**Files:**
- Create: `apex/src/lib/supabase.ts`, `apex/src/contexts/AuthContext.tsx`, `apex/src/components/auth/SignIn.tsx`, `apex/src/components/auth/SignIn.css`
- Modify: `apex/package.json`, `apex/src/App.tsx`
- Test: `apex/src/contexts/AuthContext.test.tsx`

**Steps:**
- [ ] **Step 1: Add the dependency** — in `apex/package.json`, add `"@supabase/supabase-js": "^2"` to `dependencies`. Run `cd apex && npm install`. Leave `"localforage"` in `dependencies` for now: `StorageService.ts` still imports it (`import localforage from 'localforage'`) and is not deleted until Task 12, so removing the package here would break the `npx tsc -b` typecheck in Task 8 (which deliberately keeps `StorageService` present). The `localforage` dependency is removed in Task 12 alongside `StorageService`'s deletion, so it never outlives its last importer.
- [ ] **Step 2: Create the browser client** — `apex/src/lib/supabase.ts`: `export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)`. Add a `vite-env.d.ts` augmentation or rely on the existing `apex/src/vite-env.d.ts` for `ImportMetaEnv` typing of the two vars.
- [ ] **Step 3: Build `AuthContext`** — `apex/src/contexts/AuthContext.tsx` exporting `AuthProvider` and `useAuth()`. State: `session`, `user`, `loading`. On mount: `supabase.auth.getSession()` then subscribe with `supabase.auth.onAuthStateChange((_e, session) => ...)`; unsubscribe on cleanup. Expose `signInWithEmail(email)` (`supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })`), `signInWithGoogle()` (`supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`), and `signOut()` (`supabase.auth.signOut()`).
- [ ] **Step 4: Build `SignIn`** — `apex/src/components/auth/SignIn.tsx`: an email `<input>` + "Send magic link" button calling `signInWithEmail` (show a "Check your email" confirmation on success), and a "Continue with Google" button calling `signInWithGoogle`. Minimal styling in `SignIn.css`.
- [ ] **Step 5: Gate the app on auth** — modify `apex/src/App.tsx`: wrap the tree in `AuthProvider`; inside, read `useAuth()` — while `loading` render a spinner/null, when no `user` render `<SignIn />`, otherwise render the existing Dashboard/BookViewer switch. Keep the existing `AiConfigProvider` wrapping the authenticated Dashboard/BookViewer subtree for now — Dashboard still consumes `useAiConfig` until Task 9, so removing the provider here would break an authenticated render. `AiConfigProvider` (and its import) is removed in Task 9 alongside the Dashboard `useAiConfig` removal. Add a sign-out affordance (button) in the authenticated view header area.
- [ ] **Step 6: Write the AuthContext test** — `apex/src/contexts/AuthContext.test.tsx`: `vi.mock('../lib/supabase', ...)` with a fake `auth` exposing `getSession` (resolves a session), `onAuthStateChange` (returns `{ data: { subscription: { unsubscribe } } }`), `signInWithOtp`, `signInWithOAuth`, `signOut`. Render a probe component using `useAuth()`; assert `user` populates after `getSession` resolves, and that `signInWithEmail('a@b.com')` calls `signInWithOtp` with that email.
- [ ] **Step 7: Run tests** — `cd apex && npm run test:run -- src/contexts/AuthContext.test.tsx` and confirm green.

**Acceptance criteria:**
- A Supabase browser client is created from the public anon key + URL env vars.
  Verify: `grep -E "createClient|VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY" apex/src/lib/supabase.ts` returns 3 matches.
- `AuthContext` exposes email magic-link and Google sign-in and tracks session state via `onAuthStateChange`.
  Verify: `grep -E "signInWithOtp|signInWithOAuth|onAuthStateChange" apex/src/contexts/AuthContext.tsx` returns 3 matches, and `cd apex && npm run test:run -- src/contexts/AuthContext.test.tsx` exits 0.
- The app renders `SignIn` when unauthenticated and the library when authenticated, wrapped in `AuthProvider`; `AiConfigProvider` is intentionally retained (wrapping the authenticated subtree) and is not removed until Task 9.
  Verify: `grep -E "AuthProvider|SignIn" apex/src/App.tsx` returns at least 2 matches; and `grep -c "AiConfigProvider" apex/src/App.tsx` returns a count ≥ 2 (the import plus at least one wrapping tag — the provider is deliberately kept here and removed in Task 9).

**Model tier:** standard

---

### Task 8 — `CatalogService` replacing client storage/generation services

**Files:**
- Create: `apex/src/services/CatalogService.ts`
- Modify: `apex/src/types/story.types.ts`, `apex/src/test/fixtures.ts`
- Test: `apex/src/services/CatalogService.test.ts`

Note: the obsolete client services/contexts (`StorageService`, `LlmService`, `ImageService`, `StoryGeneratorService`, `AiConfigContext`) are **not** deleted in this task — they are still consumed by `Dashboard.tsx` (refactored in Task 9) and `BookViewer.tsx` (refactored in Task 10), and `StoryGeneratorService` still imports `LlmService`/`ImageService`. Their deletion and the repo-wide `tsc -b` / dangling-import check are deferred to Task 12, which runs after both consumers are refactored.

**Steps:**
- [ ] **Step 1: Add the row types** — in `apex/src/types/story.types.ts`, add `export type StoryStatus = 'generating' | 'ready' | 'failed';` and `export interface StoryRecord { id: string; owner_id: string; status: StoryStatus; animal_a: string; animal_b: string; title: string | null; art_style: string; fierce_mode: boolean; cover_image_path: string | null; manifest: IStoryManifest | null; progress_step: string | null; progress_pct: number; error: string | null; created_at: string; updated_at: string; }`. Keep all existing interfaces.
- [ ] **Step 2: Implement list/get** — `CatalogService.listStories()`: `supabase.from('stories').select('*').order('created_at', { ascending: false })` → `StoryRecord[]` (RLS scopes to the user). `getStory(id)`: `...select('*').eq('id', id).single()`.
- [ ] **Step 3: Implement createStory** — `createStory({ animalA, animalB, artStyle, fierceMode })`: `supabase.functions.invoke('create-story', { body: { animalA, animalB, artStyle, fierceMode } })` (the user's JWT is attached automatically); return `data.storyId`; throw on `error`.
- [ ] **Step 4: Implement the Realtime subscription** — `subscribeToStories(userId, handlers)`: `supabase.channel('stories:' + userId).on('postgres_changes', { event: '*', schema: 'public', table: 'stories', filter: \`owner_id=eq.${userId}\` }, payload => handlers(payload)).subscribe()`; return the channel so callers can `supabase.removeChannel(channel)`.
- [ ] **Step 5: Implement signed-URL resolution** — `resolveSignedUrls(paths: string[], ttl = 3600)`: `supabase.storage.from('story-images').createSignedUrls(paths, ttl)` → return a `Record<path, signedUrl>` (skip nulls). Add `resolveSignedUrl(path, ttl)` for single paths.
- [ ] **Step 6: Implement delete** — `deleteStory(id)`: `supabase.from('stories').delete().eq('id', id)` (RLS-scoped); note in a comment that Storage object cleanup is deferred (acceptable for this slice — orphaned objects only readable by the owner).
- [ ] **Step 7: Update fixtures** — in `apex/src/test/fixtures.ts`, add `export function createMockStoryRecord(overrides: Partial<StoryRecord> = {}): StoryRecord` returning a ready row (`status: 'ready'`, `cover_image_path: 'stories/story-1/cover.png'`, `manifest: createMockStory()`, structured columns populated). Keep `createMockStory` for BookViewer manifest tests.
- [ ] **Step 8: Write CatalogService tests** — `apex/src/services/CatalogService.test.ts`: `vi.mock('../lib/supabase', ...)` with a chainable query-builder mock and a fake `channel`/`functions`/`storage`. Assert: `listStories` selects `stories` ordered by `created_at desc`; `createStory` invokes the `create-story` function with the form body and returns `storyId`; `subscribeToStories` registers a `postgres_changes` listener with an `owner_id=eq.<id>` filter; `resolveSignedUrls` calls `createSignedUrls` and maps results.
- [ ] **Step 9: Run tests + typecheck** — `cd apex && npm run test:run -- src/services/CatalogService.test.ts` then `cd apex && npx tsc -b` and confirm the new `CatalogService` + `StoryRecord`/`StoryStatus` types compile cleanly alongside the still-present legacy services. Do NOT delete `StorageService`/`LlmService`/`ImageService`/`StoryGeneratorService`/`AiConfigContext` here — they remain consumed by `Dashboard.tsx` and `BookViewer.tsx` until Tasks 9–10; their deletion and the repo-wide dangling-import check happen in Task 12.

**Acceptance criteria:**
- `CatalogService` reads the catalog from Postgres, triggers generation via the Edge Function, subscribes to owner-filtered Realtime changes, and resolves signed Storage URLs.
  Verify: `grep -E "from\('stories'\)|functions.invoke\('create-story'|postgres_changes|createSignedUrls" apex/src/services/CatalogService.ts` returns at least 4 matches, and `cd apex && npm run test:run -- src/services/CatalogService.test.ts` exits 0.
- `StoryRecord`/`StoryStatus` exist and the manifest interfaces are retained.
  Verify: `grep -E "interface StoryRecord|type StoryStatus|interface IStoryManifest" apex/src/types/story.types.ts` returns 3 matches.
- The additive client code (`CatalogService` + new types + fixtures) typechecks alongside the still-present legacy services, which are intentionally NOT deleted in this task (their consumers are refactored in Tasks 9–10 and the modules are deleted in Task 12).
  Verify: `cd apex && npx tsc -b` exits 0; and `ls apex/src/services/StorageService.ts apex/src/services/StoryGeneratorService.ts apex/src/contexts/AiConfigContext.tsx` lists all three as still present (exit 0, no "No such file" error) — proving the deletion was correctly deferred.

**Model tier:** capable

---

### Task 9 — Dashboard refactor (trigger + live Realtime catalog)

**Files:**
- Modify: `apex/src/components/dashboard/Dashboard.tsx`, `apex/src/App.tsx`
- Test: `apex/src/components/dashboard/Dashboard.test.tsx`

**Steps:**
- [ ] **Step 1: Swap data sources** — replace `StorageService`/`StoryGeneratorService`/`useAiConfig` imports with `CatalogService` and `useAuth`. State becomes `stories: StoryRecord[]`. On mount: `CatalogService.listStories()` → state, then `CatalogService.subscribeToStories(user.id, onChange)`; remove the channel on unmount.
- [ ] **Step 2: Reconcile Realtime events** — `onChange(payload)`: on `INSERT` prepend the new row (dedupe by `id`); on `UPDATE` replace the matching row (drives live `progress_step`/`progress_pct` and the `ready`/`failed` transition); on `DELETE` remove it.
- [ ] **Step 3: Make submit non-blocking** — `handleGenerate`: call `await CatalogService.createStory({ animalA, animalB, artStyle, fierceMode })`, then immediately clear the form and reset art style/fierce mode. Do NOT block the UI — the new `generating` row arrives via Realtime (optionally optimistic-insert a placeholder keyed by the returned `storyId`). Remove the full-screen blocking generation overlay; the library remains interactive while generations run.
- [ ] **Step 4: Render status-aware cards** — extend `StoryCard` to switch on `story.status`: `generating` → progress bar (`progress_pct`) + `progress_step` text, no Read button; `ready` → cover (signed URL from `cover_image_path`) + "Read Full Book" + reveal-winner (read winner from `story.manifest.outcome`); `failed` → an error notice showing `story.error` and no Read/retry button (per Non-goal: no manual retry).
- [ ] **Step 5: Resolve cover thumbnails** — for `ready` rows with a `cover_image_path`, batch-resolve signed URLs via `CatalogService.resolveSignedUrls` (e.g., in an effect keyed by the ready rows) and pass the resolved URL to `StoryCard`.
- [ ] **Step 6: Remove the provider/model picker + the now-unused `AiConfigProvider`** — delete the `IMAGE_MODELS` map, the LLM/image provider `<select>`s, the image-model `<select>`, and all `config`/`availableProviders`/`setConfig` usage from `Dashboard.tsx`. Keep the art-style `<select>` and the Fierce Mode toggle (story options, explicitly in scope). Now that Dashboard no longer calls `useAiConfig` (Step 1), also remove `AiConfigProvider` and its `import { AiConfigProvider } from './contexts/AiConfigContext'` from `apex/src/App.tsx` (deferred here from Task 7) so the authenticated Dashboard/BookViewer subtree renders directly under `AuthProvider`. The `AiConfigContext.tsx` file itself is deleted in Task 12 once nothing imports it.
- [ ] **Step 7: Wire delete** — `handleDelete` calls `CatalogService.deleteStory(id)` with optimistic removal (keep the existing optimistic pattern; reload via `listStories` on failure).
- [ ] **Step 8: Rewrite the Dashboard test** — rewrite `apex/src/components/dashboard/Dashboard.test.tsx`: `vi.mock('../../services/CatalogService', ...)`; render inside a real or mocked `AuthProvider` supplying a `user`. Cover: empty library; `generating` row shows a `progressbar` and the `progress_step`; `ready` row shows the cover + Read button + reveal-winner; `failed` row shows the error and no Read button; submitting calls `CatalogService.createStory` with `{ animalA, animalB, artStyle, fierceMode }` and clears the form; a Realtime `UPDATE` event moves a row from `generating` to `ready`; the art-style picker still renders the six options; no LLM/image provider selector is present.
- [ ] **Step 9: Run tests** — `cd apex && npm run test:run -- src/components/dashboard/Dashboard.test.tsx` and confirm green.

**Acceptance criteria:**
- Submitting a generation returns immediately and does not block the library UI.
  Verify: `cd apex && npm run test:run -- src/components/dashboard/Dashboard.test.tsx` exits 0 with the test that asserts `CatalogService.createStory` is called and the form clears without a blocking overlay; and `grep -c "generation-overlay" apex/src/components/dashboard/Dashboard.tsx` returns `0`.
- The dashboard reflects live progress and the `ready`/`failed` transition via a Realtime subscription.
  Verify: `cd apex && npm run test:run -- src/components/dashboard/Dashboard.test.tsx` exits 0 with the test that dispatches a mocked `UPDATE` payload and asserts the card switches to the `ready` rendering; and `grep -E "subscribeToStories|progress_pct|status" apex/src/components/dashboard/Dashboard.tsx` returns at least 3 matches.
- A `failed` story shows its error and offers no retry.
  Verify: open `apex/src/components/dashboard/Dashboard.tsx` and confirm the `failed` branch renders `story.error` and contains no Read/Retry control; the Dashboard test asserts a failed row shows the error text and no "Read Full Book" button.
- The provider/model picker is gone; art style + fierce mode remain.
  Verify: `grep -E "IMAGE_MODELS|llm-provider|image-provider|image-model|useAiConfig" apex/src/components/dashboard/Dashboard.tsx` returns no matches, while `grep -E "art-style|fierce-mode" apex/src/components/dashboard/Dashboard.tsx` returns at least 2 matches.
- `AiConfigProvider` is removed from `App.tsx` now that Dashboard no longer uses `useAiConfig`, leaving the authenticated subtree wrapped only by `AuthProvider`.
  Verify: `grep -c "AiConfigProvider" apex/src/App.tsx` returns `0`, and `grep -c "AuthProvider" apex/src/App.tsx` returns a count ≥ 1.

**Model tier:** capable

---

### Task 10 — BookViewer refactor (render from Storage signed URLs)

**Files:**
- Modify: `apex/src/components/book/BookViewer.tsx`
- Test: `apex/src/components/book/BookViewer.test.tsx`

**Steps:**
- [ ] **Step 1: Load from the catalog** — replace `StorageService.getStory` with `CatalogService.getStory(storyId)`; derive the renderable manifest from `record.manifest`. Remove the `markAsRead` call (no `hasBeenRead` column in this slice) — render read-only.
- [ ] **Step 2: Collect Storage paths** — from the manifest, gather `manifest.coverImageUrl` (cover path) and every `page.imageUrl` that is a non-empty Storage path into one array.
- [ ] **Step 3: Resolve to signed URLs** — call `CatalogService.resolveSignedUrls(paths)`; build a `path → url` map in state. Render `<img src={signed[coverPath]}>` and `<img src={signed[page.imageUrl]}>`; when a path is missing/unsigned, fall back to the existing placeholder block.
- [ ] **Step 4: Preserve the reading UX** — keep `react-pageflip`, the cover/checklist/back-cover pages, keyboard arrows, and lazy-loading attributes exactly as today; only the image `src` resolution changes.
- [ ] **Step 5: Rewrite the BookViewer test** — update `apex/src/components/book/BookViewer.test.tsx`: `vi.mock('../../services/CatalogService', ...)` returning `getStory` (a `StoryRecord` whose `manifest` has `coverImageUrl: 'stories/story-1/cover.png'` and page `imageUrl: 'stories/story-1/1.png'`) and `resolveSignedUrls` (maps those paths to `https://signed/...`). Assert the cover and page `<img>` `src` equal the signed URLs; keep the existing navigation/checklist/back-cover assertions; drop the `markAsRead` assertions.
- [ ] **Step 6: Run tests** — `cd apex && npm run test:run -- src/components/book/BookViewer.test.tsx` and confirm green.

**Acceptance criteria:**
- BookViewer renders cover and page images from signed Storage URLs (not base64).
  Verify: `cd apex && npm run test:run -- src/components/book/BookViewer.test.tsx` exits 0 with assertions that the cover/page `<img>` `src` equal the mocked signed URLs; and `grep -E "resolveSignedUrls|CatalogService" apex/src/components/book/BookViewer.tsx` returns at least 2 matches.
- The flip-book reading experience (pages, checklist, navigation) is preserved.
  Verify: `cd apex && npm run test:run -- src/components/book/BookViewer.test.tsx` exits 0 with the retained checklist, back-cover ("The End"), and arrow-key navigation tests passing.
- No client code references the removed `StorageService`.
  Verify: `grep -c "StorageService" apex/src/components/book/BookViewer.tsx` returns `0`.

**Model tier:** standard

---

### Task 11 — Static hosting (Vercel) + client env config

**Files:**
- Create: `apex/vercel.json`, `apex/.env.example`
- Modify: `apex/vite.config.ts`

**Steps:**
- [ ] **Step 1: Add the SPA rewrite** — create `apex/vercel.json` with `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }` so deep links resolve to the SPA. (Build command `npm run build`, output `dist`, and root directory `apex` are configured in the Vercel project settings; note this in a comment-free companion line in `apex/README.md` in Task 12.)
- [ ] **Step 2: Remove the dev proxy** — in `apex/vite.config.ts`, delete the `server.proxy` block forwarding `/api` to `http://localhost:3000` (the Elysia proxy is gone). Keep the `react()` plugin and the `test` block.
- [ ] **Step 3: Document client env** — create `apex/.env.example` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=` plus a comment that these are public (anon key is RLS-protected) and set in Vercel project env for deploys.
- [ ] **Step 4: Verify the production build** — `cd apex && npm run build` and confirm it produces `apex/dist/index.html`.

**Acceptance criteria:**
- A Vercel SPA catch-all rewrite to `index.html` exists.
  Verify: `grep -E '"source": "/\(\.\*\)"|"destination": "/index.html"' apex/vercel.json` returns 2 matches.
- The `/api` dev proxy is removed from the Vite config.
  Verify: `grep -c "localhost:3000" apex/vite.config.ts` returns `0`, and `grep -c "proxy" apex/vite.config.ts` returns `0`.
- The client documents only public Supabase env vars and builds successfully.
  Verify: `grep -E "VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY" apex/.env.example` returns 2 matches, and `cd apex && npm run build` exits 0 producing `apex/dist/index.html` (confirm `ls apex/dist/index.html`).

**Model tier:** efficient

---

### Task 12 — Retire the Elysia proxy + update docs

**Files:**
- Delete: `server/` (entire directory), `apex/src/services/StorageService.ts`, `apex/src/services/StorageService.test.ts`, `apex/src/services/LlmService.ts`, `apex/src/services/LlmService.test.ts`, `apex/src/services/ImageService.ts`, `apex/src/services/ImageService.test.ts`, `apex/src/services/StoryGeneratorService.ts`, `apex/src/services/StoryGeneratorService.test.ts`, `apex/src/contexts/AiConfigContext.tsx`, `apex/src/contexts/AiConfigContext.test.tsx`
- Modify: `apex/package.json`, `README.md`, `apex/README.md`

**Steps:**
- [ ] **Step 1: Confirm relocation + consumer refactors are complete** — verify the adapters/types now live under `trigger/src/providers/` (Task 3) and the client no longer calls `/api/*` (Tasks 7–10). Grep `apex/src` to be sure no code references `/api/llm`, `/api/image`, or `/api/providers`, AND confirm the consumers were already migrated off the legacy modules: `grep -rln "StoryGeneratorService\|StorageService\|LlmService\|ImageService\|AiConfigContext\|useAiConfig" apex/src/components apex/src/App.tsx` returns no matches (Dashboard from Task 9, BookViewer from Task 10, and App.tsx from Tasks 7/9 are clean before deletion).
- [ ] **Step 2: Delete the obsolete client services + contexts** — now that no consumer imports them, remove `StorageService`, `LlmService`, `ImageService`, `StoryGeneratorService`, `AiConfigContext` and all their `.test`/`.test.tsx` files (the provider-calling logic moved to `trigger/` in Tasks 3–4; storage/catalog moved to `CatalogService` in Task 8; AiConfig was dropped). With `StorageService` (the only `localforage` importer) now gone, remove the `"localforage"` entry from `apex/package.json` `dependencies` (deferred here from Task 7) and run `cd apex && npm install` to prune it from the lockfile. Then run `cd apex && npx tsc -b` and confirm exit 0 with no dangling imports of the removed modules.
- [ ] **Step 3: Delete the proxy** — remove the entire `server/` directory (Elysia app, routes, providers, tests, `node_modules`, `.env`, `.env.example`).
- [ ] **Step 4: Update the root README** — in `README.md`, replace the "powered by Google Gemini" line and the architecture pointer with the four-tier stack (Vercel SPA + Supabase + Trigger.dev), and note generation runs server-side in a durable task.
- [ ] **Step 5: Rewrite the apex README architecture** — in `apex/README.md`, replace the IndexedDB/Gemini-proxy sections (Service Layer, Generation Pipeline, "Offline Persistence" feature, Environment Variables) with: catalog via Supabase/PostgREST + RLS, generation via the Trigger.dev `generate-story` task, images in Supabase Storage rendered via signed URLs, Realtime progress, and the `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` env vars. Note that provider keys live in Trigger.dev and the service-role/Trigger secret keys live in the Edge Function env.
- [ ] **Step 6: Final repo-wide check** — grep the repo for `localforage`, `Elysia`, and `/api/llm` to confirm no lingering references in shipped code (docs/historical specs excepted).

**Acceptance criteria:**
- The Elysia proxy directory is fully removed.
  Verify: `ls server 2>&1` reports "No such file or directory".
- The obsolete client generation/storage/config modules are deleted and the client tree typechecks with no dangling imports of them.
  Verify: `ls apex/src/services/StorageService.ts apex/src/services/LlmService.ts apex/src/services/ImageService.ts apex/src/services/StoryGeneratorService.ts apex/src/contexts/AiConfigContext.tsx 2>&1` reports every path as "No such file or directory"; `cd apex && npx tsc -b` exits 0; and `grep -rn "StoryGeneratorService\|StorageService\|LlmService\|ImageService\|AiConfigContext" apex/src --include=*.ts --include=*.tsx` returns no matches.
- No client code calls provider APIs directly.
  Verify: `grep -rn "/api/llm\|/api/image\|/api/providers" apex/src` returns no matches.
- No shipped code or the client manifest references IndexedDB/localforage or Elysia.
  Verify: `grep -rn "localforage" apex/src` returns no matches, `grep -c "localforage" apex/package.json` returns `0` (the dependency was removed in Step 2 once `StorageService` was deleted), and `grep -rn "elysia" apex/src trigger/src` (case-insensitive via `-i`) returns no matches.
- The READMEs describe the new four-tier architecture.
  Verify: `grep -iE "supabase|trigger.dev" README.md apex/README.md` returns at least 2 matches across the two files, and `grep -ic "indexeddb" apex/README.md` returns `0`.

**Model tier:** efficient

---

## Dependencies

```
- Task 2  depends on: Task 1
- Task 4  depends on: Task 3
- Task 5  depends on: Task 4, Task 1, Task 2
- Task 6  depends on: Task 1, Task 5
- Task 7  depends on: Task 1
- Task 8  depends on: Task 7, Task 6, Task 4, Task 2, Task 1
- Task 9  depends on: Task 8, Task 6, Task 7
- Task 10 depends on: Task 8
- Task 11 depends on: Task 9, Task 10
- Task 12 depends on: Task 3, Task 8, Task 9, Task 10
```

Parallelizable fronts after Task 1: the Trigger.dev track (3 → 4 → 5), the Supabase track (2), and the client-auth track (7) can proceed concurrently; they converge at Tasks 8–9.

## Risk Assessment

- **Trigger.dev has no `step.run()` memoization (deviation from spec prose).** The
  spec describes "checkpointed `step.run()`" resuming mid-pipeline. Trigger.dev v4
  retries re-invoke `run` from the top. *Mitigation / chosen approach:* idempotent
  checkpoint persistence — narrative phases persist to `stories.manifest` and are
  skipped on re-run; each image checks Storage and is skipped if present (Task 4
  Steps 5–6, Task 5). This delivers the spec's cost-resumption intent (re-pay only
  for steps after the last checkpoint). Recorded here per the planning deviation
  rule; the spec had no formal `## Approach` section, so the macro approach was
  chosen from codebase analysis.
- **Deno Edge Function ↔ Trigger.dev compatibility.** The Node `@trigger.dev/sdk`
  may not run cleanly under Deno. *Mitigation:* the Edge Function triggers the task
  via the documented REST endpoint (`POST /api/v1/tasks/generate-story/trigger`)
  using `fetch` + `TRIGGER_SECRET_KEY` (Task 6 Step 6), avoiding the SDK in Deno.
- **Type duplication drift.** `story.types.ts` and `artStyle.ts` are copied into
  `trigger/`. *Mitigation:* both copies carry a "keep in sync" header (Task 3
  Steps 4–5); the JSON contract is enforced at runtime by the pipeline test
  asserting the manifest shape, and a follow-up slice can extract a shared package.
- **Realtime + RLS delivery.** `postgres_changes` must be RLS-filtered to the owner
  and the table must be in the publication with full replica identity.
  *Mitigation:* Task 2 adds the table to `supabase_realtime` and sets
  `replica identity full`; the client filters with `owner_id=eq.<uid>` (Task 8
  Step 4); cross-user isolation is part of the manual RLS verification below.
- **gpt-image-2 rate limits / cost.** *Mitigation:* `pLimit(2)` + 15s
  inter-request delay (Task 4 Step 7), quality pinned to `medium` (Tasks 5/6),
  and skip-if-exists so retries don't re-pay for completed images.
- **Storage object cleanup on delete.** `deleteStory` removes the row but not the
  Storage objects in this slice. *Mitigation:* documented as deferred (Task 8
  Step 6); orphaned objects remain readable only by the owner under Storage RLS and
  can be reaped by a later maintenance job.
- **Integration/RLS acceptance criteria need a live environment.** Several spec
  acceptance criteria (sign-in flow, tab-close durability, two-device parity,
  concurrent runs, cross-user RLS, provider-dashboard userId tagging) require a
  deployed Supabase + Trigger.dev environment and cannot be unit-tested.
  *Mitigation — documented end-to-end verification (run after deploy):*
  1. **Auth + empty library:** sign in via magic link and via Google in a fresh
     account; confirm the library renders empty.
  2. **Async generation + live progress:** submit a generation; confirm the call
     returns immediately, a `generating` card appears with an advancing progress
     bar, and the library stays interactive.
  3. **Durability:** close the tab mid-generation, reopen later; confirm the story
     is still `generating` or has become `ready` (generation did not stop).
  4. **Concurrency:** start two generations within a few seconds; confirm both
     progress as independent Trigger.dev runs.
  5. **Persistence + Storage:** when `ready`, run
     `select manifest->>'coverImageUrl' from stories where id='<id>';` and confirm
     it is a `stories/{id}/cover.png` path (not a base64 data URI); list the
     `story-images` bucket and confirm `stories/{id}/cover.png` + page objects
     exist; open the book and confirm images render.
  6. **Multi-device:** sign in as the same user in a second browser; confirm the
     same library appears.
  7. **RLS isolation:** as user B, run
     `select count(*) from stories where owner_id='<userA-id>';` through a
     user-B-scoped client and confirm `0`; attempt `createSignedUrl` on user A's
     object path as user B and confirm it errors/returns null. Also confirm the
     policies exist: `select policyname from pg_policies where tablename='stories';`
     lists the four owner policies.
  8. **Spend tagging:** after a generation, confirm in the OpenAI dashboard the
     image requests carry the `user` field and in the Anthropic console the
     messages carry `metadata.user_id` equal to the owner's UUID.
  9. **Terminal failure:** force a failure (e.g., temporarily invalid provider
     key); confirm the story reaches `failed` with its error shown read-only and
     no retry control.

## Test Command

```bash
cd apex && npm run test:run
```

(The Trigger.dev project has its own suite — `cd trigger && bun test` — invoked by
the Task 3/4/5 `Verify:` recipes. The Supabase migrations and Edge Function are
validated via the `supabase` CLI and file-content recipes in Tasks 1, 2, and 6.)

---

## Self-Review

**Spec coverage:**
- Move pipeline into a durable Trigger.dev task → Tasks 4, 5. ✓
- Persist catalog to Postgres + images to Storage; remove IndexedDB → Tasks 1, 2, 5, 8 (`StorageService` superseded by `CatalogService`; the legacy client modules are deleted in Task 12, after their consumers are refactored in Tasks 9–10). ✓
- Minimal Supabase Auth + RLS from day one → Tasks 1 (RLS), 7 (Auth UI). ✓
- `create-story` Edge Function (verify, insert, trigger) → Task 6. ✓
- Refactor web client (auth, trigger, read catalog, watch progress, render from Storage) → Tasks 7, 8, 9, 10. ✓
- Retire Elysia proxy; relocate adapters → Tasks 3 (relocate), 12 (delete). ✓
- Static web host (Vercel) + SPA catch-all → Task 11. ✓
- OpenAI image adapter gains `quality` → Task 3. ✓
- userId tagging (OpenAI `user`, Anthropic `metadata.user_id`) → Tasks 3, 4, 5. ✓
- p-limit 2 + 15s OpenAI bound → Task 4. ✓
- Signed-URL storage strategy → Tasks 8, 10. ✓
- Realtime publication + RLS filtering → Tasks 2, 8, 9. ✓
- Terminal `failed` shown read-only, no manual retry → Tasks 5, 9. ✓
- Default models Claude Sonnet 4 + gpt-image-2 (medium); no in-UI model picker → Tasks 3, 5, 6 (defaults), 9 (picker removed). ✓
- Deferred items (pods/`pod_id`, spend dashboard, mobile, local migration) correctly NOT built; `pod_id` reserved only in a comment (Task 1). ✓
- Non-goals respected: book content/26-page format/art-style/surprise logic ported unchanged (Task 4 preserves them); IndexedDB removed not repurposed (Task 8). ✓

**Placeholder scan:** No "TBD"/"implement later"/"similar to Task N". Every step states concrete content (column names, SQL predicates, function/method names, file paths). Every acceptance criterion is followed by its own `Verify:` line with a reproducible command or named-file content check.

**Type consistency:** `StoryRecord`/`StoryStatus` (Task 8) match the `stories` columns (Task 1). `GenerateStoryPayload`/`GenerationConfig` are consistent across the Edge Function payload (Task 6), the pipeline (Task 4), and the task (Task 5). `IStoryManifest` is shared (duplicated) between `apex/` and `trigger/` with image fields as Storage paths. Provider `LlmRequest`/`ImageRequest` gain `userId` (+ `quality` for images) consistently in the relocated `types.ts` and both adapters (Task 3).
