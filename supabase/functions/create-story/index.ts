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

export async function handleRequest(req: Request, deps: Deps = defaultDeps): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Verify the caller's JWT
  const authHeader = req.headers.get("Authorization");
  const jwt = authHeader?.replace("Bearer ", "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = deps.createClient(
    deps.env("SUPABASE_URL")!,
    deps.env("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate the request body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { animalA, animalB } = body;
  if (!animalA || typeof animalA !== "string" || animalA.trim() === "") {
    return new Response(JSON.stringify({ error: "animalA is required and must be a non-empty string" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!animalB || typeof animalB !== "string" || animalB.trim() === "") {
    return new Response(JSON.stringify({ error: "animalB is required and must be a non-empty string" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const artStyle = (typeof body.artStyle === "string" && body.artStyle) ? body.artStyle : "surprise";
  const fierceMode = typeof body.fierceMode === "boolean" ? body.fierceMode : false;

  // Insert the story row
  const { data: story, error: insertError } = await supabase
    .from("stories")
    .insert({
      owner_id: user.id,
      status: 'generating',
      animal_a: animalA,
      animal_b: animalB,
      art_style: artStyle,
      fierce_mode: fierceMode,
      progress: { phase: "queued" },
    })
    .select("id")
    .single();

  if (insertError || !story) {
    return new Response(JSON.stringify({ error: "Failed to create story" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Trigger the Trigger.dev task via REST endpoint.
  // The Deno runtime uses the REST endpoint rather than the Node @trigger.dev/sdk
  // to avoid runtime-compat risk (the SDK is designed for Node and may not run under Deno).
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
            animalA,
            animalB,
            options: { artStyle, fierceMode },
            generationConfig: {
              textModel: "claude-sonnet-4-20250514",
              imageModel: "gpt-image-2",
              imageQuality: 'medium',
            },
          },
        }),
      }
    );
  } catch (err) {
    // DNS/network/TLS/runtime exceptions never produce a Response, so the
    // !triggerResponse.ok rollback below cannot run. Best-effort mark the row
    // as failed so it does not stay stuck in `generating`, then return 502.
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("stories")
      .update({ status: "failed", error: `Failed to enqueue generation: ${message}` })
      .eq("id", story.id);

    return new Response(JSON.stringify({ error: "Failed to enqueue generation task" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Roll back on trigger failure
  if (!triggerResponse.ok) {
    await supabase
      .from("stories")
      .update({ status: "failed", error: "Failed to enqueue generation" })
      .eq("id", story.id);

    return new Response(JSON.stringify({ error: "Failed to enqueue generation task" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ storyId: story.id }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

if (import.meta.main) {
  Deno.serve((req: Request) => handleRequest(req));
}
