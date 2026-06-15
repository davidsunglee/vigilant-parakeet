# vigilant-parakeet

A web application that generates illustrated educational storybooks in the style of the *"Who Would Win?"* series. A logged-in user starts a generation, which runs server-side in a durable task, survives browser closure, and persists its narrative and images to a multi-user backend.

## Architecture

- **Web client (Vercel):** React SPA at `apex/`, authenticates via Supabase, triggers story generation via Edge Function, reads its catalog from Postgres, watches live progress via Realtime, and renders images from signed Storage URLs.
- **Backend & persistence (Supabase):** Postgres `stories` catalog (row-level security scoped to the owner), Auth (Google OAuth + magic link), `story-images` Storage bucket for generated images, Realtime on catalog updates, and the `create-story` Edge Function.
- **Durable task runner (Trigger.dev):** Runs the `generate-story` task server-side with Claude Sonnet (text) + gpt-image-2 (images), persisting checkpoints and images so retries resume, not restart.

See [`apex/README.md`](apex/README.md) for the full architecture documentation.
