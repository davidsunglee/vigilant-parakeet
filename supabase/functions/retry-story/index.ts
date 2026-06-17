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

// A `generating` story whose `updated_at` is older than this is treated as
// stalled (its run expired/never started or the worker died mid-run) and is
// eligible for retry, since no progress will ever arrive. Keep in sync with
// STALLED_AFTER_MS in apex/src/types/story.types.ts.
const STALLED_AFTER_MS = 5 * 60 * 1000;

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

  // Service role bypasses RLS, so verify ownership and retry-eligibility here.
  const { data: story, error: loadError } = await supabase
    .from("stories")
    .select("id, owner_id, status, animal_a, animal_b, art_style, fierce_mode, updated_at")
    .eq("id", storyId)
    .single();

  if (loadError || !story) {
    return json({ error: "Story not found" }, 404);
  }
  if (story.owner_id !== user.id) {
    return json({ error: "Not your story" }, 403);
  }
  // Retryable if it failed, or if it is a stalled generating run (expired/never
  // started or worker died) whose updated_at has gone cold. A freshly generating
  // story is still in flight and cannot be retried.
  const updatedAtMs = story.updated_at ? new Date(story.updated_at as string).getTime() : NaN;
  const isStalled = story.status === "generating" &&
    Number.isFinite(updatedAtMs) &&
    Date.now() - updatedAtMs > STALLED_AFTER_MS;
  if (story.status !== "failed" && !isStalled) {
    return json({ error: "Only a failed or stalled story can be retried" }, 409);
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
