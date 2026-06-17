---
name: run-app-locally
description: Use when you need to run, launch, boot, start, or locally test the vigilant-parakeet "Apex / Who Would Win?" app end to end. Covers the local Supabase stack (Docker via OrbStack), the create-story/retry-story edge functions, the Vite SPA, the Trigger.dev worker, magic-link sign-in via Mailpit, and the local-dev gotchas that bite (stale schema, unloaded secrets, mail that never arrives).
---

# Run the app locally

## Overview

This app is four tiers that must all be up to generate a story:

- **apex**: React + Vite SPA (`apex/`, port 5173). Talks to local Supabase.
- **Supabase**: local Docker stack (Postgres, Auth, Storage, Realtime, edge runtime, Mailpit). Needs the Docker engine, which **OrbStack** provides.
- **Edge functions**: Deno `create-story` / `retry-story` (`supabase/functions/`). Verify the JWT, insert the `stories` row, and enqueue the Trigger.dev task over REST.
- **Trigger.dev worker**: runs the `generate-story` task. The **only** non-local piece: it registers with the Trigger.dev cloud dev environment but **executes on your machine**, calling Anthropic (text) + OpenAI (images) and writing back to local Supabase.

Flow: SPA → `create-story` edge fn → Trigger.dev cloud (enqueue) → local worker runs generation → writes progress/images to Supabase → Realtime updates the SPA.

## Prerequisites (one-time)

- **OrbStack running** (provides the Docker daemon `supabase start` needs). Confirm with `docker info` (the active context should reach the daemon).
- CLIs installed: `node`, `npm`, `bun`, `deno`, `supabase`.
- `npm install` in `apex/`; `bun install` in `trigger/` (node_modules are gitignored).
- **Trigger.dev:** `cd trigger && npx trigger.dev@latest login`. The project ref is already set in `trigger/trigger.config.ts` (`proj_lhevqdnezjyfvmxpxfql`, org "Parakeets, Inc"). Verify with `npx trigger.dev@latest whoami`.
- Env files already exist (gitignored), pre-pointed at the local stack: `apex/.env`, `supabase/.env.local`, `trigger/local.env`.

## Launch sequence

Run each in its own terminal (3 of the 4 are long-lived). All paths are from the repo root.

**1. Supabase stack**
```bash
# Empty values just silence the Google-OAuth env warnings (Google sign-in is not wired up locally).
export SUPABASE_AUTH_GOOGLE_CLIENT_ID="" SUPABASE_AUTH_GOOGLE_SECRET=""
supabase start
```
The anon/service keys are deterministic and already match the env files, so no copying is needed.

**2. Edge functions** (serve explicitly so the Trigger secret loads)
```bash
supabase functions serve --env-file ./supabase/.env.local
```
`supabase start` already auto-serves functions, but it does **not** load `supabase/.env.local`. The platform auto-injects `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (you'll see "Env name cannot start with SUPABASE_, skipping", which is expected), but `TRIGGER_SECRET_KEY` / `TRIGGER_API_URL` only arrive via `--env-file`. Without this, `create-story` inserts the row but the enqueue fails and the story rolls back to `failed`.

**3. apex SPA**
```bash
cd apex && npm run dev      # http://localhost:5173
```

**4. Trigger.dev worker** (load `local.env` first)
```bash
cd trigger
set -a; source ./local.env; set +a   # ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npx trigger.dev@latest dev
```
The dev CLI only auto-loads `.env`-named files, **not** `local.env`, so source it manually or the task can't reach the LLM/image APIs. Wait for `Local worker ready` and a `generate-story` run line. The `ExperimentalWarning: localStorage` / `punycode` `Error:` lines are harmless Node warnings.

## Sign in locally (magic link via Mailpit)

There is **no real email** in local dev. Auth emails are captured by **Mailpit at http://127.0.0.1:54324**; they never reach a real inbox, so do not wait on Gmail.

1. Open http://localhost:5173, enter any email, "Send me a magic link".
2. Open Mailpit (`http://127.0.0.1:54324`) and click the link. To pull it from the CLI instead:
   ```bash
   curl -s http://127.0.0.1:54324/api/v1/message/latest | python3 -c '
   import sys, json, re, html
   d = json.load(sys.stdin)
   body = (d.get("HTML") or "") + (d.get("Text") or "")
   m = re.search(r"https?://127\.0\.0\.1:54321/auth/v1/verify[^\s\"<>]+", body)
   print(html.unescape(m.group(0)) if m else "none")
   '
   ```
Links are single-use and time-limited; resend and grab the newest if expired. Google OAuth is intentionally not configured locally.

## Verify end to end

Sign in → "Begin a new matchup" (e.g. Cat vs Dog) → watch progress advance through phases → confirm the book finishes with cover art and is readable. Check live DB state any time:
```bash
docker exec -i "$(docker ps --filter name=supabase_db -q)" \
  psql -U postgres -d postgres -At \
  -c "select animal_a||' vs '||animal_b, status, progress, coalesce(error,'-') from public.stories order by created_at desc;"
```
A full generation makes **real, paid** Anthropic + OpenAI calls (~27 image calls per book). Don't trigger one casually.

## Ports

| Service | URL |
|---|---|
| Vite SPA | http://localhost:5173 |
| Supabase API + Edge Functions | http://127.0.0.1:54321 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio | http://127.0.0.1:54323 |
| Mailpit (local email) | http://127.0.0.1:54324 |

## Common mistakes

| Symptom | Cause / fix |
|---|---|
| Magic-link email never arrives | It went to **Mailpit** (`:54324`), not real email. |
| Insert fails / columns look wrong (e.g. no `progress` column) | `supabase start` restored a DB built from an older version of a migration. Run **`supabase db reset`** to re-apply migrations from scratch. |
| Story created but immediately `failed` / never picked up | Edge functions not served with `--env-file ./supabase/.env.local` (missing `TRIGGER_SECRET_KEY`), or the worker isn't running. |
| Worker runs but generation errors on missing keys | You didn't `set -a; source ./local.env; set +a` before `trigger.dev dev`. |
| `supabase start` fails | OrbStack/Docker isn't running, or the daemon is unreachable (`docker info`). |
| Google sign-in does nothing | Not configured locally; use the magic link. |

## Tear down

`Ctrl-C` the three dev servers (functions serve, vite, trigger dev), then `supabase stop`. `supabase stop --no-backup` discards local DB state.
