**Reviewer:** openai-codex/gpt-5.5 via codex

### Outcome

**Verdict:** Not approved

**Reasoning:** The foundation is mostly in place and the main automated checks pass, but generation can still be marked `ready` after image-provider failures, producing persisted books with empty/corrupt image objects instead of a terminal `failed` row. A narrower retry-resumption gap can also leave a ready story without its dashboard cover path after a cover upload succeeds but the checkpoint update does not.

### Strengths

- Supabase schema, owner-scoped RLS policies, private Storage policies, and Realtime publication wiring closely match the plan; `cd supabase && supabase db reset` applies both migrations successfully.
- The Trigger.dev project is well separated from the SPA, uses service-role Supabase helpers server-side, and has focused tests for provider adapters, database helpers, and the pure pipeline. Verified `cd trigger && bun test` and `cd trigger && bunx tsc --noEmit`.
- The client moved catalog reads, story creation, Realtime progress, and signed Storage URL rendering behind `CatalogService`, and the SPA production build succeeds. Verified `cd apex && npm run test:run` and `cd apex && npm run build`.
- The `create-story` Edge Function derives `owner_id` from the verified JWT, enqueues Trigger.dev via REST, and now handles both non-OK and thrown enqueue failures by marking the row failed. Verified `deno test --config supabase/functions/create-story/deno.json supabase/functions/create-story/index.test.ts`.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- **trigger/src/lib/image.ts:42 - Exhausted image failures are swallowed and become successful empty uploads**
  After the adapter throws for all retries, `ImageClient.generateImage` logs the error and returns `''` instead of throwing. The pipeline does not validate that value before upload (`trigger/src/lib/pipeline.ts:258`-`263`), so an OpenAI outage, bad response, or exhausted rate-limit retry will upload a zero-byte/invalid PNG and the task will still call `finalize(...)` as `ready`. That violates the server-side durability requirement that terminal generation failures transition to `failed` with an error, and it leaves users with completed books containing broken images. Let the final image error propagate, or explicitly reject empty image payloads before upload so Trigger.dev retry/failure handling can do its job.

- **trigger/src/lib/pipeline.ts:147 - Retrying after a cover upload can skip restoring `cover_image_path`**
  `resolveCover()` returns immediately when the cover object already exists, and only calls `setCoverPath(...)` on the fresh-upload branch at line 155. If an attempt uploads `stories/{storyId}/cover.png` and then fails before `setCoverPath` completes, the retry sees the object, returns the path, and eventually finalizes the story, but `cover_image_path` remains null because `finalize` does not set it (`trigger/src/lib/db.ts:83`). The book can still use `manifest.coverImageUrl`, but the dashboard resolves thumbnails only from `story.cover_image_path`, so that ready story shows no cover. Set `cover_image_path` whenever the resolved cover path is known, including the skip-if-exists branch or finalization.

#### Minor (Nice to Have)

- **README.md:9, apex/README.md:9 - Documentation still names GPT-4 Vision for image generation**
  The implementation uses `gpt-image-2` via the OpenAI image API, but the READMEs still describe images as "GPT-4 Vision" in multiple places. This will mislead deployment and spend-dashboard checks; update those references to `gpt-image-2` / OpenAI image generation.

### Recommendations

- Add tests for the two retry-path failures above: an image adapter that always throws should leave the task failed, and an existing cover object with null `cover_image_path` should be repaired during a resumed run.
- Consider having `uploadImage` reject empty base64 before touching Storage; that gives a second guardrail if another caller accidentally swallows provider failures.
