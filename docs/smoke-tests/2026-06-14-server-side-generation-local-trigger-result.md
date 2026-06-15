# Smoke Test Result — Local Supabase + Local Trigger.dev

Date: 2026-06-14 / 2026-06-15 UTC
Branch: `rearchitecture/foundation-slice`
Procedure: `docs/smoke-tests/server-side-generation-local-trigger.md`

## Environment

- Local Supabase stack started with `supabase start` and reset with `supabase db reset`.
- Trigger.dev project linked as `proj_lhevqdnezjyfvmxpxfql`.
- Trigger.dev local worker ran with local Anthropic/OpenAI keys and local Supabase service-role credentials.
- Supabase Edge Function `create-story` was served locally.
- Vite SPA ran at `http://127.0.0.1:5173`.
- Secrets were kept in gitignored env files and are not recorded here.

## Passing smoke run

Successful story:

- Story ID: `71971cf2-bfc1-497a-8682-e8b01f11e221`
- Animals: `lynx` vs `eagle`
- Trigger.dev run: `run_cmqenp56x3skm0un57b6wi84h.1`
- Trigger.dev duration: `16m, 20.2s`
- Final database state: `ready | Saving your story... | 100 | Who Would Win? lynx vs. eagle`

Observed pass criteria:

- Magic-link auth worked through local Mailpit/Inbucket.
- Authenticated library loaded via PostgREST with no console errors.
- Submitting a story returned `200` from local `create-story` and inserted a `generating` row.
- Trigger.dev local worker executed `generate-story` and advanced progress through Realtime.
- Final story reached `ready` and rendered in the library with a cover image and `Read Full Book`.
- BookViewer opened successfully.
- Cover/page image URLs were signed Supabase Storage URLs, not `data:` URIs.
- Page flip next/previous controls worked.
- Checklist and back cover rendered.
- Closing/reopening the browser and signing in again showed the persisted library, including the ready story.
- Storage contained 27 objects for the story: cover + 26 page images.
- Manifest image paths are Storage paths such as `stories/<storyId>/cover.png`, not base64 data URIs.

## Issues found and fixed during smoke

1. Authenticated PostgREST reads initially failed with `permission denied for table stories`.
   - Fix: grant DML privileges on `public.stories` to `authenticated` so RLS policies can apply.

2. Edge Function inserts initially failed with `Failed to create story` because `service_role` lacked table DML privileges.
   - Fix: grant DML privileges on `public.stories` to `service_role`.

3. First Trigger.dev run failed at page-image progress with:
   - `invalid input syntax for type integer: "27.692307692307693"`
   - Fix: round per-page `progress_pct` updates before persisting.
   - Regression coverage added to ensure progress percentages are integers.

4. A 10-minute Trigger.dev max duration was too short for full OpenAI image generation.
   - Fix: increase Trigger.dev `maxDuration` to 25 minutes (`1500` seconds) globally and on `generate-story`.

## Remaining follow-ups

- Trigger.dev max-duration timeouts can leave rows stuck in `generating`; add stale-generation handling or watchdog cleanup.
- Failed story UI can show `Generation failed: [object Object]`; normalize error messages before persisting.
- One earlier timed-out row remains in the local database from the failed smoke attempt; local Supabase was stopped after the test.

## Verification commands run

```bash
cd trigger && bun run typecheck && bun test src/lib/__tests__/pipeline.test.ts
```

Result: typecheck passed; pipeline test file passed with `10 pass, 0 fail`.

```bash
supabase db reset
```

Result: local migrations applied successfully after grants were added.

```sql
select count(*)
from storage.objects
where bucket_id = 'story-images'
  and name like 'stories/71971cf2-bfc1-497a-8682-e8b01f11e221/%';
```

Result: `27`.
