import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client for the Trigger.dev task.
 *
 * Uses the service-role key (server-side only, never shipped to the browser),
 * so it bypasses RLS and can write progress/manifest rows and upload Storage
 * objects on behalf of any owner. Token auto-refresh and session persistence
 * are disabled because the task is a stateless server process.
 */
export function createServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export type ServiceClient = ReturnType<typeof createServiceClient>;
