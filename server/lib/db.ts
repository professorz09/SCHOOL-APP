import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.SUPABASE_URL  ?? '';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY      = process.env.SUPABASE_ANON_KEY ?? '';

// Hard fail at boot if the service role key is missing OR if the
// caller has accidentally pasted the ANON key into the SERVICE_ROLE
// slot (very common Supabase setup mistake — both keys come from the
// same Project Settings page).
//
// Supabase JWTs carry `"role": "service_role"` in their payload for
// the real service key vs `"role": "anon"` for the public anon key.
// We decode the middle JWT segment (no signature check needed; we
// just need the role claim) and bail with a clear message if it's
// not 'service_role'. Without this, the server boots fine, every
// adminDb call silently behaves as anon, and every insert fails
// with "new row violates row-level security policy".
function decodeJwtRole(jwt: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch { return null; }
}

if (!SUPABASE_URL) {
  throw new Error('[api] SUPABASE_URL missing — set it in .env or .env.local');
}
if (!SERVICE_KEY) {
  throw new Error('[api] SUPABASE_SERVICE_ROLE_KEY missing — set it in .env or .env.local. Without it every server-side insert will fail with an RLS error.');
}
{
  const role = decodeJwtRole(SERVICE_KEY);
  if (role && role !== 'service_role') {
    throw new Error(
      `[api] SUPABASE_SERVICE_ROLE_KEY decodes to role="${role}", expected "service_role". ` +
      `Looks like you've pasted the ANON key into the SERVICE_ROLE_KEY slot — ` +
      `they look almost identical in the Supabase dashboard. ` +
      `Open Project Settings → API and copy the *service_role* secret (NOT the anon key) into .env.local.`,
    );
  }
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
