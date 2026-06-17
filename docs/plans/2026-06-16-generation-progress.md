# Apex Generation Progress "Press Room" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the generation wait into an on-brand "watch it being made" experience: an enhanced on-the-press shelf card that opens a focused, leavable Press Room, fed by a canonical `progress` representation, with a resume-cheap "Try again" for failed books.

**Architecture:** Two phases on one branch. Phase 1 lands the canonical progress contract in the backend: the pipeline (`trigger/`) emits a normalized `StoryProgress` value, persisted in a single `progress jsonb` column (replacing `progress_step` + `progress_pct`), plus a new `retry-story` Edge Function that resumes from the existing checkpoint. Phase 2 builds the two app tiers (`apex/`): a `describeProgress` module that owns all display copy and the derived percent, an enhanced `StoryCard` (the generating and failed treatments), a new `PressRoom` overlay (setting the press, the Press Bed, binding, the develop-in reveal, the press-jammed state), and the `Dashboard` wiring (watch state, the overlay, and retry). A final task runs every gate and screenshots the real UI.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + Testing Library (`apex`); Bun test (`trigger`); Deno test (`supabase/functions`); Supabase (Postgres + Edge Functions + Realtime); Trigger.dev; lucide-react; plain CSS with `--apex-*` custom properties (no Tailwind).

## Global Constraints

Every task's requirements implicitly include these, copied from the spec:

- **No em dashes** anywhere in copy, UI text, code comments, or docs. Use commas, parentheses, colons, or restructure. Verify with `grep` before finishing.
- **No Tailwind.** Plain CSS plus the `--apex-*` variables, per-component CSS files.
- **Non-blocking generation is preserved.** No full-screen blocking overlay that traps the user. The Press Room is opt-in and leavable; submitting still drops the user on the shelf.
- **Canonical progress contract:** the pipeline emits `StoryProgress`; the client owns the display words and derives the percent. The two `StoryProgress` definitions (`apex` and `trigger`) must stay structurally identical.
- **`StoryProgress` shape (verbatim):**
  ```ts
  export type StoryProgress =
    | { phase: 'queued' }
    | { phase: 'researching' }
    | { phase: 'designing' }
    | { phase: 'simulating' }
    | { phase: 'illustrating'; page: number; total: number }
    | { phase: 'binding' };
  ```
- **Percent curve (lives only in `describeProgress`):** queued 0, researching 5, designing 10, simulating 15, illustrating `min(95, round(25 + (page/total)*70))`, binding 98, ready 100.
- **Accessibility floor:** progress exposes `role="progressbar"` with `aria-valuenow`; a polite live region announces beat changes; the failed reason uses `role="alert"`; the Press Room is a labeled, focus-managed overlay with `Esc` to exit and focus restored on close; visible forest `:focus-visible` rings; decorative glyphs `aria-hidden`.
- **Reduced motion:** gate every animation (sweep, plate ink-in, develop-in, binding) behind `@media (prefers-reduced-motion: no-preference)`.
- **Clean schema, no deployed DB:** edit the original migration in place rather than stacking an ALTER; rebuild locally with `supabase db reset` to verify.

---

## File Structure

Phase 1 (backend):

- **Modify** `trigger/src/types/story.types.ts`: add the `StoryProgress` union.
- **Modify** `trigger/src/lib/db.ts`: `updateProgress(client, storyId, progress)` writes `{ progress }`; `finalize` drops `progress_pct`.
- **Modify** `trigger/src/lib/pipeline.ts`: `PipelineDeps.db.updateProgress(storyId, progress)`; emit canonical values at the six sites.
- **Modify** `trigger/src/trigger/generateStory.ts`: update the `updateProgress` adapter binding.
- **Modify** `trigger/src/lib/__tests__/pipeline.test.ts` and `trigger/src/lib/__tests__/db.test.ts`.
- **Modify** `supabase/migrations/20260614000001_create_stories.sql`: replace `progress_step`/`progress_pct` with `progress jsonb`.
- **Modify** `supabase/functions/create-story/index.ts` and `index.test.ts`: insert `progress: { phase: 'queued' }`.
- **Create** `supabase/functions/retry-story/index.ts`, `deno.json`, `index.test.ts`.

Phase 2 (app, `apex/`):

- **Modify** `apex/src/types/story.types.ts`: add `StoryProgress`; change `StoryRecord.progress`.
- **Modify** `apex/src/test/fixtures.ts`: `createMockStoryRecord` uses `progress`.
- **Create** `apex/src/components/dashboard/describeProgress.ts` and `describeProgress.test.ts`.
- **Modify** `apex/src/components/dashboard/StoryCard.tsx` and `StoryCard.test.tsx`: enhanced generating + failed treatments.
- **Create** `apex/src/components/dashboard/PressRoom.tsx`, `PressRoom.css`, `PressRoom.test.tsx`.
- **Modify** `apex/src/services/CatalogService.ts`: add `retryStory`.
- **Modify** `apex/src/components/dashboard/Dashboard.tsx` and `Dashboard.test.tsx`: watch state, overlay, retry.
- **Modify** `apex/src/components/dashboard/Dashboard.css`: enhanced card styles.

Phase 3:

- **Create (temporary, never committed)** `apex/preview.html`, `apex/src/preview.tsx`.

---

## Phase 1: Backend canonical progress

## Task 1: Emit canonical progress from the pipeline (`trigger/`)

**Files:**
- Modify: `trigger/src/types/story.types.ts`
- Modify: `trigger/src/lib/db.ts`
- Modify: `trigger/src/lib/pipeline.ts`
- Modify: `trigger/src/trigger/generateStory.ts`
- Test: `trigger/src/lib/__tests__/db.test.ts`, `trigger/src/lib/__tests__/pipeline.test.ts`

**Interfaces:**
- Produces: `StoryProgress` (the union above); `updateProgress(client, storyId, progress: StoryProgress): Promise<void>`; `PipelineDeps.db.updateProgress(storyId: string, progress: StoryProgress): Promise<void>`.

- [ ] **Step 1: Add the `StoryProgress` type**

In `trigger/src/types/story.types.ts`, append:

```ts
/**
 * Canonical, normalized generation progress. The pipeline owns the phase and the
 * page/total during illustration; the client owns the display copy and percent.
 * Terminal states live on the row `status` ('ready' | 'failed'), not here.
 * Keep this structurally identical to the copy in apex/src/types/story.types.ts.
 */
export type StoryProgress =
  | { phase: 'queued' }
  | { phase: 'researching' }
  | { phase: 'designing' }
  | { phase: 'simulating' }
  | { phase: 'illustrating'; page: number; total: number }
  | { phase: 'binding' };
```

- [ ] **Step 2: Update the failing db tests**

In `trigger/src/lib/__tests__/db.test.ts`, replace the `updateProgress` and `finalize` test cases with:

```ts
  it('updateProgress issues an update with the canonical progress', async () => {
    const { client, calls } = createFakeClient();
    await updateProgress(client, 'story-1', { phase: 'illustrating', page: 7, total: 14 });
    expect(calls.table).toBe('stories');
    expect(calls.id).toBe('story-1');
    expect(calls.payload).toEqual({ progress: { phase: 'illustrating', page: 7, total: 14 } });
  });

  it('finalize sets status=ready with manifest and title and no percent', async () => {
    const { client, calls } = createFakeClient();
    const manifest = { metadata: { title: 'Lion vs Bear' } } as unknown as IStoryManifest;
    await finalize(client, 'story-2', manifest, 'Lion vs Bear');
    expect(calls.id).toBe('story-2');
    expect(calls.payload?.status).toBe('ready');
    expect(calls.payload?.title).toBe('Lion vs Bear');
    expect(calls.payload?.manifest).toBe(manifest);
    expect(calls.payload).not.toHaveProperty('progress_pct');
  });
```

- [ ] **Step 3: Run db tests to verify they fail**

Run: `cd trigger && bun test src/lib/__tests__/db.test.ts`
Expected: FAIL (updateProgress still writes `progress_step`/`progress_pct`).

- [ ] **Step 4: Update `db.ts`**

In `trigger/src/lib/db.ts`, change the import and the two functions:

```ts
import type { IStoryManifest, StoryProgress } from '../types/story.types';
```

```ts
/** Write the live canonical progress so Realtime subscribers see it. */
export async function updateProgress(
  client: SupabaseClient,
  storyId: string,
  progress: StoryProgress,
): Promise<void> {
  const { error } = await client
    .from('stories')
    .update({ progress })
    .eq('id', storyId);
  if (error) throw error;
}
```

In `finalize`, change the update payload from `{ manifest, title, status: 'ready', progress_pct: 100 }` to:

```ts
    .update({ manifest, title, status: 'ready' })
```

- [ ] **Step 5: Update the pipeline progress sites**

In `trigger/src/lib/pipeline.ts`:

Add to the type import at the top (the existing import from `../types/story.types`):

```ts
import {
  IStoryManifest,
  IBattleOutcome,
  IAnimalEntity,
  IPageContent,
  ITraitChecklist,
  StoryProgress,
} from '../types/story.types';
```

Change the `PipelineDeps.db.updateProgress` signature:

```ts
    updateProgress(storyId: string, progress: StoryProgress): Promise<void>;
```

Replace the six emission calls (the prose strings) with canonical values:

```ts
await deps.db.updateProgress(storyId, { phase: 'researching' });
```
```ts
await deps.db.updateProgress(storyId, { phase: 'designing' });
```
```ts
await deps.db.updateProgress(storyId, { phase: 'simulating' });
```

For the illustration start, hoist `total` above the call so the client learns the page count immediately. Replace:

```ts
  // 5. Generate page images (skip-if-exists), bounded for the OpenAI path.
  await deps.db.updateProgress(storyId, 'Illustrating pages...', 25);
  const limit = pLimit(2);
  let completed = 0;
  const total = rawPages.length;
```

with:

```ts
  // 5. Generate page images (skip-if-exists), bounded for the OpenAI path.
  const total = rawPages.length;
  await deps.db.updateProgress(storyId, { phase: 'illustrating', page: 0, total });
  const limit = pLimit(2);
  let completed = 0;
```

Replace the per-page progress call:

```ts
        completed++;
        await deps.db.updateProgress(storyId, { phase: 'illustrating', page: completed, total });
```

Replace the save call:

```ts
  // 6. Assemble the manifest (Storage paths in image fields, never base64).
  await deps.db.updateProgress(storyId, { phase: 'binding' });
```

- [ ] **Step 6: Update the `generateStory` adapter binding**

In `trigger/src/trigger/generateStory.ts`, change the `db.updateProgress` binding:

```ts
        updateProgress: (storyId, progress) => updateProgress(client, storyId, progress),
```

- [ ] **Step 7: Update the pipeline progress test**

In `trigger/src/lib/__tests__/pipeline.test.ts`:

Add the type import near the top:

```ts
import type { StoryProgress } from '../../types/story.types';
```

In `makeDeps`, change the `progressCalls` collection and the `updateProgress` mock:

```ts
  const progressCalls: StoryProgress[] = [];
```
```ts
    updateProgress: mock(async (_id: string, progress: StoryProgress) => {
      progressCalls.push(progress);
    }),
```

Replace the `it('calls updateProgress at the milestone steps with integer percentages', ...)` test with:

```ts
  it('emits the canonical progress phases in order, with per-page page/total', async () => {
    const { deps, progressCalls } = makeDeps();
    await runGenerationPipeline(deps, PAYLOAD);

    const phases = progressCalls.map((p) => p.phase);
    expect(phases).toContain('researching');
    expect(phases).toContain('designing');
    expect(phases).toContain('simulating');
    expect(phases).toContain('illustrating');
    expect(phases).toContain('binding');

    const illustrating = progressCalls.filter(
      (p): p is Extract<StoryProgress, { phase: 'illustrating' }> => p.phase === 'illustrating',
    );
    // A "start" at page 0 plus one per finished page (14), all carrying total 14.
    expect(illustrating.every((p) => p.total === 14)).toBe(true);
    const pages = illustrating.map((p) => p.page).sort((a, b) => a - b);
    expect(pages).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

    // Binding is the last progress emitted before finalize.
    expect(progressCalls[progressCalls.length - 1]).toEqual({ phase: 'binding' });
  });
```

- [ ] **Step 8: Run the full trigger suite**

Run: `cd trigger && bun test && bun run typecheck`
Expected: PASS (all pipeline and db tests green, no type errors).

- [ ] **Step 9: Commit**

```bash
git add trigger/src/types/story.types.ts trigger/src/lib/db.ts trigger/src/lib/pipeline.ts trigger/src/trigger/generateStory.ts trigger/src/lib/__tests__/db.test.ts trigger/src/lib/__tests__/pipeline.test.ts
git commit -m "feat(progress): emit canonical StoryProgress from the pipeline"
```

---

## Task 2: The `progress jsonb` column and create-story insert (`supabase/`)

**Files:**
- Modify: `supabase/migrations/20260614000001_create_stories.sql`
- Modify: `supabase/functions/create-story/index.ts`
- Test: `supabase/functions/create-story/index.test.ts`

**Interfaces:**
- Produces: the `stories.progress jsonb` column; a `generating` row inserted with `progress: { phase: 'queued' }`.

- [ ] **Step 1: Migrate the column**

In `supabase/migrations/20260614000001_create_stories.sql`, replace these two lines:

```sql
  progress_step text,
  progress_pct int not null default 0,
```

with:

```sql
  progress jsonb,
```

- [ ] **Step 2: Capture the inserted row in the create-story test**

In `supabase/functions/create-story/index.test.ts`, change `makeFakeSupabase` to record the inserted row:

```ts
function makeFakeSupabase() {
  const updates: Array<Record<string, unknown>> = [];
  const inserted: Array<Record<string, unknown>> = [];
  const client = {
    auth: {
      // deno-lint-ignore require-await
      getUser: async (_jwt: string) => ({ data: { user: { id: "user-123" } }, error: null }),
    },
    from(_table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return {
            select(_cols: string) {
              return {
                // deno-lint-ignore require-await
                single: async () => ({ data: { id: "story-456" }, error: null }),
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return {
            // deno-lint-ignore require-await
            eq: async (_col: string, _val: string) => ({ data: null, error: null }),
          };
        },
      };
    },
  };
  return { client, updates, inserted };
}
```

Add a test:

```ts
Deno.test("inserts a generating row with canonical queued progress", async () => {
  const { client, inserted } = makeFakeSupabase();
  const deps = makeDeps({
    // deno-lint-ignore no-explicit-any
    createClient: (() => client) as any,
    fetch: () => Promise.resolve(new Response(null, { status: 200 })),
  });

  await handleRequest(makeRequest(), deps);

  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].status, "generating");
  assertEquals(inserted[0].progress, { phase: "queued" });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd supabase/functions/create-story && deno test -A`
Expected: FAIL (the insert still sets `progress_step`/`progress_pct`).

- [ ] **Step 4: Update the create-story insert**

In `supabase/functions/create-story/index.ts`, replace in the `.insert({ ... })` object:

```ts
      progress_step: "Queued…",
      progress_pct: 0,
```

with:

```ts
      progress: { phase: "queued" },
```

- [ ] **Step 5: Run the create-story tests**

Run: `cd supabase/functions/create-story && deno test -A`
Expected: PASS (all four tests, including the new insert assertion).

- [ ] **Step 6: Verify the migration applies**

Run (requires the local Supabase stack / Docker): `supabase db reset`
Expected: migrations apply cleanly; `public.stories` has a `progress jsonb` column and no `progress_step`/`progress_pct`. If the local stack is unavailable, confirm by inspection that no other migration or policy references the dropped columns (`grep -rn "progress_step\|progress_pct" supabase/` returns nothing).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260614000001_create_stories.sql supabase/functions/create-story/index.ts supabase/functions/create-story/index.test.ts
git commit -m "feat(progress): store canonical progress in a jsonb column"
```

---

## Task 3: The `retry-story` Edge Function (`supabase/`)

**Files:**
- Create: `supabase/functions/retry-story/index.ts`
- Create: `supabase/functions/retry-story/deno.json`
- Test: `supabase/functions/retry-story/index.test.ts`

**Interfaces:**
- Consumes: the `generate-story` Trigger.dev task (re-triggered by REST); the `stories` row columns `owner_id`, `status`, `animal_a`, `animal_b`, `art_style`, `fierce_mode`.
- Produces: `POST { storyId } -> { storyId }`; resets a failed, owned row to `generating` and re-enqueues generation (resuming from checkpoint).

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/retry-story/index.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest, type Deps } from "./index.ts";

interface FakeOptions {
  user?: { id: string } | null;
  story?: Record<string, unknown> | null;
}

function makeFakeSupabase(opts: FakeOptions = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const story = opts.story === undefined
    ? { id: "story-1", owner_id: "user-123", status: "failed", animal_a: "cat", animal_b: "dog", art_style: "surprise", fierce_mode: false }
    : opts.story;
  const user = opts.user === undefined ? { id: "user-123" } : opts.user;

  const client = {
    auth: {
      // deno-lint-ignore require-await
      getUser: async (_jwt: string) => ({ data: { user }, error: user ? null : { message: "bad token" } }),
    },
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                // deno-lint-ignore require-await
                single: async () => ({ data: story, error: story ? null : { message: "not found" } }),
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return {
            // deno-lint-ignore require-await
            eq: async (_col: string, _val: string) => ({ data: null, error: null }),
          };
        },
      };
    },
  };
  return { client, updates };
}

function makeDeps(client: unknown, overrides: Partial<Deps> = {}): Deps {
  return {
    // deno-lint-ignore no-explicit-any
    createClient: (() => client) as any,
    fetch: () => Promise.resolve(new Response(null, { status: 200 })),
    env: (_key: string) => "test",
    ...overrides,
  };
}

function makeRequest(body: unknown = { storyId: "story-1" }) {
  return new Request("https://example.com/retry-story", {
    method: "POST",
    headers: { Authorization: "Bearer fake-jwt", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("missing JWT returns 401", async () => {
  const { client } = makeFakeSupabase();
  const req = new Request("https://example.com/retry-story", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storyId: "story-1" }),
  });
  const res = await handleRequest(req, makeDeps(client));
  assertEquals(res.status, 401);
});

Deno.test("retrying a non-failed story returns 409 and does not reset", async () => {
  const { client, updates } = makeFakeSupabase({
    story: { id: "story-1", owner_id: "user-123", status: "generating", animal_a: "cat", animal_b: "dog", art_style: "surprise", fierce_mode: false },
  });
  const res = await handleRequest(makeRequest(), makeDeps(client));
  assertEquals(res.status, 409);
  assertEquals(updates.length, 0);
});

Deno.test("retrying another owner's story returns 403", async () => {
  const { client } = makeFakeSupabase({
    story: { id: "story-1", owner_id: "someone-else", status: "failed", animal_a: "cat", animal_b: "dog", art_style: "surprise", fierce_mode: false },
  });
  const res = await handleRequest(makeRequest(), makeDeps(client));
  assertEquals(res.status, 403);
});

Deno.test("valid failed retry resets the row, re-triggers, returns 200", async () => {
  const { client, updates } = makeFakeSupabase();
  const res = await handleRequest(makeRequest(), makeDeps(client, {
    fetch: () => Promise.resolve(new Response(null, { status: 200 })),
  }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { storyId: "story-1" });
  assertEquals(updates[0].status, "generating");
  assertEquals(updates[0].error, null);
  assertEquals(updates[0].progress, { phase: "queued" });
  assertEquals(updates.length, 1); // no rollback on success
});

Deno.test("trigger failure rolls the row back to failed, returns 502", async () => {
  const { client, updates } = makeFakeSupabase();
  const res = await handleRequest(makeRequest(), makeDeps(client, {
    fetch: () => Promise.resolve(new Response(null, { status: 500 })),
  }));
  assertEquals(res.status, 502);
  assertEquals(updates[0].status, "generating");
  assertEquals(updates[updates.length - 1].status, "failed");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd supabase/functions/retry-story && deno test -A`
Expected: FAIL ("Module not found ./index.ts").

- [ ] **Step 3: Write the function**

Create `supabase/functions/retry-story/deno.json`:

```json
{
  "imports": {
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@2"
  }
}
```

Create `supabase/functions/retry-story/index.ts`:

```ts
import { createClient as defaultCreateClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Injectable dependencies so the handler can be exercised in tests without a
// live Supabase project, Trigger.dev endpoint, or Deno.env configuration.
export interface Deps {
  createClient: typeof defaultCreateClient;
  fetch: typeof fetch;
  env: (key: string) => string | undefined;
}

const defaultDeps: Deps = {
  createClient: defaultCreateClient,
  fetch: (input, init) => fetch(input, init),
  env: (key) => Deno.env.get(key),
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleRequest(req: Request, deps: Deps = defaultDeps): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const jwt = authHeader?.replace("Bearer ", "");
  if (!jwt) {
    return json({ error: "Missing authorization header" }, 401);
  }

  const supabase = deps.createClient(
    deps.env("SUPABASE_URL")!,
    deps.env("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return json({ error: "Invalid or expired token" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const storyId = body.storyId;
  if (!storyId || typeof storyId !== "string") {
    return json({ error: "storyId is required and must be a string" }, 400);
  }

  // Service role bypasses RLS, so verify ownership and the failed status here.
  const { data: story, error: loadError } = await supabase
    .from("stories")
    .select("id, owner_id, status, animal_a, animal_b, art_style, fierce_mode")
    .eq("id", storyId)
    .single();

  if (loadError || !story) {
    return json({ error: "Story not found" }, 404);
  }
  if (story.owner_id !== user.id) {
    return json({ error: "Not your story" }, 403);
  }
  if (story.status !== "failed") {
    return json({ error: "Only a failed story can be retried" }, 409);
  }

  // Reset so the shelf shows it generating again; the pipeline resumes from the
  // manifest checkpoint and skips images already in Storage, so this is cheap.
  const { error: resetError } = await supabase
    .from("stories")
    .update({ status: "generating", error: null, progress: { phase: "queued" } })
    .eq("id", storyId);
  if (resetError) {
    return json({ error: "Failed to reset story" }, 500);
  }

  const triggerApiUrl = deps.env("TRIGGER_API_URL") ?? "https://api.trigger.dev";
  let triggerResponse: Response;
  try {
    triggerResponse = await deps.fetch(
      `${triggerApiUrl}/api/v1/tasks/generate-story/trigger`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deps.env("TRIGGER_SECRET_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payload: {
            storyId: story.id,
            ownerId: user.id,
            animalA: story.animal_a,
            animalB: story.animal_b,
            options: { artStyle: story.art_style, fierceMode: story.fierce_mode },
            generationConfig: {
              textModel: "claude-sonnet-4-20250514",
              imageModel: "gpt-image-2",
              imageQuality: "medium",
            },
          },
        }),
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("stories")
      .update({ status: "failed", error: `Failed to re-enqueue generation: ${message}` })
      .eq("id", story.id);
    return json({ error: "Failed to enqueue generation task" }, 502);
  }

  if (!triggerResponse.ok) {
    await supabase
      .from("stories")
      .update({ status: "failed", error: "Failed to re-enqueue generation" })
      .eq("id", story.id);
    return json({ error: "Failed to enqueue generation task" }, 502);
  }

  return json({ storyId: story.id }, 200);
}

if (import.meta.main) {
  Deno.serve((req: Request) => handleRequest(req));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd supabase/functions/retry-story && deno test -A`
Expected: PASS (all five tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/retry-story/
git commit -m "feat(progress): add the retry-story Edge Function (resume-cheap retry)"
```

---

## Phase 2: The app (`apex/`)

## Task 4: The `describeProgress` mapping module

**Files:**
- Modify: `apex/src/types/story.types.ts`
- Create: `apex/src/components/dashboard/describeProgress.ts`
- Test: `apex/src/components/dashboard/describeProgress.test.ts`

**Interfaces:**
- Produces: `StoryProgress` (apex copy); `ProgressView { phase, label, pct, page?, total? }`; `describeProgress(status: StoryStatus, progress: StoryProgress | null): ProgressView`.

- [ ] **Step 1: Add the apex `StoryProgress` type**

In `apex/src/types/story.types.ts`, immediately above the `StoryStatus` type, add:

```ts
/**
 * Canonical, normalized generation progress stored in `stories.progress`.
 * Keep this structurally identical to the copy in trigger/src/types/story.types.ts.
 */
export type StoryProgress =
  | { phase: 'queued' }
  | { phase: 'researching' }
  | { phase: 'designing' }
  | { phase: 'simulating' }
  | { phase: 'illustrating'; page: number; total: number }
  | { phase: 'binding' };
```

- [ ] **Step 2: Write the failing test**

Create `apex/src/components/dashboard/describeProgress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeProgress } from './describeProgress';

describe('describeProgress', () => {
  it('maps the warmup phases to their beats and percents', () => {
    expect(describeProgress('generating', { phase: 'queued' })).toMatchObject({ label: 'Queued', pct: 0 });
    expect(describeProgress('generating', { phase: 'researching' })).toMatchObject({ label: 'Studying the contenders', pct: 5 });
    expect(describeProgress('generating', { phase: 'designing' })).toMatchObject({ label: 'Drawing the plates', pct: 10 });
    expect(describeProgress('generating', { phase: 'simulating' })).toMatchObject({ label: 'Staging the showdown', pct: 15 });
    expect(describeProgress('generating', { phase: 'binding' })).toMatchObject({ label: 'Binding the book', pct: 98 });
  });

  it('ramps the illustrating percent with page/total and exposes the count', () => {
    expect(describeProgress('generating', { phase: 'illustrating', page: 0, total: 14 })).toMatchObject({ label: 'Printing the pages', pct: 25, page: 0, total: 14 });
    expect(describeProgress('generating', { phase: 'illustrating', page: 7, total: 14 }).pct).toBe(60);
    expect(describeProgress('generating', { phase: 'illustrating', page: 14, total: 14 }).pct).toBe(95);
  });

  it('treats null progress as queued', () => {
    expect(describeProgress('generating', null)).toMatchObject({ label: 'Queued', pct: 0 });
  });

  it('maps terminal states from status', () => {
    expect(describeProgress('ready', null)).toMatchObject({ phase: 'ready', label: 'Hot off the press', pct: 100 });
    expect(describeProgress('failed', null)).toMatchObject({ phase: 'failed', label: 'The press jammed' });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm --prefix apex run test:run -- describeProgress`
Expected: FAIL ("Cannot find module './describeProgress'").

- [ ] **Step 4: Write the module**

Create `apex/src/components/dashboard/describeProgress.ts`:

```ts
import type { StoryProgress, StoryStatus } from '../../types/story.types';

export interface ProgressView {
  phase: StoryProgress['phase'] | 'ready' | 'failed';
  label: string;
  pct: number;
  page?: number;
  total?: number;
}

const PHASE_PCT: Record<Exclude<StoryProgress['phase'], 'illustrating'>, number> = {
  queued: 0,
  researching: 5,
  designing: 10,
  simulating: 15,
  binding: 98,
};

const PHASE_LABEL: Record<StoryProgress['phase'], string> = {
  queued: 'Queued',
  researching: 'Studying the contenders',
  designing: 'Drawing the plates',
  simulating: 'Staging the showdown',
  illustrating: 'Printing the pages',
  binding: 'Binding the book',
};

/**
 * The single home for generation-progress wording. Maps the canonical row state
 * (status + progress) to the on-brand beat label, the derived percent for the
 * bar and aria-valuenow, and the page count while illustrating.
 */
export function describeProgress(
  status: StoryStatus,
  progress: StoryProgress | null,
): ProgressView {
  if (status === 'ready') return { phase: 'ready', label: 'Hot off the press', pct: 100 };
  if (status === 'failed') return { phase: 'failed', label: 'The press jammed', pct: 0 };

  const p: StoryProgress = progress ?? { phase: 'queued' };

  if (p.phase === 'illustrating') {
    const total = p.total > 0 ? p.total : 1;
    const pct = Math.min(95, Math.round(25 + (p.page / total) * 70));
    return { phase: 'illustrating', label: PHASE_LABEL.illustrating, pct, page: p.page, total: p.total };
  }

  return { phase: p.phase, label: PHASE_LABEL[p.phase], pct: PHASE_PCT[p.phase] };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm --prefix apex run test:run -- describeProgress`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apex/src/types/story.types.ts apex/src/components/dashboard/describeProgress.ts apex/src/components/dashboard/describeProgress.test.ts
git commit -m "feat(progress): add the describeProgress copy seam"
```

---

## Task 5: Canonical `StoryRecord` and the enhanced `StoryCard`

**Files:**
- Modify: `apex/src/types/story.types.ts`
- Modify: `apex/src/test/fixtures.ts`
- Modify: `apex/src/components/dashboard/StoryCard.tsx`
- Modify: `apex/src/components/dashboard/Dashboard.css`
- Test: `apex/src/components/dashboard/StoryCard.test.tsx`
- Modify (keep compiling): `apex/src/components/dashboard/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `describeProgress`, `StoryProgress`.
- Produces: `StoryRecord.progress: StoryProgress | null`; `StoryCardProps` gains optional `onWatch?(id)` and `onRetry?(id)`. The generating cover is a button (accessible name `Watch {title} being printed`) when `onWatch` is provided; the failed meta shows a `Try again` button when `onRetry` is provided.

- [ ] **Step 1: Migrate `StoryRecord` and the fixture**

In `apex/src/types/story.types.ts`, in the `StoryRecord` interface, replace:

```ts
  progress_step: string | null;
  progress_pct: number;
```

with:

```ts
  progress: StoryProgress | null;
```

In `apex/src/test/fixtures.ts`, in `createMockStoryRecord`, replace:

```ts
    progress_step: null,
    progress_pct: 100,
```

with:

```ts
    progress: null,
```

- [ ] **Step 2: Rewrite the StoryCard tests**

Replace the generating and failed test cases in `apex/src/components/dashboard/StoryCard.test.tsx` with these (and add a watch case):

```ts
  it('renders a generating card with the beat, derived progress, count, and no Read', () => {
    const generating = createMockStoryRecord({
      id: 'gen-1',
      status: 'generating',
      title: null,
      manifest: null,
      cover_image_path: null,
      progress: { phase: 'illustrating', page: 7, total: 14 },
    });
    render(
      <StoryCard
        story={generating}
        isWinnerRevealed={false}
        onToggleWinner={noop}
        onReadStory={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText('Printing the pages')).toBeInTheDocument();
    expect(screen.getByText('7 of 14')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    expect(screen.queryByRole('button', { name: /read the book/i })).not.toBeInTheDocument();
  });

  it('opens the Press Room from the generating cover when onWatch is given', async () => {
    const onWatch = vi.fn();
    const generating = createMockStoryRecord({
      id: 'gen-2',
      status: 'generating',
      title: null,
      manifest: null,
      cover_image_path: null,
      progress: { phase: 'researching' },
      animal_a: 'Lion',
      animal_b: 'Wolverine',
    });
    render(
      <StoryCard
        story={generating}
        isWinnerRevealed={false}
        onToggleWinner={noop}
        onReadStory={noop}
        onDelete={noop}
        onWatch={onWatch}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /watch lion vs wolverine being printed/i }));
    expect(onWatch).toHaveBeenCalledWith('gen-2');
  });

  it('renders a failed card with its error, Remove, and Try again when onRetry is given', async () => {
    const onRetry = vi.fn();
    const failed = createMockStoryRecord({
      id: 'fail-1',
      status: 'failed',
      title: null,
      manifest: null,
      cover_image_path: null,
      error: 'API quota exceeded',
    });
    render(
      <StoryCard
        story={failed}
        isWinnerRevealed={false}
        onToggleWinner={noop}
        onReadStory={noop}
        onDelete={noop}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText(/did not come together/i)).toBeInTheDocument();
    expect(screen.getByText(/api quota exceeded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove story/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /read the book/i })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledWith('fail-1');
  });
```

- [ ] **Step 3: Keep `Dashboard.test.tsx` compiling**

In `apex/src/components/dashboard/Dashboard.test.tsx`, replace the three `createMockStoryRecord` overrides that still use the old progress fields:

In the "moves a row from generating to ready" test:

```ts
          progress: { phase: 'illustrating', page: 8, total: 14 },
```
(replacing `progress_step: 'Writing the narrative...', progress_pct: 60,`)

In the "prepends a new row on a Realtime INSERT" test:

```ts
        progress: { phase: 'queued' },
```
(replacing `progress_step: 'Queued...', progress_pct: 0,`)

- [ ] **Step 4: Run the tests to verify the new StoryCard ones fail**

Run: `npm --prefix apex run test:run -- StoryCard`
Expected: FAIL (StoryCard still renders the old generating/failed markup; no `7 of 14`, no `Try again`).

- [ ] **Step 5: Update `StoryCard.tsx`**

Add the import near the top of `apex/src/components/dashboard/StoryCard.tsx`:

```tsx
import { describeProgress } from './describeProgress';
```

Add the optional handlers to the props interface:

```tsx
export interface StoryCardProps {
  story: StoryRecord;
  coverUrl?: string;
  isWinnerRevealed: boolean;
  onToggleWinner: (id: string) => void;
  onReadStory: (id: string) => void;
  onDelete: (id: string) => void;
  onWatch?: (id: string) => void;
  onRetry?: (id: string) => void;
}
```

Add `onWatch` and `onRetry` to the destructured params:

```tsx
export const StoryCard = React.memo<StoryCardProps>(function StoryCard({
  story,
  coverUrl,
  isWinnerRevealed,
  onToggleWinner,
  onReadStory,
  onDelete,
  onWatch,
  onRetry,
}) {
```

Replace the entire `story.status === 'generating'` block with:

```tsx
        {story.status === 'generating' && (() => {
          const view = describeProgress(story.status, story.progress);
          const press = (
            <div className="rr-press">
              <span className="rr-press-cap">On the press</span>
              <span className="rr-press-amp" aria-hidden="true">&amp;</span>
              <span className="rr-sweep" aria-hidden="true" />
              {onWatch && <span className="rr-watch" aria-hidden="true">Watch it print &rsaquo;</span>}
              <div className="rr-progress">
                <p className="rr-pstep">{view.label}</p>
                <div className="rr-ptrack">
                  <div
                    className="rr-pbar"
                    style={{ width: `${view.pct}%` }}
                    role="progressbar"
                    aria-label="Story generation progress"
                    aria-valuenow={view.pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                {view.phase === 'illustrating' && view.total != null && (
                  <p className="rr-pcount">{view.page} of {view.total}</p>
                )}
              </div>
            </div>
          );
          return onWatch ? (
            <button
              type="button"
              className="rr-press-open"
              onClick={() => onWatch(story.id)}
              aria-label={`Watch ${titleText} being printed`}
            >
              {press}
            </button>
          ) : (
            press
          );
        })()}
```

Replace the failed cover block:

```tsx
        {story.status === 'failed' && (
          <div className="rr-failed" aria-hidden="true">
            <span className="rr-fail-cap">The press jammed</span>
            <span className="rr-fail-mark">!</span>
          </div>
        )}
```

Replace the failed meta block (the `<>...</>` under `.rr-meta`):

```tsx
        {story.status === 'failed' && (
          <>
            <p className="rr-error" role="alert">
              <AlertTriangle size={13} /> This matchup did not come together.{' '}
              {story.error ?? 'Unknown error'}
            </p>
            <div className="rr-fail-actions">
              {onRetry && (
                <button type="button" className="rr-retry" onClick={() => onRetry(story.id)}>
                  Try again
                </button>
              )}
              <button
                type="button"
                className="rr-remove-text"
                aria-label="Remove story"
                onClick={() => onDelete(story.id)}
              >
                Remove
              </button>
            </div>
          </>
        )}
```

- [ ] **Step 6: Update `Dashboard.css` for the enhanced card**

In `apex/src/components/dashboard/Dashboard.css`, change the `.rr-press` rule to a centered column and append the new rules. Replace:

```css
.rr-press { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
```

with:

```css
.rr-press { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; }
.rr-press-open { position: absolute; inset: 0; width: 100%; padding: 0; border: none; background: none; cursor: pointer; }
.rr-press-open:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--apex-focus); }
.rr-watch {
  position: relative; z-index: 1;
  font-size: 0.62rem; font-weight: 700; letter-spacing: 0.02em; color: #fbf5e6;
  background: rgba(0, 0, 0, 0.22); border: 1px solid rgba(251, 245, 230, 0.4);
  border-radius: 20px; padding: 0.2rem 0.55rem;
}
.rr-pcount { font-size: 0.58rem; color: #eafaec; text-align: center; margin-top: 0.2rem; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
.rr-fail-cap {
  position: absolute; top: 8px; left: 0; right: 0; text-align: center;
  font-size: 0.56rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(255, 245, 240, 0.82);
}
.rr-fail-actions { display: flex; gap: 0.5rem; margin-top: 0.45rem; }
.rr-retry {
  padding: 0.3rem 0.7rem; border-radius: 7px;
  border: 1px solid rgba(62, 107, 74, 0.4); color: var(--apex-forest);
  background: rgba(62, 107, 74, 0.08); font-size: 0.76rem; font-weight: 700; cursor: pointer;
}
.rr-retry:hover { background: rgba(62, 107, 74, 0.16); }
.rr-retry:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }
```

The existing `.rr-progress`, `.rr-ptrack`, `.rr-pbar`, `.rr-pstep`, and the `.rr-sweep` reduced-motion rule are unchanged.

- [ ] **Step 7: Run the apex gates**

Run: `npm --prefix apex run test:run -- StoryCard Dashboard`
Expected: PASS (StoryCard and Dashboard suites green).

Run: `npm --prefix apex run build`
Expected: PASS (type-checks; `StoryRecord.progress` migration is consistent).

- [ ] **Step 8: Commit**

```bash
git add apex/src/types/story.types.ts apex/src/test/fixtures.ts apex/src/components/dashboard/StoryCard.tsx apex/src/components/dashboard/StoryCard.test.tsx apex/src/components/dashboard/Dashboard.test.tsx apex/src/components/dashboard/Dashboard.css
git commit -m "feat(progress): enhance the on-the-press card on the canonical model"
```

---

## Task 6: The `PressRoom` overlay

**Files:**
- Create: `apex/src/components/dashboard/PressRoom.tsx`
- Create: `apex/src/components/dashboard/PressRoom.css`
- Test: `apex/src/components/dashboard/PressRoom.test.tsx`

**Interfaces:**
- Consumes: `StoryRecord`, `describeProgress`.
- Produces: `PressRoom({ story, coverUrl?, onReadStory, onRetry, onDelete, onClose })`. A labeled `role="dialog"` overlay rendering setting-the-press, the Press Bed (one `.pr-plate` per page, `.is-done` for finished, `.is-active` for current), binding, the develop-in reveal, and the press-jammed state.

- [ ] **Step 1: Write the failing test**

Create `apex/src/components/dashboard/PressRoom.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PressRoom } from './PressRoom';
import { createMockStoryRecord } from '../../test/fixtures';
import type { StoryRecord } from '../../types/story.types';

function noop() {}

function setup(
  over: Partial<StoryRecord> = {},
  handlers: Partial<{
    onReadStory: (id: string) => void;
    onRetry: (id: string) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    coverUrl: string;
  }> = {},
) {
  const story = createMockStoryRecord({
    status: 'generating',
    title: null,
    manifest: null,
    cover_image_path: null,
    progress: { phase: 'queued' },
    ...over,
  });
  return render(
    <PressRoom
      story={story}
      coverUrl={handlers.coverUrl}
      onReadStory={handlers.onReadStory ?? noop}
      onRetry={handlers.onRetry ?? noop}
      onDelete={handlers.onDelete ?? noop}
      onClose={handlers.onClose ?? noop}
    />,
  );
}

describe('PressRoom', () => {
  it('narrates the warmup without plates', () => {
    setup({ progress: { phase: 'researching' } });
    expect(screen.getByText('Studying the contenders')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
    expect(document.querySelectorAll('.pr-plate')).toHaveLength(0);
  });

  it('renders the press bed with one plate per page while illustrating', () => {
    setup({ progress: { phase: 'illustrating', page: 7, total: 14 } });
    expect(screen.getByText('Printing the pages')).toBeInTheDocument();
    expect(screen.getByText('Plate 7 of 14')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    expect(document.querySelectorAll('.pr-plate')).toHaveLength(14);
    expect(document.querySelectorAll('.pr-plate.is-done')).toHaveLength(7);
  });

  it('reveals the cover and reads on ready', async () => {
    const onReadStory = vi.fn();
    const onClose = vi.fn();
    setup({ status: 'ready' }, { onReadStory, onClose, coverUrl: 'https://signed/cover.png' });
    expect(screen.getByText(/hot off the press/i)).toBeInTheDocument();
    expect(screen.getByAltText('Lion vs Tiger')).toHaveAttribute('src', 'https://signed/cover.png');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /read the book/i }));
    expect(onReadStory).toHaveBeenCalledWith('story-1');
    await user.click(screen.getByRole('button', { name: /back to the shelf/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the jammed state with Try again and Remove', async () => {
    const onRetry = vi.fn();
    const onDelete = vi.fn();
    setup({ status: 'failed', error: 'Image service timed out.' }, { onRetry, onDelete });
    expect(screen.getByText(/press jammed/i)).toBeInTheDocument();
    expect(screen.getByText(/image service timed out/i)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledWith('story-1');
    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(onDelete).toHaveBeenCalledWith('story-1');
  });

  it('closes on Escape and on the back control', async () => {
    const onClose = vi.fn();
    setup({ progress: { phase: 'queued' } }, { onClose });
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /reading room/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix apex run test:run -- PressRoom`
Expected: FAIL ("Cannot find module './PressRoom'").

- [ ] **Step 3: Write the component**

Create `apex/src/components/dashboard/PressRoom.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { BookOpen, ChevronLeft, RefreshCw, Trash2 } from 'lucide-react';
import { StoryRecord } from '../../types/story.types';
import { describeProgress } from './describeProgress';
import './PressRoom.css';

export interface PressRoomProps {
  story: StoryRecord;
  coverUrl?: string;
  onReadStory: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function PressRoom({ story, coverUrl, onReadStory, onRetry, onDelete, onClose }: PressRoomProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleText = story.title ?? `${story.animal_a} vs ${story.animal_b}`;
  const view = describeProgress(story.status, story.progress);

  // Focus the room on open; restore focus to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="press-room"
      role="dialog"
      aria-modal="true"
      aria-label={`Press Room: ${titleText}`}
      ref={rootRef}
      tabIndex={-1}
    >
      <div className="pr-top">
        <button type="button" className="pr-back" onClick={onClose}>
          <ChevronLeft size={16} aria-hidden="true" /> Reading Room
        </button>
        <span className="pr-runtitle">
          {story.animal_a} <span className="pr-amp" aria-hidden="true">&amp;</span> {story.animal_b}
        </span>
        <span className="pr-pub">An Apex Publication</span>
      </div>

      <p className="rr-sr-only" aria-live="polite">{view.label}</p>

      {story.status === 'failed' ? (
        <div className="pr-stage">
          <p className="pr-fresh">The press jammed</p>
          <p className="pr-jam" role="alert">
            This matchup did not come together. {story.error ?? 'Unknown error'}
          </p>
          <div className="pr-ctas">
            <button type="button" className="pr-read" onClick={() => onRetry(story.id)}>
              <RefreshCw size={15} aria-hidden="true" /> Try again
            </button>
            <button type="button" className="pr-ghost" onClick={() => onDelete(story.id)}>
              <Trash2 size={14} aria-hidden="true" /> Remove
            </button>
          </div>
        </div>
      ) : story.status === 'ready' ? (
        <div className="pr-stage">
          <p className="pr-fresh">Hot off the press</p>
          <div className="pr-cover">
            {coverUrl ? (
              <img className="pr-cover-img" src={coverUrl} alt={`${story.animal_a} vs ${story.animal_b}`} />
            ) : (
              <div className="pr-cover-wait" aria-hidden="true" />
            )}
          </div>
          <div className="pr-ctas">
            <button type="button" className="pr-read" onClick={() => onReadStory(story.id)}>
              <BookOpen size={15} aria-hidden="true" /> Read the book
            </button>
            <button type="button" className="pr-ghost" onClick={onClose}>
              Back to the shelf
            </button>
          </div>
        </div>
      ) : (
        <div className="pr-stage">
          <p className="pr-eyebrow">On the press</p>
          <h2 className="pr-beat">{view.label}</h2>
          <div className="pr-rule">
            <div
              className="pr-track"
              role="progressbar"
              aria-label="Story generation progress"
              aria-valuenow={view.pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="pr-fill" style={{ width: `${view.pct}%` }} />
            </div>
            {view.phase === 'illustrating' && view.total != null && (
              <p className="pr-count">Plate {view.page} of {view.total}</p>
            )}
          </div>
          {view.phase === 'illustrating' && view.total != null && (
            <div className="pr-bed" aria-hidden="true">
              {Array.from({ length: view.total }).map((_, i) => {
                const done = i < (view.page ?? 0);
                const active = i === (view.page ?? 0);
                return (
                  <span key={i} className={`pr-plate${done ? ' is-done' : active ? ' is-active' : ''}`} />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the stylesheet**

Create `apex/src/components/dashboard/PressRoom.css`:

```css
/* The Press Room: the focused, opt-in generation view. On --apex-* tokens. */
.press-room {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: clamp(1rem, 4vw, 2.4rem);
  gap: clamp(0.8rem, 3vh, 1.6rem);
  color: var(--apex-ink);
  font-family: var(--apex-font-ui);
  background:
    radial-gradient(130% 100% at 50% -10%,
      var(--apex-paper-hi) 0%, var(--apex-paper) 78%, var(--apex-paper-lo) 100%);
  outline: none;
}

.pr-top {
  width: 100%;
  max-width: 720px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.pr-back {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-size: 0.85rem; font-weight: 600; color: var(--apex-brown);
  background: none; cursor: pointer;
}
.pr-back:hover { color: var(--apex-ink); }
.pr-back:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); border-radius: 6px; }
.pr-runtitle { font-family: var(--apex-font-display); font-weight: 600; font-size: 1rem; color: var(--apex-ink); }
.pr-amp { color: var(--apex-gilt); font-style: italic; padding: 0 0.15em; }
.pr-pub {
  font-size: 0.58rem; font-weight: 700; letter-spacing: 0.16em;
  text-transform: uppercase; color: #a8854a;
}

.pr-stage {
  flex: 1;
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  text-align: center;
}

.pr-eyebrow, .pr-fresh {
  font-size: 0.62rem; font-weight: 700; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--apex-gilt);
}
.pr-beat {
  font-family: var(--apex-font-display);
  font-weight: 600;
  font-size: clamp(1.6rem, 5vw, 2.4rem);
  color: var(--apex-forest);
  line-height: 1.05;
}

.pr-rule { width: 100%; max-width: 340px; }
.pr-track { height: 5px; background: rgba(120, 90, 40, 0.16); border-radius: 3px; overflow: hidden; }
.pr-fill { height: 100%; background: linear-gradient(90deg, var(--apex-gilt), #e3c873); border-radius: 3px; transition: width 0.4s var(--apex-ease); }
.pr-count { font-size: 0.78rem; color: var(--apex-brown); margin-top: 0.5rem; letter-spacing: 0.03em; }

.pr-bed {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: clamp(6px, 1.4vw, 10px);
  margin-top: 0.4rem;
}
.pr-plate {
  aspect-ratio: 3 / 4;
  border-radius: 4px;
  border: 1px solid var(--apex-field-border);
  background: repeating-linear-gradient(135deg, #f6efdc, #f6efdc 5px, #f1e8d0 5px, #f1e8d0 10px);
}
.pr-plate.is-done {
  border-color: var(--apex-forest-deep);
  background: linear-gradient(160deg, var(--apex-forest), var(--apex-forest-deep));
}
.pr-plate.is-active {
  border: 1.5px dashed var(--apex-gilt);
  background: linear-gradient(160deg, #cfe0d6, #9ebfa6);
  box-shadow: 0 0 0 3px rgba(199, 162, 62, 0.25);
}

.pr-cover {
  width: clamp(160px, 40vw, 220px);
  aspect-ratio: 3 / 4;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid rgba(120, 80, 30, 0.4);
  box-shadow: 0 14px 30px rgba(90, 60, 20, 0.28);
  background: linear-gradient(160deg, #5b7d54, #2f4a36);
}
.pr-cover-img { width: 100%; height: 100%; object-fit: cover; }
.pr-cover-wait { width: 100%; height: 100%; background: linear-gradient(160deg, #cfe0d6, #6f9b78); }

.pr-jam { font-family: var(--apex-font-serif); font-style: italic; color: var(--apex-error); max-width: 32ch; line-height: 1.4; }

.pr-ctas { display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: center; align-items: center; }
.pr-read {
  display: inline-flex; align-items: center; gap: 0.4rem;
  background: var(--apex-forest); color: var(--apex-on-forest);
  border-radius: 8px; padding: 0.6rem 1rem; font-size: 0.9rem; font-weight: 700;
  box-shadow: 0 4px 10px rgba(62, 107, 74, 0.3); cursor: pointer;
}
.pr-read:hover { background: var(--apex-forest-deep); }
.pr-ghost {
  display: inline-flex; align-items: center; gap: 0.4rem;
  background: var(--apex-surface); border: 1px solid var(--apex-field-border);
  color: var(--apex-brown); border-radius: 8px; padding: 0.55rem 0.9rem;
  font-size: 0.84rem; font-weight: 600; cursor: pointer;
}
.pr-ghost:hover { border-color: var(--apex-rule); color: var(--apex-ink-soft); }
.pr-read:focus-visible, .pr-ghost:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--apex-focus); }

@media (max-width: 560px) {
  .pr-bed { grid-template-columns: repeat(4, 1fr); }
  .pr-ctas { flex-direction: column; width: 100%; }
  .pr-read, .pr-ghost { width: 100%; justify-content: center; }
}

@media (prefers-reduced-motion: no-preference) {
  .press-room { animation: prFadeIn 0.25s var(--apex-ease); }
  .pr-cover-img { animation: prDevelopIn 0.6s var(--apex-ease); }
  .pr-plate.is-done { animation: prInk 0.3s var(--apex-ease); }
  @keyframes prFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes prDevelopIn { from { opacity: 0; filter: saturate(0.4) blur(4px); } to { opacity: 1; filter: none; } }
  @keyframes prInk { from { transform: scale(0.86); opacity: 0.3; } to { transform: scale(1); opacity: 1; } }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix apex run test:run -- PressRoom`
Expected: PASS (all five cases).

- [ ] **Step 6: Commit**

```bash
git add apex/src/components/dashboard/PressRoom.tsx apex/src/components/dashboard/PressRoom.css apex/src/components/dashboard/PressRoom.test.tsx
git commit -m "feat(progress): add the Press Room overlay"
```

---

## Task 7: Dashboard wiring and `CatalogService.retryStory`

**Files:**
- Modify: `apex/src/services/CatalogService.ts`
- Modify: `apex/src/components/dashboard/Dashboard.tsx`
- Test: `apex/src/components/dashboard/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `PressRoom`, `StoryCard` (`onWatch`, `onRetry`), `describeProgress` indirectly.
- Produces: `CatalogService.retryStory(id): Promise<string>`; Dashboard `watchingId` state; the Press Room overlay rendered for the live watched row; optimistic retry.

- [ ] **Step 1: Add `retryStory` to the service**

In `apex/src/services/CatalogService.ts`, add after `createStory`:

```ts
  /**
   * Re-triggers generation for a failed story. The `retry-story` Edge Function
   * verifies ownership, requires a `failed` row, resets it to `generating`, and
   * re-enqueues the task (which resumes from the checkpoint). Returns the storyId.
   */
  static async retryStory(id: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('retry-story', {
      body: { storyId: id },
    });

    if (error) throw error;
    const storyId = (data as { storyId?: string } | null)?.storyId;
    if (!storyId) throw new Error('retry-story did not return a storyId');
    return storyId;
  }
```

- [ ] **Step 2: Add the failing Dashboard tests**

In `apex/src/components/dashboard/Dashboard.test.tsx`:

Add `retryStory` to the mocked `CatalogService`:

```ts
vi.mock('../../services/CatalogService', () => ({
  CatalogService: {
    listStories: vi.fn(),
    subscribeToStories: vi.fn(),
    createStory: vi.fn(),
    resolveSignedUrls: vi.fn(),
    deleteStory: vi.fn(),
    retryStory: vi.fn(),
  },
}));
```

Add the typed handle and reset (next to the other `mock...` consts and in `beforeEach`):

```ts
const mockRetryStory = CatalogService.retryStory as ReturnType<typeof vi.fn>;
```
```ts
  mockRetryStory.mockReset();
  mockRetryStory.mockResolvedValue('story-1');
```

Add a new `describe` block:

```ts
  describe('press room and retry', () => {
    it('opens the Press Room from a generating card', async () => {
      mockListStories.mockResolvedValue([
        createMockStoryRecord({
          id: 'g1',
          status: 'generating',
          title: null,
          manifest: null,
          cover_image_path: null,
          progress: { phase: 'illustrating', page: 3, total: 14 },
          animal_a: 'Lion',
          animal_b: 'Wolverine',
        }),
      ]);
      renderDashboard();
      await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /watch lion vs wolverine being printed/i }));
      expect(screen.getByRole('dialog', { name: /press room/i })).toBeInTheDocument();
    });

    it('retries a failed story with an optimistic flip to generating', async () => {
      mockListStories.mockResolvedValue([
        createMockStoryRecord({
          id: 'fail-1',
          status: 'failed',
          title: null,
          manifest: null,
          cover_image_path: null,
          error: 'boom',
        }),
      ]);
      renderDashboard();
      await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /try again/i }));
      expect(mockRetryStory).toHaveBeenCalledWith('fail-1');
      await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());
    });
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm --prefix apex run test:run -- Dashboard`
Expected: FAIL (no "Watch ... being printed" button, no "Try again").

- [ ] **Step 4: Wire the Dashboard**

In `apex/src/components/dashboard/Dashboard.tsx`:

Add the import:

```tsx
import { PressRoom } from './PressRoom';
```

Add the state (next to the other `useState` calls):

```tsx
  const [watchingId, setWatchingId] = useState<string | null>(null);
```

Add the retry handler (next to `handleDelete`):

```tsx
  // Optimistic retry: flip the row back to generating, then re-enqueue.
  const handleRetry = useCallback(
    async (id: string) => {
      setStories((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: 'generating', error: null, progress: { phase: 'queued' } } : s,
        ),
      );
      try {
        await CatalogService.retryStory(id);
      } catch (error) {
        console.error('[Dashboard] Retry failed:', error);
        await loadStories();
      }
    },
    [loadStories],
  );
```

Pass `onWatch` and `onRetry` to the gallery `StoryCard`:

```tsx
                <StoryCard
                  key={story.id}
                  story={story}
                  coverUrl={story.cover_image_path ? coverUrls[story.cover_image_path] : undefined}
                  isWinnerRevealed={revealedWinners.has(story.id)}
                  onToggleWinner={toggleWinnerReveal}
                  onReadStory={onReadStory}
                  onDelete={handleDelete}
                  onWatch={(id) => setWatchingId(id)}
                  onRetry={handleRetry}
                />
```

Render the Press Room overlay (just before the closing `</>` of the non-empty branch, after the `composerOpen` block):

```tsx
          {watchingId && (() => {
            const watched = stories.find((s) => s.id === watchingId);
            if (!watched) return null;
            return (
              <PressRoom
                story={watched}
                coverUrl={watched.cover_image_path ? coverUrls[watched.cover_image_path] : undefined}
                onReadStory={onReadStory}
                onRetry={handleRetry}
                onDelete={(id) => {
                  handleDelete(id);
                  setWatchingId(null);
                }}
                onClose={() => setWatchingId(null)}
              />
            );
          })()}
```

- [ ] **Step 5: Run the apex gates**

Run: `npm --prefix apex run test:run -- Dashboard`
Expected: PASS (the new press-room and retry tests, and the existing suite).

Run: `npm --prefix apex run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apex/src/services/CatalogService.ts apex/src/components/dashboard/Dashboard.tsx apex/src/components/dashboard/Dashboard.test.tsx
git commit -m "feat(progress): wire the Press Room and retry into the dashboard"
```

---

## Phase 3: Verification

## Task 8: Full verification and visual confirmation

Run every gate, drive the real UI with a throwaway preview, screenshot every state, then delete the preview files.

**Files:**
- Create (temporary, never committed): `apex/preview.html`, `apex/src/preview.tsx`

- [ ] **Step 1: Run every gate**

Run, expecting all to pass:

```bash
npm --prefix apex run lint
npm --prefix apex run build
npm --prefix apex run test:run
cd trigger && bun test && bun run typecheck && cd ..
cd supabase/functions/create-story && deno test -A && cd ../../..
cd supabase/functions/retry-story && deno test -A && cd ../../..
```

- [ ] **Step 2: Confirm there are no em dashes in the changed surface**

Run, expecting no output:

```bash
grep -rn "—" apex/src/components/dashboard/PressRoom.tsx apex/src/components/dashboard/PressRoom.css apex/src/components/dashboard/StoryCard.tsx apex/src/components/dashboard/describeProgress.ts trigger/src/lib/pipeline.ts supabase/functions/retry-story/index.ts docs/specs/2026-06-16-generation-progress.md docs/plans/2026-06-16-generation-progress.md
```

- [ ] **Step 3: Create the throwaway preview entry**

Create `apex/preview.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Progress preview</title>
  </head>
  <body>
    <div id="preview-root"></div>
    <script type="module" src="/src/preview.tsx"></script>
  </body>
</html>
```

Create `apex/src/preview.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import { StoryCard } from './components/dashboard/StoryCard';
import { PressRoom } from './components/dashboard/PressRoom';
import { createMockStoryRecord } from './test/fixtures';
import type { StoryProgress, StoryRecord } from './types/story.types';
import './index.css';
import './components/dashboard/Dashboard.css';

const noop = () => {};
const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'cards';

const gen = (progress: StoryProgress, over: Partial<StoryRecord> = {}) =>
  createMockStoryRecord({ status: 'generating', title: null, manifest: null, cover_image_path: null, progress, ...over });

const root = createRoot(document.getElementById('preview-root')!);

if (view === 'press') {
  const phase = params.get('phase') ?? 'illustrating';
  let story: StoryRecord;
  let coverUrl: string | undefined;
  if (phase === 'ready') {
    story = createMockStoryRecord({ status: 'ready', animal_a: 'Lion', animal_b: 'Wolverine' });
    coverUrl = 'https://picsum.photos/seed/apexcover/1024/1365';
  } else if (phase === 'failed') {
    story = createMockStoryRecord({ status: 'failed', title: null, manifest: null, cover_image_path: null, error: 'Image service timed out.', animal_a: 'Mole', animal_b: 'Shark' });
  } else if (phase === 'researching') {
    story = gen({ phase: 'researching' }, { animal_a: 'Lion', animal_b: 'Wolverine' });
  } else if (phase === 'binding') {
    story = gen({ phase: 'binding' }, { animal_a: 'Lion', animal_b: 'Wolverine' });
  } else {
    story = gen({ phase: 'illustrating', page: Number(params.get('page') ?? 7), total: 14 }, { animal_a: 'Lion', animal_b: 'Wolverine' });
  }
  root.render(
    <PressRoom story={story} coverUrl={coverUrl} onReadStory={noop} onRetry={noop} onDelete={noop} onClose={noop} />,
  );
} else {
  root.render(
    <div className="rr" style={{ padding: '2rem' }}>
      <div className="rr-gallery">
        <StoryCard story={gen({ phase: 'illustrating', page: 7, total: 14 }, { animal_a: 'Lion', animal_b: 'Wolverine' })} isWinnerRevealed={false} onToggleWinner={noop} onReadStory={noop} onDelete={noop} onWatch={noop} />
        <StoryCard story={gen({ phase: 'researching' }, { animal_a: 'Owl', animal_b: 'Mole' })} isWinnerRevealed={false} onToggleWinner={noop} onReadStory={noop} onDelete={noop} onWatch={noop} />
        <StoryCard story={createMockStoryRecord({ status: 'failed', title: null, manifest: null, cover_image_path: null, error: 'Image service timed out.', animal_a: 'Mole', animal_b: 'Shark' })} isWinnerRevealed={false} onToggleWinner={noop} onReadStory={noop} onDelete={noop} onRetry={noop} />
      </div>
    </div>,
  );
}
```

- [ ] **Step 4: Screenshot every state**

Start the dev server (`npm --prefix apex run dev`) and use the `playwright-cli` skill to load and capture, confirming zero console errors at each:

- `http://localhost:5173/preview.html` (the shelf cards: generating illustrating, generating warmup, failed with Try again).
- `http://localhost:5173/preview.html?view=press&phase=researching` (setting the press).
- `http://localhost:5173/preview.html?view=press&phase=illustrating&page=4` and `&page=11` (the Press Bed accruing).
- `http://localhost:5173/preview.html?view=press&phase=binding` (binding).
- `http://localhost:5173/preview.html?view=press&phase=ready` (the develop-in reveal).
- `http://localhost:5173/preview.html?view=press&phase=failed` (the press jammed).
- The Press Bed and reveal at a 375px-wide viewport (mobile: four-column bed, stacked actions).
- The Press Bed with reduced motion emulated (no looping or transition).

- [ ] **Step 5: Delete the preview files**

```bash
rm apex/preview.html apex/src/preview.tsx
```

Confirm `git status` shows no `preview.*` files staged or untracked.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test(progress): verify the Press Room across states (no files committed beyond gates)"
```

If Step 6 has nothing to commit (all preview files deleted, gates already committed), skip it.

After this task, hand off to the **superpowers:finishing-a-development-branch** skill to open the pull request (per the surface 4 handoff: `main` expects PRs).

---

## Self-Review Notes

**Spec coverage:**
- Two tiers sharing one source: `describeProgress` (Task 4), enhanced card (Task 5), Press Room (Task 6), wiring (Task 7). Covered.
- Press Room states (setting the press, Press Bed, binding, reveal, failed): Task 6 component + tests. Covered.
- Canonical `progress jsonb` + the `StoryProgress` contract: Tasks 1, 2, 4, 5. Covered.
- Reframed copy (the beats) owned client-side: Task 4 `PHASE_LABEL`. Covered.
- Resume-cheap retry (`retry-story` + `CatalogService.retryStory` + failed-card wiring): Tasks 3, 5, 7. Covered.
- Accessibility (progressbar, polite live region, role=alert, focus management, Esc): Tasks 5, 6. Covered.
- Reduced motion + responsive (including the mobile decision): Task 6 CSS + Task 8 screenshots. Covered.
- Non-blocking preserved (the existing compose flow is untouched; the Press Room is opt-in): no task changes the submit path. Covered.

**Type consistency:** `StoryProgress` is defined identically in `trigger` (Task 1) and `apex` (Task 4). `describeProgress(status, progress)` returns `ProgressView { phase, label, pct, page?, total? }`, consumed by `StoryCard` (Task 5) and `PressRoom` (Task 6) with the same property names. `updateProgress(client, storyId, progress)` (Task 1) matches the `PipelineDeps.db.updateProgress(storyId, progress)` binding (Task 1) and the pipeline call sites. `retryStory(id)` (Task 7) calls the `retry-story` function (Task 3) with `{ storyId }`, which returns `{ storyId }`.

**Placeholder scan:** no TBD/TODO; every code step shows the full code; every command lists its expected result.
