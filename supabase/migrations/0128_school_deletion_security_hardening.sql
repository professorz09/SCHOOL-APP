-- ─────────────────────────────────────────────────────────────────────────────
-- Security hardening for the school-deletion workflow (migration 0127).
-- Three issues surfaced in post-merge review:
--
-- 1. CRITICAL — RLS hole. Policy `schools_principal_update` lets the
--    principal UPDATE any column of their own school row, including
--    `deletion_allowed`, `deletion_requested_at`, and `deleted_at`. A
--    malicious or compromised principal session could `UPDATE schools
--    SET deletion_allowed=TRUE WHERE id=mine` directly, bypassing the
--    super-admin approval step entirely. Same threat for `deleted_at`
--    (skip the request stage altogether).
--    Fix: BEFORE-UPDATE trigger that rejects writes to deletion_*
--    columns unless the caller is super-admin OR a known SECURITY
--    DEFINER RPC has flipped a transaction-local flag. Defense in
--    depth on top of the RPC role checks.
--
-- 2. HIGH — Foreign-key breakage. `audit_logs.school_id` had no ON
--    DELETE clause (defaults to NO ACTION). After 30 days, when
--    super-admin clicks "Permanent Delete", `DELETE FROM schools` would
--    be rejected by Postgres because audit_logs still references the
--    row. The destructive RPC would error out in production. Fix: alter
--    the FK to ON DELETE SET NULL so audit history survives the
--    referenced school being gone.
--
-- 3. MEDIUM — Orphaned users after permanent delete. `users.school_id`
--    is ON DELETE SET NULL, so after permanent delete every member of
--    that school has school_id=NULL but is_active=TRUE. The login-time
--    school-deleted check in auth.service skips when school_id is null
--    (which is correct for super-admins), so these orphaned users could
--    still establish sessions despite their school being gone. Fix:
--    inside permanent_delete_school RPC, set is_active=FALSE for every
--    user of the school before deleting. The existing
--    `if (!profile.is_active)` gate in buildSession then refuses them.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Fix 2: audit_logs FK ───────────────────────────────────────────────────
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_school_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_school_id_fkey
    FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


-- ─── Fix 1: guard trigger on deletion-workflow columns ──────────────────────
CREATE OR REPLACE FUNCTION public.guard_school_deletion_columns() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Super-admin can change anything via the admin policy.
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  -- Each of the 6 deletion RPCs flips this transaction-local flag right
  -- before its UPDATE; the trigger waves them through.
  BEGIN
    IF current_setting('app.allow_deletion_columns', true) = 'true' THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- setting absent — treat as not allowed
    NULL;
  END;
  -- Otherwise any change to a deletion_* column is rejected.
  IF NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at
     OR NEW.deletion_requested_by IS DISTINCT FROM OLD.deletion_requested_by
     OR NEW.deletion_request_note IS DISTINCT FROM OLD.deletion_request_note
     OR NEW.deletion_allowed       IS DISTINCT FROM OLD.deletion_allowed
     OR NEW.deletion_allowed_at    IS DISTINCT FROM OLD.deletion_allowed_at
     OR NEW.deletion_allowed_by    IS DISTINCT FROM OLD.deletion_allowed_by
     OR NEW.deleted_at             IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by             IS DISTINCT FROM OLD.deleted_by
  THEN
    RAISE EXCEPTION 'school deletion columns can only be modified via dedicated RPCs'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schools_guard_deletion_columns ON public.schools;
CREATE TRIGGER schools_guard_deletion_columns
  BEFORE UPDATE OF
    deletion_requested_at, deletion_requested_by, deletion_request_note,
    deletion_allowed, deletion_allowed_at, deletion_allowed_by,
    deleted_at, deleted_by
  ON public.schools
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_school_deletion_columns();


-- ─── Re-create each deletion RPC so it flips the trigger-bypass flag ────────
-- The function bodies are identical to migration 0127 except for the
-- `PERFORM set_config(...)` line right before each UPDATE. Without this,
-- the new trigger would reject the RPC's own UPDATE and the entire
-- workflow would break.

CREATE OR REPLACE FUNCTION public.request_school_deletion(
  p_school_id UUID,
  p_note      TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_sch  UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT role, school_id INTO v_caller_role, v_caller_sch
  FROM public.users WHERE id = v_caller_id;
  IF v_caller_role <> 'PRINCIPAL' OR v_caller_sch <> p_school_id THEN
    RAISE EXCEPTION 'only the school principal can request deletion' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'school already soft-deleted';
  END IF;

  PERFORM set_config('app.allow_deletion_columns', 'true', true);
  UPDATE public.schools
     SET deletion_requested_at = NOW(),
         deletion_requested_by = v_caller_id,
         deletion_request_note = NULLIF(TRIM(COALESCE(p_note, '')), ''),
         updated_at            = NOW()
   WHERE id = p_school_id;

  INSERT INTO public.audit_logs (school_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, v_caller_id, 'SCHOOL_DELETION_REQUESTED', 'school', p_school_id,
          jsonb_build_object('note', p_note));
END;
$$;
REVOKE ALL ON FUNCTION public.request_school_deletion(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_school_deletion(UUID, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_school_deletion_request(
  p_school_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_sch  UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT role, school_id INTO v_caller_role, v_caller_sch
  FROM public.users WHERE id = v_caller_id;
  IF v_caller_role <> 'PRINCIPAL' OR v_caller_sch <> p_school_id THEN
    RAISE EXCEPTION 'only the school principal can cancel' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.allow_deletion_columns', 'true', true);
  UPDATE public.schools
     SET deletion_requested_at = NULL,
         deletion_requested_by = NULL,
         deletion_request_note = NULL,
         updated_at            = NOW()
   WHERE id = p_school_id AND deleted_at IS NULL;

  INSERT INTO public.audit_logs (school_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, v_caller_id, 'SCHOOL_DELETION_REQUEST_CANCELLED', 'school', p_school_id, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_school_deletion_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_school_deletion_request(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.set_school_deletion_allowed(
  p_school_id UUID,
  p_allowed   BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super-admin can change deletion allow flag' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'school is already soft-deleted; use restore instead';
  END IF;

  PERFORM set_config('app.allow_deletion_columns', 'true', true);
  UPDATE public.schools
     SET deletion_allowed    = p_allowed,
         deletion_allowed_at = CASE WHEN p_allowed THEN NOW() ELSE NULL END,
         deletion_allowed_by = CASE WHEN p_allowed THEN v_caller_id ELSE NULL END,
         updated_at          = NOW()
   WHERE id = p_school_id;

  INSERT INTO public.audit_logs (school_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, v_caller_id,
          CASE WHEN p_allowed THEN 'SCHOOL_DELETION_APPROVED' ELSE 'SCHOOL_DELETION_APPROVAL_REVOKED' END,
          'school', p_school_id, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.set_school_deletion_allowed(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_school_deletion_allowed(UUID, BOOLEAN) TO authenticated;


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

  INSERT INTO public.audit_logs (school_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, v_caller_id, 'SCHOOL_SOFT_DELETED', 'school', p_school_id, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.soft_delete_school(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_school(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.restore_school(
  p_school_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_id  UUID := auth.uid();
  v_deleted_at TIMESTAMPTZ;
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

  INSERT INTO public.audit_logs (school_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, v_caller_id, 'SCHOOL_RESTORED', 'school', p_school_id, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.restore_school(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_school(UUID) TO authenticated;


-- ─── Fix 3: permanent delete also deactivates the orphaned users ────────────
-- `users.school_id` is ON DELETE SET NULL, so without this they'd remain
-- is_active=TRUE with school_id=NULL after the school is gone — and could
-- log in successfully (the login-time school-deleted check skips when
-- school_id is null). Setting is_active=FALSE here makes the existing
-- gate in buildSession refuse them. Reversible: a super-admin can flip
-- the flag back if a user was wrongly caught up in a permanent delete.
CREATE OR REPLACE FUNCTION public.permanent_delete_school(
  p_school_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_id  UUID := auth.uid();
  v_deleted_at TIMESTAMPTZ;
  v_users_kicked INT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super-admin can permanently delete a school' USING ERRCODE = '42501';
  END IF;
  SELECT deleted_at INTO v_deleted_at FROM public.schools WHERE id = p_school_id FOR UPDATE;
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'school is not soft-deleted; soft-delete first';
  END IF;
  IF v_deleted_at > NOW() - INTERVAL '30 days' THEN
    RAISE EXCEPTION 'school must be soft-deleted for at least 30 days before permanent delete';
  END IF;

  -- Deactivate every user of the school first. Their school_id will
  -- become NULL via the existing FK cascade once the school row is gone,
  -- but is_active=FALSE keeps them out of new sessions in the meantime.
  UPDATE public.users
     SET is_active = FALSE,
         updated_at = NOW()
   WHERE school_id = p_school_id;
  GET DIAGNOSTICS v_users_kicked = ROW_COUNT;

  -- Audit BEFORE the row vanishes. audit_logs.school_id is now ON DELETE
  -- SET NULL (Fix 2 above) so this entry survives the FK chain unwinding.
  INSERT INTO public.audit_logs (school_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, v_caller_id, 'SCHOOL_PERMANENTLY_DELETED', 'school', p_school_id,
          jsonb_build_object('users_deactivated', v_users_kicked));

  DELETE FROM public.schools WHERE id = p_school_id;
END;
$$;
REVOKE ALL ON FUNCTION public.permanent_delete_school(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.permanent_delete_school(UUID) TO authenticated;
