import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.SUPABASE_URL  ?? '';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY      = process.env.SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn('[api] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
}

export const adminDb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const anonDb: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function userDb(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
