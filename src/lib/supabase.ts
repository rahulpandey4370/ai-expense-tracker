import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_PROJECT_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase environment variables (SUPABASE_PROJECT_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured.');
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
