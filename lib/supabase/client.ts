/**
 * Supabase browser client (recreated — module was lost in a bad merge on
 * main). Returns null when Supabase env vars are not configured so callers
 * can degrade gracefully; apps/web has its own configured client.
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

export function createClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  cached =
    url && anonKey
      ? createSupabaseClient(url, anonKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        })
      : null;

  if (!cached) {
    console.warn('[supabase/client] NEXT_PUBLIC_SUPABASE_* not configured — returning null');
  }
  return cached;
}

export default createClient;
