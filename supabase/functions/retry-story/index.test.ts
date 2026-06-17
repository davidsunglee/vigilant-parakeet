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

Deno.test("retrying a freshly generating story returns 409 and does not reset", async () => {
  const { client, updates } = makeFakeSupabase({
    story: { id: "story-1", owner_id: "user-123", status: "generating", animal_a: "cat", animal_b: "dog", art_style: "watercolor", fierce_mode: false, updated_at: new Date().toISOString() },
  });
  const res = await handleRequest(makeRequest(), makeDeps(client));
  assertEquals(res.status, 409);
  assertEquals(updates.length, 0);
});

Deno.test("retrying a stalled generating story resets the row and re-triggers", async () => {
  const stale = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { client, updates } = makeFakeSupabase({
    story: { id: "story-1", owner_id: "user-123", status: "generating", animal_a: "cat", animal_b: "dog", art_style: "watercolor", fierce_mode: false, updated_at: stale },
  });
  const res = await handleRequest(makeRequest(), makeDeps(client));
  assertEquals(res.status, 200);
  assertEquals(updates[0].status, "generating");
  assertEquals(updates[0].error, null);
  assertEquals(updates[0].progress, { phase: "queued" });
  assertEquals(updates.length, 1);
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
