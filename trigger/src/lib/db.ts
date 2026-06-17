import type { SupabaseClient } from '@supabase/supabase-js';
import type { IStoryManifest, StoryProgress } from '../types/story.types';

/**
 * `stories`-row helpers for the generation task. Each takes the service-role
 * client so the task can read/write progress, checkpoint manifest, and the
 * terminal status of any owner's row (RLS is bypassed by the service role).
 */

/**
 * Load the persisted manifest checkpoint for a story, or `null` if none yet.
 * Narrative phases consult this to resume mid-pipeline on a retry instead of
 * re-calling the LLM for work already completed.
 */
export async function loadCheckpoint(
  client: SupabaseClient,
  storyId: string,
): Promise<Partial<IStoryManifest> | null> {
  const { data, error } = await client
    .from('stories')
    .select('manifest')
    .eq('id', storyId)
    .single();
  if (error) throw error;
  return (data?.manifest as Partial<IStoryManifest> | null) ?? null;
}

/** Write the live canonical progress so Realtime subscribers see it. */
export async function updateProgress(
  client: SupabaseClient,
  storyId: string,
  progress: StoryProgress,
): Promise<void> {
  const { error } = await client
    .from('stories')
    .update({ progress })
    .eq('id', storyId);
  if (error) throw error;
}

/**
 * Merge a partial manifest into the stored `manifest` JSONB. Phases call this
 * after completing so a re-run skips already-checkpointed work.
 */
export async function saveManifest(
  client: SupabaseClient,
  storyId: string,
  manifest: Partial<IStoryManifest>,
): Promise<void> {
  const current = await loadCheckpoint(client, storyId);
  const merged = { ...(current ?? {}), ...manifest };
  const { error } = await client
    .from('stories')
    .update({ manifest: merged })
    .eq('id', storyId);
  if (error) throw error;
}

/** Record the cover image Storage path once the cover is uploaded. */
export async function setCoverPath(
  client: SupabaseClient,
  storyId: string,
  path: string,
): Promise<void> {
  const { error } = await client
    .from('stories')
    .update({ cover_image_path: path })
    .eq('id', storyId);
  if (error) throw error;
}

/**
 * Mark a story `ready`: persist the final manifest + title and set progress to
 * 100%. Runs only after `runGenerationPipeline` resolves successfully.
 */
export async function finalize(
  client: SupabaseClient,
  storyId: string,
  manifest: IStoryManifest,
  title: string,
): Promise<void> {
  const { error } = await client
    .from('stories')
    .update({ manifest, title, status: 'ready' })
    .eq('id', storyId);
  if (error) throw error;
}

/**
 * Mark a story `failed` and record the error message. Called only on the
 * terminal attempt so transient failures still retry.
 */
export async function fail(
  client: SupabaseClient,
  storyId: string,
  error: string,
): Promise<void> {
  const { error: dbError } = await client
    .from('stories')
    .update({ status: 'failed', error })
    .eq('id', storyId);
  if (dbError) throw dbError;
}
