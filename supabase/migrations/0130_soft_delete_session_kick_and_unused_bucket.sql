-- ─────────────────────────────────────────────────────────────────────────────
-- Two follow-up security fixes from the deeper audit.
--
-- 1. SOFT-DELETE LEAVES EXISTING SESSIONS ALIVE
--    `soft_delete_school` (0127) sets schools.status='INACTIVE' and
--    schools.deleted_at = NOW(). The login route refuses new sessions
--    once status is INACTIVE, but JWTs already issued continue working
--    until the access-token TTL expires (~1 hour). RLS policies on
--    every child table gate by `school_id = current_user_school_id()`,
--    not by `schools.deleted_at`, so the holder of a stale JWT keeps
--    reading and (within their role's permissions) writing for up to
--    an hour after their school is soft-deleted.
--    Fix: extend `soft_delete_school` to also set is_active=FALSE for
--    every user of the school. The `requireAuth` middleware already
--    has `.eq('is_active', true)` so the next API call those users
--    make returns 401 and they're effectively kicked out. Mirror the
--    reverse in `restore_school` so a within-30-day restore wakes the
--    users back up.
--
-- 2. UNUSED FEE-SCREENSHOTS BUCKET STILL ACCEPTS UPLOADS
--    Migration 0050 dropped fee-screenshot uploads — parents now type
--    a UTR / reference text instead of attaching an image. The
--    `fee-screenshots` bucket and its INSERT policy were left in
--    place "to be cleaned up later". Today any authenticated parent
--    can still upload up to 5MB images into <school_id>/<student_id>/*
--    via the public Supabase storage API. Nothing in the app reads
--    these bytes anymore, so it's pure attack surface (storage abuse,
--    NSFW upload, etc.).
--    Fix: drop the INSERT policy. SELECT + DELETE for principal /
--    super-admin stay so any pre-existing files can be reviewed and
--    cleaned. The bucket row itself can be dropped in a later
--    operational migration once you've confirmed there are no
--    legitimate files left.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Fix 1: soft-delete kicks all school users out ──────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_school(
  p_school_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_sch  UUID;
  v_allowed     BOOLEAN;
  v_requested   TIMESTAMPTZ;
  v_already_del TIMESTAMPTZ;
  v_users_kicked INT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT role, school_id INTO v_caller_role, v_caller_sch
  FROM public.users WHERE id = v_caller_id;
  IF v_caller_role <> 'PRINCIPAL' OR v_caller_sch <> p_school_id THEN
    RAISE EXCEPTION 'only the school principal can perform soft delete' USING ERRCODE = '42501';
  END IF;

  SELECT deletion_allowed, deletion_requested_at, deleted_at
    INTO v_allowed, v_requested, v_already_del
    FROM public.schools WHERE id = p_school_id FOR UPDATE;

  IF v_already_del IS NOT NULL THEN
    RAISE EXCEPTION 'school already soft-deleted';
  END IF;
  IF v_requested IS NULL THEN
    RAISE EXCEPTION 'no pending deletion request — request first';
  END IF;
  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'super-admin has not approved deletion for this school yet';
  END IF;

  PERFORM set_config('app.allow_deletion_columns', 'true', true);
  UPDATE public.schools
     SET deleted_at = NOW(),
         deleted_by = v_caller_id,
         status     = 'INACTIVE',
         updated_at = NOW()
   WHERE id = p_school_id;

  -- Kick every user of the school: their next API request hits
  -- requireAuth which filters `is_active=true` and 401s them. This
  -- closes the ~1 hour window where stale JWTs were still usable
  -- after soft-delete. Reverse in `restore_school`.
  UPDATE public.users
     SET is_active = FALSE,
         updated_at = NOW()
   WHERE school_id = p_school_id;
  GET DIAGNOSTICS v_users_kicked = ROW_COUNT;

  INSERT INTO public.audit_logs (school_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, v_caller_id, 'SCHOOL_SOFT_DELETED', 'school', p_school_id,
          jsonb_build_object('users_kicked', v_users_kicked));
END;
$$;
REVOKE ALL ON FUNCTION public.soft_delete_school(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_school(UUID) TO authenticated;


-- ─── Restore: also re-activates every user of the school ────────────────────
CREATE OR REPLACE FUNCTION public.restore_school(
  p_school_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_deleted_at  TIMESTAMPTZ;
  v_users_woken INT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super-admin can restore a school' USING ERRCODE = '42501';
  END IF;
  SELECT deleted_at INTO v_deleted_at FROM public.schools WHERE id = p_school_id FOR UPDATE;
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'school is not soft-deleted';
  END IF;
  IF v_deleted_at < NOW() - INTERVAL '30 days' THEN
    RAISE EXCEPTION 'restore window of 30 days has passed; contact engineering';
  END IF;

  PERFORM set_config('app.allow_deletion_columns', 'true', true);
  UPDATE public.schools
     SET deleted_at             = NULL,
         deleted_by             = NULL,
         deletion_requested_at  = NULL,
         deletion_requested_by  = NULL,
         deletion_request_note  = NULL,
         deletion_allowed       = FALSE,
         deletion_allowed_at    = NULL,
         deletion_allowed_by    = NULL,
         status                 = 'ACTIVE',
         updated_at             = NOW()
   WHERE id = p_school_id;

  -- Wake users back up. We only flip rows that were kicked by the
  -- soft-delete (is_active=FALSE) so a separately-deactivated
  -- individual (e.g. principal manually deactivated a teacher before
  -- the school-level delete) stays deactivated.
  UPDATE public.users
     SET is_active = TRUE,
         updated_at = NOW()
   WHERE school_id = p_school_id
     AND is_active = FALSE;
  GET DIAGNOSTICS v_users_woken = ROW_COUNT;

  INSERT INTO public.audit_logs (school_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, v_caller_id, 'SCHOOL_RESTORED', 'school', p_school_id,
          jsonb_build_object('users_woken', v_users_woken));
END;
$$;
REVOKE ALL ON FUNCTION public.restore_school(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_school(UUID) TO authenticated;


-- ─── Fix 2: lock down unused fee-screenshots bucket INSERT ──────────────────
-- Drop INSERT policy entirely. With no INSERT policy and RLS enabled,
-- the bucket rejects all new uploads. SELECT + DELETE policies stay
-- so principal / super-admin can review and clean up any
-- pre-existing files. The bucket row itself can be DROPped in a
-- follow-up operational migration once content audit is done.
DROP POLICY IF EXISTS fee_screenshots_insert ON storage.objects;
