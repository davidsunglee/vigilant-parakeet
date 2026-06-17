import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { StoryRecord } from '../types/story.types';

const STORY_IMAGES_BUCKET = 'story-images';

export interface CreateStoryInput {
  animalA: string;
  animalB: string;
  artStyle: string;
  fierceMode: boolean;
}

export type StoryChangeHandler = (
  payload: RealtimePostgresChangesPayload<StoryRecord>,
) => void;

/**
 * Reads the durable story catalog from Postgres (RLS-scoped to the signed-in
 * user), triggers server-side generation via the `create-story` Edge Function,
 * watches owner-filtered Realtime changes, and resolves short-lived signed URLs
 * for private Storage objects. Replaces the previous browser-local catalog persistence layer.
 */
export class CatalogService {
  /**
   * Lists the signed-in user's stories, newest first. RLS scopes the result to
   * the authenticated owner — no client-side owner filter is needed.
   */
  static async listStories(): Promise<StoryRecord[]> {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as StoryRecord[];
  }

  /**
   * Fetches a single story row by id (RLS-scoped to the owner).
   */
  static async getStory(id: string): Promise<StoryRecord> {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as StoryRecord;
  }

  /**
   * Triggers a new server-side generation. The Edge Function verifies the
   * caller's JWT (attached automatically by supabase-js), inserts a
   * `generating` row, enqueues the Trigger.dev task, and returns `{ storyId }`
   * immediately — the row then arrives/updates via the Realtime subscription.
   */
  static async createStory(input: CreateStoryInput): Promise<string> {
    const { animalA, animalB, artStyle, fierceMode } = input;
    const { data, error } = await supabase.functions.invoke('create-story', {
      body: { animalA, animalB, artStyle, fierceMode },
    });

    if (error) throw error;
    const storyId = (data as { storyId?: string } | null)?.storyId;
    if (!storyId) throw new Error('create-story did not return a storyId');
    return storyId;
  }

  /**
   * Subscribes to owner-filtered Realtime changes on the `stories` table for
   * live progress and `ready`/`failed` transitions. Returns the channel so the
   * caller can `supabase.removeChannel(channel)` on cleanup.
   */
  static subscribeToStories(
    userId: string,
    handlers: StoryChangeHandler,
  ): RealtimeChannel {
    return supabase
      .channel('stories:' + userId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories',
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => handlers(payload as RealtimePostgresChangesPayload<StoryRecord>),
      )
      .subscribe();
  }

  /**
   * Resolves a batch of private Storage paths to short-lived signed URLs.
   * Returns a `path -> signedUrl` map, skipping any paths that failed to sign.
   */
  static async resolveSignedUrls(
    paths: string[],
    ttl = 3600,
  ): Promise<Record<string, string>> {
    if (paths.length === 0) return {};

    const { data, error } = await supabase.storage
      .from(STORY_IMAGES_BUCKET)
      .createSignedUrls(paths, ttl);

    if (error) throw error;

    const map: Record<string, string> = {};
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        map[item.path] = item.signedUrl;
      }
    }
    return map;
  }

  /**
   * Resolves a single private Storage path to a signed URL, or `null` if it
   * could not be signed.
   */
  static async resolveSignedUrl(path: string, ttl = 3600): Promise<string | null> {
    const map = await this.resolveSignedUrls([path], ttl);
    return map[path] ?? null;
  }

  /**
   * Re-triggers generation for a failed story. The `retry-story` Edge Function
   * verifies ownership, requires a `failed` row, resets it to `generating`, and
   * re-enqueues the task (which resumes from the checkpoint). Returns the storyId.
   */
  static async retryStory(id: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('retry-story', {
      body: { storyId: id },
    });

    if (error) throw error;
    const storyId = (data as { storyId?: string } | null)?.storyId;
    if (!storyId) throw new Error('retry-story did not return a storyId');
    return storyId;
  }

  /**
   * Deletes a story row (RLS-scoped to the owner).
   *
   * NOTE: Storage object cleanup is intentionally deferred for this slice.
   * Orphaned objects under `stories/{id}/...` remain readable only by the owner
   * under Storage RLS and can be reaped by a later maintenance job.
   */
  static async deleteStory(id: string): Promise<void> {
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
