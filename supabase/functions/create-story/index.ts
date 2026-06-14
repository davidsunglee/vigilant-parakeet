import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
      progress_step: "Queued…",
      progress_pct: 0,
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
  const triggerApiUrl = Deno.env.get("TRIGGER_API_URL") ?? "https://api.trigger.dev";
  const triggerResponse = await fetch(
    `${triggerApiUrl}/api/v1/tasks/generate-story/trigger`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("TRIGGER_SECRET_KEY")}`,
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
});
