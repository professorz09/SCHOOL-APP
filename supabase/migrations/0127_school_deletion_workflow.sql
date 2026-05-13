-- ─────────────────────────────────────────────────────────────────────────────
-- School deletion workflow — three-stage gated process designed so nothing
-- destructive can happen by a single tap or automated job.
--
-- Stage 1 — PRINCIPAL requests        : deletion_requested_at = NOW()
-- Stage 2 — SUPER_ADMIN approves      : deletion_allowed       = TRUE
-- Stage 3 — PRINCIPAL pulls trigger   : deleted_at             = NOW()
-- (30-day window)
-- Stage 4 — SUPER_ADMIN permanent-del : row hard-deleted (manual click only)
--
-- No cron / automation can hard-delete. Every transition is logged in
-- audit_logs. Stage 2 is the safety lock — even if a principal's session
-- is compromised, they cannot delete unless the super-admin has actively
-- flipped the per-school allow toggle ON.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_request_note TEXT,
  ADD COLUMN IF NOT EXISTS deletion_allowed       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deletion_allowed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_allowed_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by             UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Index for super-admin dashboard query: "schools awaiting my approval".
CREATE INDEX IF NOT EXISTS schools_pending_deletion_idx
  ON public.schools (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL AND deletion_allowed = FALSE AND deleted_at IS NULL;

-- Index for the 30-day "ready for permanent delete" review list.
CREATE INDEX IF NOT EXISTS schools_soft_deleted_idx
  ON public.schools (deleted_at)
  WHERE deleted_at IS NOT NULL;


-- ─── RPC 1: Principal raises a deletion request ─────────────────────────────
-- Sets `deletion_requested_at`. Idempotent — repeat calls just refresh the
-- note; allowed flag is NOT reset (super-admin's approval persists across
-- re-requests so they don't have to re-approve if principal cancels + retries).
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
  -- Reject if already soft-deleted.
  IF EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'school already soft-deleted';
  END IF;

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


-- ─── RPC 2: Principal CANCELS their pending request ─────────────────────────
-- Allowed only while school is not yet soft-deleted. Clears the request
-- timestamp + note. Does NOT touch `deletion_allowed` — if super-admin
-- had already approved, the approval stands but the principal must
-- raise a fresh request to use it.
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


-- ─── RPC 3: Super-admin TOGGLES the per-school allow flag ───────────────────
-- Required intermediate step. Without this flag = TRUE the principal's
-- delete button stays disabled even if a request was filed.
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
  -- Cannot toggle a row that is already soft-deleted (use restore_school
  -- to undo a soft delete, not this flag).
  IF EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'school is already soft-deleted; use restore instead';
  END IF;

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


-- ─── RPC 4: Principal pulls the trigger (soft delete) ───────────────────────
-- Only executes if super-admin has approved (deletion_allowed=TRUE) and
-- there's an active request. Sets deleted_at — login-time check elsewhere
-- blocks all users of this school once this column is set.
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


-- ─── RPC 5: Super-admin restores a soft-deleted school (≤ 30 day window) ────
CREATE OR REPLACE FUNCTION public.restore_school(
  p_school_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_deleted_at TIMESTAMPTZ;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super-admin can restore a school' USING ERRCODE = '42501';
  END IF;
  SELECT deleted_at INTO v_deleted_at FROM public.schools WHERE id = p_school_id FOR UPDATE;
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'school is not soft-deleted';
  END IF;
  -- Hard window: refuse to restore after 30 days (the row may be queued
  -- for permanent delete; force super-admin to acknowledge that path
  -- explicitly rather than silently undoing).
  IF v_deleted_at < NOW() - INTERVAL '30 days' THEN
    RAISE EXCEPTION 'restore window of 30 days has passed; contact engineering';
  END IF;

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


-- ─── RPC 6: Super-admin PERMANENT delete (manual, after 30 days) ────────────
-- Deletes the row outright. The schools table cascades to most child
-- tables via existing FKs; anything that does not cascade is intentionally
-- preserved (e.g. platform_settings — global, not school-scoped).
--
-- No cron job calls this. The super-admin must navigate to the
-- soft-deleted-schools list, eyeball the entry, and click a button.
CREATE OR REPLACE FUNCTION public.permanent_delete_school(
  p_school_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_deleted_at TIMESTAMPTZ;
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

  -- Audit BEFORE the row vanishes — once the FK chain unwinds, the
  -- school_id reference itself is gone.
  INSERT INTO public.audit_logs (school_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_school_id, v_caller_id, 'SCHOOL_PERMANENTLY_DELETED', 'school', p_school_id, '{}'::jsonb);

  DELETE FROM public.schools WHERE id = p_school_id;
END;
$$;
REVOKE ALL ON FUNCTION public.permanent_delete_school(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.permanent_delete_school(UUID) TO authenticated;
