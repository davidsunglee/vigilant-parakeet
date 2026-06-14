import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest, type Deps } from "./index.ts";

// Minimal fake Supabase client that records the update applied to the story row.
function makeFakeSupabase() {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    auth: {
      // deno-lint-ignore require-await
      getUser: async (_jwt: string) => ({ data: { user: { id: "user-123" } }, error: null }),
    },
    from(_table: string) {
      return {
        insert(_row: Record<string, unknown>) {
          return {
            select(_cols: string) {
              return {
                // deno-lint-ignore require-await
                single: async () => ({ data: { id: "story-456" }, error: null }),
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

function makeDeps(overrides: Partial<Deps>): Deps {
  const { client } = makeFakeSupabase();
  return {
    // deno-lint-ignore no-explicit-any
    createClient: (() => client) as any,
    fetch: () => Promise.resolve(new Response(null, { status: 200 })),
    env: (_key: string) => "test",
    ...overrides,
  };
}

function makeRequest() {
  return new Request("https://example.com/create-story", {
    method: "POST",
    headers: { Authorization: "Bearer fake-jwt", "Content-Type": "application/json" },
    body: JSON.stringify({ animalA: "cat", animalB: "dog" }),
  });
}

Deno.test("enqueue fetch throwing returns 502 and marks story failed", async () => {
  const { client, updates } = makeFakeSupabase();
  const deps = makeDeps({
    // deno-lint-ignore no-explicit-any
    createClient: (() => client) as any,
    fetch: () => {
      throw new TypeError("error sending request for url (dns error)");
    },
  });

  const res = await handleRequest(makeRequest(), deps);

  assertEquals(res.status, 502);
  // The inserted row must not be left stuck in `generating`.
  assertEquals(updates.length, 1);
  assertEquals(updates[0].status, "failed");
});

Deno.test("enqueue fetch returning non-ok returns 502 and marks story failed", async () => {
  const { client, updates } = makeFakeSupabase();
  const deps = makeDeps({
    // deno-lint-ignore no-explicit-any
    createClient: (() => client) as any,
    fetch: () => Promise.resolve(new Response(null, { status: 500 })),
  });

  const res = await handleRequest(makeRequest(), deps);

  assertEquals(res.status, 502);
  assertEquals(updates.length, 1);
  assertEquals(updates[0].status, "failed");
});

Deno.test("successful enqueue returns 200 with storyId", async () => {
  const { client, updates } = makeFakeSupabase();
  const deps = makeDeps({
    // deno-lint-ignore no-explicit-any
    createClient: (() => client) as any,
    fetch: () => Promise.resolve(new Response(null, { status: 200 })),
  });

  const res = await handleRequest(makeRequest(), deps);

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { storyId: "story-456" });
  assertEquals(updates.length, 0);
});
