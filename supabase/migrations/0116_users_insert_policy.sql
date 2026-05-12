-- 0116_users_insert_policy.sql
-- public.users had SELECT + UPDATE policies but NO INSERT policy. RLS
-- normally lets service-role bypass any policy, but Supabase's new key
-- format (sb_secret_*) doesn't always carry the BYPASSRLS role attribute
-- through PostgREST. Server endpoints that legitimately insert into
-- public.users (admin /create-school-user, principal /students/admit,
-- super-admin /onboard-school) then fail with:
--
--   new row violates row-level security policy for table "users"
--
-- Add an explicit INSERT policy so the write succeeds regardless of
-- whether the bypass is honoured. Three permitted writers:
--
--   1. service_role JWT       — server endpoints using SUPABASE_SERVICE_ROLE_KEY.
--   2. SUPER_ADMIN             — onboarding new principals.
--   3. Same-school PRINCIPAL   — admitting students / hiring staff in
--                                their own school (school_id must match).
--
-- WITH CHECK (instead of permissive USING) bounds the rows a non-admin
-- can insert — a malicious principal can't seed a row into another school.

DROP POLICY IF EXISTS users_insert_admin ON public.users;

CREATE POLICY users_insert_admin ON public.users
  FOR INSERT
  WITH CHECK (
    -- Service role keys bypass RLS by intent; carry an explicit allow so
    -- when the bypass doesn't fire (new-format keys / proxy quirks) the
    -- write still goes through.
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.is_super_admin()
    OR (
      public.is_principal()
      AND school_id = public.current_user_school_id()
    )
  );
