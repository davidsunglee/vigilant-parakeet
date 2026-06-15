# Smoke Test — Local Supabase + Local Trigger.dev Task Execution

This smoke test exercises the foundation slice with:

- the Vite SPA running locally;
- Supabase running locally for Auth, Postgres, Storage, Realtime, and the `create-story` Edge Function;
- `trigger dev` running the `generate-story` task locally while connected to Trigger.dev's development infrastructure.

It is not fully offline: Trigger.dev local development requires a Trigger.dev account/project, and a successful full generation uses real Anthropic/OpenAI provider keys.

## Prerequisites

- OrbStack or Docker running.
- Supabase CLI installed and authenticated if needed.
- Trigger.dev account/project.
- Anthropic API key.
- OpenAI API key.
- This branch checked out with dependencies installable via `npm`/`bun`.

> Cost note: a successful generation calls Anthropic for story text and OpenAI for cover + page images. Use a deliberate test run; do not submit many generations casually.

## Terminal 1 — Start local Supabase

```bash
cd supabase
supabase start
supabase db reset
```

Record the local values printed by `supabase start`, especially:

- API URL, usually `http://127.0.0.1:54321`
- anon key
- service-role key
- Inbucket URL, usually `http://127.0.0.1:54324`

If `supabase db reset` warns that Google OAuth env vars are unset, that is acceptable for the email magic-link smoke path.

## Terminal 2 — Start the local Trigger.dev worker

From the `trigger/` project:

```bash
cd trigger
bun install
```

Create a local environment file or export these variables in the shell that runs Trigger.dev:

```bash
export ANTHROPIC_API_KEY="..."
export OPENAI_API_KEY="..."
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="<local service-role key from supabase start>"
```

Initialize/link the Trigger.dev project if this has not been done for your local checkout:

```bash
npx trigger.dev@latest login
npx trigger.dev@latest init
```

If `trigger.config.ts` still contains `proj_REPLACE_ME`, replace it with the `proj_...` project reference from Trigger.dev before starting dev mode.

Start the local worker:

```bash
bun run dev
# equivalent: npx trigger.dev@latest dev
```

Leave this running. The worker should register the `generate-story` task and wait for dev runs.

## Terminal 3 — Serve the Supabase Edge Function

Create `supabase/.env.local` using the local Supabase values and Trigger.dev development secret:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local service-role key from supabase start>
TRIGGER_SECRET_KEY=<Trigger.dev dev/server secret key>
TRIGGER_API_URL=https://api.trigger.dev
```

Then serve the function:

```bash
cd supabase
supabase functions serve create-story --env-file .env.local
```

Leave this running. The SPA will call the local function through the local Supabase functions endpoint.

## Terminal 4 — Run the SPA

Create `apex/.env`:

```bash
cd apex
npm install
cat > .env <<'EOF'
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local anon key from supabase start>
EOF
```

Start Vite:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Browser smoke steps

1. **Unauthenticated gate**
   - Confirm the sign-in view renders.
   - Confirm the app does not show the dashboard before login.

2. **Email magic-link login**
   - Enter a test email, for example `smoke@example.com`.
   - Open local Inbucket, usually `http://127.0.0.1:54324`.
   - Open the magic-link email and complete sign-in.
   - Confirm the dashboard/library renders.

3. **Empty library**
   - Confirm an empty account shows the empty-library state.

4. **Start one generation**
   - Enter two animals, for example `otter` and `falcon`.
   - Pick an art style or leave `Surprise Me`.
   - Submit.
   - Expected immediate behavior:
     - the form clears;
     - the library remains interactive;
     - a `generating` story appears or updates through Realtime;
     - the Edge Function terminal logs a successful request;
     - the Trigger.dev terminal shows a `generate-story` run starting.

5. **Observe progress**
   - Watch the Dashboard card update `progress_step`/`progress_pct`.
   - Watch `trigger dev` logs for LLM/image/storage work.
   - Optional SQL check:

     ```bash
     cd supabase
     supabase db remote commit --help >/dev/null 2>&1 || true
     psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
       -c "select id, status, progress_step, progress_pct, title, cover_image_path from public.stories order by created_at desc limit 5;"
     ```

6. **Completion**
   - Wait for the story to become `ready`.
   - Confirm the card shows a cover image and a `Read Full Book` button.
   - Open the book.
   - Confirm cover/page images render from signed URLs, not base64 data URIs.
   - Confirm checklist, page flip controls, and back cover still work.

7. **Durability check**
   - Start another generation.
   - Close the browser tab while it is generating.
   - Keep Supabase, the Edge Function, and `trigger dev` running.
   - Reopen the app and sign in again.
   - Confirm the in-progress or completed story is still present.

8. **Storage check**
   - In Supabase Studio or SQL/storage tooling, confirm image objects exist under paths like:

     ```text
     story-images/stories/<storyId>/cover.png
     story-images/stories/<storyId>/1.png
     ```

   - Confirm `stories.manifest->>'coverImageUrl'` is a Storage path such as `stories/<storyId>/cover.png`, not a base64 data URI.

## Expected pass criteria

- Local Supabase migrations apply with `supabase db reset`.
- Email magic-link auth works locally through Inbucket.
- The dashboard is accessible only after auth.
- Submitting a story calls the local `create-story` Edge Function.
- The Edge Function inserts a `generating` row and enqueues `generate-story` through Trigger.dev.
- `trigger dev` executes the local `generate-story` task.
- Progress updates appear in the SPA through Realtime.
- The final story reaches `ready`, persists in Postgres, stores images in Supabase Storage, and renders through signed URLs in the BookViewer.

## Common failure modes

### `create-story` returns 401

The browser is not signed in or the local Supabase session is stale. Sign out/in again through the magic link.

### `create-story` returns 502 / story becomes `failed` immediately

The Edge Function could not enqueue the Trigger.dev task. Check:

- `TRIGGER_SECRET_KEY` in `supabase/.env.local`;
- `TRIGGER_API_URL`;
- `trigger dev` is running and linked to the expected project;
- `trigger.config.ts` has a real `proj_...` value, not `proj_REPLACE_ME`.

### Trigger run starts but fails during generation

Check provider and Supabase service-role env vars in the `trigger dev` shell:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Also check provider quota/rate-limit errors.

### Dashboard does not update live

Check that migration `20260614000002_storage_and_realtime.sql` applied, including:

- `alter publication supabase_realtime add table public.stories;`
- `alter table public.stories replica identity full;`

Then refresh the page and retry with Supabase Realtime logs open.

### Images do not render in the book

Check Storage object paths and signed URL creation:

- story row has `cover_image_path`;
- `manifest.coverImageUrl` and page `imageUrl` values are Storage paths;
- objects exist in the private `story-images` bucket;
- the signed URL request is made by the authenticated user who owns the story.

## Cleanup

Stop the four long-running processes with Ctrl-C:

- Vite dev server
- Supabase Edge Function server
- Trigger.dev dev worker
- Supabase local stack if desired:

```bash
cd supabase
supabase stop
```
