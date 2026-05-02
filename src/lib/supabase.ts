import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[EduGrow] Supabase env vars not set. ' +
    'Set SUPABASE_URL and SUPABASE_ANON_KEY in Replit Secrets to enable full functionality.'
  );
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || PLACEHOLDER_URL,
  SUPABASE_ANON_KEY || PLACEHOLDER_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'edugrow-auth',
    },
  }
);

export const MOBILE_EMAIL_DOMAIN = '@edugrow.local';
export const mobileToEmail = (mobile: string): string =>
  `${mobile.trim()}${MOBILE_EMAIL_DOMAIN}`;
export const emailToMobile = (email: string): string =>
  email.replace(MOBILE_EMAIL_DOMAIN, '');
