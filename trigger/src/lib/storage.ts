import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'story-images';

/**
 * Upload a base64-encoded PNG to the private `story-images` bucket at `path`.
 *
 * Decodes the base64 to raw bytes and uploads with `upsert: true` so that a
 * retry that regenerates an image overwrites cleanly. Returns the stored path
 * (the manifest holds Storage paths, not base64).
 */
export async function uploadImage(
  client: SupabaseClient,
  path: string,
  base64: string,
): Promise<string> {
  const bytes = Buffer.from(base64, 'base64');
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/png', upsert: true });
  if (error) throw error;
  return path;
}

/**
 * Whether an object already exists at `path` in the `story-images` bucket.
 *
 * Lists the object's directory and checks for the filename. Used for
 * skip-if-exists checkpoint resumption: an image that survived a previous
 * attempt is not regenerated (and not re-paid for) on a retry. A listing
 * error is treated as "does not exist" so generation proceeds.
 */
export async function imageExists(
  client: SupabaseClient,
  path: string,
): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const dirname = slash >= 0 ? path.slice(0, slash) : '';
  const filename = slash >= 0 ? path.slice(slash + 1) : path;
  const { data, error } = await client.storage.from(BUCKET).list(dirname);
  if (error) return false;
  return (data ?? []).some((entry: { name: string }) => entry.name === filename);
}
