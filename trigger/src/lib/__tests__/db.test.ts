import { describe, expect, it } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IStoryManifest } from '../../types/story.types';
import { fail, finalize, updateProgress } from '../db';

/**
 * Minimal chainable stand-in for the supabase client:
 * `from(table).update(payload).eq(col, value)` resolves to `{ error: null }`
 * and records the table, the update payload, and the row id it filtered on.
 */
function createFakeClient() {
  const calls: {
    table?: string;
    payload?: Record<string, unknown>;
    id?: string;
  } = {};
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        update(payload: Record<string, unknown>) {
          calls.payload = payload;
          return {
            eq(_column: string, value: string) {
              calls.id = value;
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('db helpers', () => {
  it('updateProgress issues an update with progress_step/progress_pct', async () => {
    const { client, calls } = createFakeClient();
    await updateProgress(client, 'story-1', 'Writing the showdown…', 42);
    expect(calls.table).toBe('stories');
    expect(calls.id).toBe('story-1');
    expect(calls.payload).toEqual({
      progress_step: 'Writing the showdown…',
      progress_pct: 42,
    });
  });

  it('finalize sets status=ready and progress_pct=100', async () => {
    const { client, calls } = createFakeClient();
    const manifest = { metadata: { title: 'Lion vs Bear' } } as unknown as IStoryManifest;
    await finalize(client, 'story-2', manifest, 'Lion vs Bear');
    expect(calls.id).toBe('story-2');
    expect(calls.payload?.status).toBe('ready');
    expect(calls.payload?.progress_pct).toBe(100);
    expect(calls.payload?.title).toBe('Lion vs Bear');
    expect(calls.payload?.manifest).toBe(manifest);
  });

  it('fail sets status=failed and error', async () => {
    const { client, calls } = createFakeClient();
    await fail(client, 'story-3', 'provider 500');
    expect(calls.id).toBe('story-3');
    expect(calls.payload?.status).toBe('failed');
    expect(calls.payload?.error).toBe('provider 500');
  });
});
