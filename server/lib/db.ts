import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.SUPABASE_URL  ?? '';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY      = process.env.SUPABASE_ANON_KEY ?? '';

// Hard fail at boot if the service role key is missing. Earlier this
// just printed a console.warn — the server kept running with adminDb
// silently degraded to anon, and every "service-role-only" insert
// (leave/submit, notice/create, expense/add, …) would surface as
// "new row violates row-level security policy". The error read like
// a permissions bug in the app code, not an env-config issue.
//
// Loud-fail here so a missing env var is caught at boot, not at the
// first user-facing write.
if (!SUPABASE_URL) {
  throw new Error('[api] SUPABASE_URL missing — set it in .env or .env.local');
}
if (!SERVICE_KEY) {
  throw new Error('[api] SUPABASE_SERVICE_ROLE_KEY missing — set it in .env or .env.local. Without it every server-side insert will fail with an RLS error.');
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
