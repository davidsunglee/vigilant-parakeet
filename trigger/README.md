# Trigger.dev — generate-story task

This directory contains the Trigger.dev v4 project that runs story generation server-side.

## Deploy workflow

**`proj_REPLACE_ME` in `trigger.config.ts` is an intentional sentinel — you MUST replace it before deploying.**

1. **Login:** `npx trigger.dev@latest login`

2. **Init / link the cloud project** (run from this `trigger/` directory):
   ```bash
   npx trigger.dev@latest init
   ```
   This creates or links the Trigger.dev cloud project and gives you a `proj_...` reference.

3. **Replace the sentinel** in `trigger.config.ts`:
   ```ts
   project: "proj_REPLACE_ME",  // ← replace with your proj_... reference
   ```

4. **Set environment variables** as Trigger.dev secrets (in the Trigger.dev dashboard or via CLI):
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

5. **Deploy:**
   ```bash
   npx trigger.dev@latest deploy
   ```

## Local development

```bash
bun install
npx trigger.dev@latest dev
```

## Tests

```bash
bun test
```

The unit suite does not require a real Trigger.dev project reference or live API keys.
