// Shared admin client for migration & seed scripts.
// Uses SUPABASE_SERVICE_ROLE_KEY — must NEVER be imported by frontend code.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

export const adminClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const SUPABASE_URL = url;
export const SUPABASE_SERVICE_ROLE_KEY = serviceKey;
