-- =============================================================
-- 0142_users_insert_policy_auth_role.sql
-- =============================================================
-- 0116 added an INSERT policy on public.users with three branches:
--   1. (auth.jwt() ->> 'role') = 'service_role'
--   2. is_super_admin()
--   3. is_principal() AND school_id = current_user_school_id()
--
-- Branch 1 was meant to be the server-side escape hatch when the
-- Express routes call via adminDb (service-role key). It worked for
-- legacy JWT-format keys but NOT for the new sb_secret_* keys —
-- those are opaque tokens, not JWTs, so auth.jwt() returns null /
-- empty and the role check fails. Branches 2 and 3 also fail in
-- service-role context because auth.uid() is null → is_principal()
-- = false.
--
-- Result: principal taps "Admit Student" → server calls
-- adminDb.from('users').insert(parent_row) → RLS rejects with
-- "new row violates row-level security policy for table users".
--
-- Fix: use auth.role() instead. Supabase's auth.role() reads the
-- executor role directly from the PostgREST context and returns
-- 'service_role' / 'authenticated' / 'anon' regardless of key
-- format. Kept the legacy auth.jwt() branch alongside as defence
-- in depth — costs nothing and keeps the policy working on any
-- mix of key versions.
-- =============================================================

BEGIN;

DROP POLICY IF EXISTS users_insert_admin ON public.users;

CREATE POLICY users_insert_admin ON public.users
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR public.is_super_admin()
    OR (
      public.is_principal()
      AND school_id = public.current_user_school_id()
    )
  );

COMMIT;
