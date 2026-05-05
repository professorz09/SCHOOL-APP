-- Migration 0062: Phase 1 security audit fixes
-- - Tighten school_settings RLS so only principal/super-admin can write.
-- - Tighten users_prevent_self_escalation trigger to use a small allowlist.
-- - Tighten parent_student_links admin write to require student.school_id match.
-- Run: npm run db:apply

-- ─── 0062.1 school_settings: write-only by principals/super-admins ──────────
-- Previously a single FOR ALL policy + GRANT INSERT/UPDATE on `authenticated`
-- let any same-school user (including teachers/students) toggle attendance
-- start/end times and the teacher-checkin flag.
DROP POLICY IF EXISTS school_settings_principal_rw ON public.school_settings;

CREATE POLICY school_settings_select ON public.school_settings
  FOR SELECT
  USING (
    public.is_super_admin()
    OR school_id = public.current_user_school_id()
  );

CREATE POLICY school_settings_principal_write ON public.school_settings
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

CREATE POLICY school_settings_principal_update ON public.school_settings
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

CREATE POLICY school_settings_principal_delete ON public.school_settings
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

-- ─── 0062.2 users_prevent_self_escalation: explicit allowlist ───────────────
-- Switch from a denylist (which missed editor_mode_until, email, name,
-- last_login) to an explicit allowlist of fields a non-super-admin user can
-- update on their own row. Service role (auth.uid() IS NULL) and SUPER_ADMIN
-- still get the unchanged path.
CREATE OR REPLACE FUNCTION public.users_prevent_self_escalation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / admin tooling, allow
  END IF;
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  -- Allowlist: phone-style profile fields user is permitted to self-edit.
  -- Everything else is forced back to OLD. This blocks self-escalation via
  -- editor_mode_until, role, school_id, is_active, first_login_changed,
  -- mobile_number, email, name, last_login, etc.
  NEW.id                  := OLD.id;
  NEW.role                := OLD.role;
  NEW.school_id           := OLD.school_id;
  NEW.is_active           := OLD.is_active;
  NEW.first_login_changed := OLD.first_login_changed;
  NEW.mobile_number       := OLD.mobile_number;
  NEW.email               := OLD.email;
  NEW.name                := OLD.name;
  NEW.editor_mode_until   := OLD.editor_mode_until;
  NEW.last_login          := OLD.last_login;
  NEW.created_at          := OLD.created_at;
  RETURN NEW;
END;
$$;

-- ─── 0062.3 parent_student_links: bind student to caller's school ───────────
-- Previously psl_admin_write let any principal insert links to a student in
-- a *different* school, allowing a malicious principal to attach a parent in
-- their school to a rival school's student record.
DROP POLICY IF EXISTS psl_admin_write ON public.parent_student_links;
CREATE POLICY psl_admin_write ON public.parent_student_links
  FOR ALL
  USING (
    public.is_super_admin()
    OR (
      public.is_principal()
      AND EXISTS (
        SELECT 1 FROM public.students s
         WHERE s.id = parent_student_links.student_id
           AND s.school_id = public.current_user_school_id()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_principal()
      AND EXISTS (
        SELECT 1 FROM public.students s
         WHERE s.id = parent_student_links.student_id
           AND s.school_id = public.current_user_school_id()
      )
    )
  );
-- Migration 0063: Phase 2 security audit fixes
-- - audit_logs becomes append-only (no UPDATE / DELETE for normal users).
-- - complaints.from_user_id is immutable post-insert.
-- - log_audit() rejects malformed action strings (audit-trail integrity).
-- Run: npm run db:apply

-- ─── 0063.1 audit_logs append-only ──────────────────────────────────────────
-- The generic per-table write loop in 0001_init.sql gave principals FOR ALL
-- (i.e. INSERT/UPDATE/DELETE) on audit_logs in their school. A compromised
-- principal could erase or rewrite forensic trail. Replace with INSERT-only.
DROP POLICY IF EXISTS audit_logs_write ON public.audit_logs;

CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
  );

-- No UPDATE / DELETE policies → both denied for everyone except service role
-- (service role bypasses RLS entirely; that's the only retention/cleanup path).

-- ─── 0063.2 complaints.from_user_id immutability ────────────────────────────
-- Generic `complaints_write FOR ALL` lets a principal rewrite who filed a
-- complaint, framing a teacher/parent. Lock the column via a BEFORE UPDATE
-- trigger.
CREATE OR REPLACE FUNCTION public.complaints_lock_author() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.from_user_id IS DISTINCT FROM OLD.from_user_id THEN
    RAISE EXCEPTION 'complaints.from_user_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaints_lock_author ON public.complaints;
CREATE TRIGGER complaints_lock_author
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.complaints_lock_author();

-- ─── 0063.3 log_audit format validation ─────────────────────────────────────
-- Any authenticated user can call log_audit and write arbitrary action /
-- entity_type strings, polluting the audit trail (e.g. inject newlines,
-- fake "password_changed" markers). Enforce a strict identifier-style
-- format so audit rows are at least syntactically well-formed and cannot
-- carry control characters. Length capped to reasonable values.
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action      TEXT,
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_details     JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id   UUID;
  v_school_id UUID;
  v_log_id    UUID;
BEGIN
  IF p_action IS NULL OR p_action !~ '^[a-z][a-z0-9_]{1,63}$' THEN
    RAISE EXCEPTION 'log_audit: invalid action format (must be snake_case identifier, 2-64 chars)';
  END IF;
  IF p_entity_type IS NULL OR p_entity_type !~ '^[a-z][a-z0-9_]{1,63}$' THEN
    RAISE EXCEPTION 'log_audit: invalid entity_type format';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT school_id INTO v_school_id
      FROM public.users WHERE id = v_user_id;
  END IF;

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (v_user_id, v_school_id, p_action, p_entity_type, p_entity_id, COALESCE(p_details,'{}'::jsonb))
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;
-- Migration 0064: Atomic transport-fee schedule replace.
--
-- The client previously did:
--   DELETE unpaid TRANSPORT installments for this assignment;
--   INSERT new monthly rows.
-- Two separate round-trips. If the INSERT failed (RLS, constraint, network)
-- the student lost ALL unpaid TRANSPORT installments without replacement.
--
-- This RPC moves both ops into one transaction. Caller passes a JSONB array
-- of new rows; we delete the old unpaid set, then insert the new set, both
-- under the same SECURITY DEFINER context (PRINCIPAL same-school enforced
-- via the explicit checks below).
--
-- Run: npm run db:apply

CREATE OR REPLACE FUNCTION public.transport_replace_unpaid_installments(
  p_assignment_id uuid,
  p_rows          jsonb
)
RETURNS TABLE (deleted_count integer, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_caller_school uuid;
  v_deleted int := 0;
  v_inserted int := 0;
BEGIN
  -- Identify the school this assignment belongs to via any installment row,
  -- or fall back to the first JSONB row's school_id (initial seeding).
  SELECT school_id INTO v_school_id
    FROM public.fee_installments
   WHERE related_id = p_assignment_id AND fee_type = 'TRANSPORT'
   LIMIT 1;
  IF v_school_id IS NULL THEN
    v_school_id := (p_rows -> 0 ->> 'school_id')::uuid;
  END IF;

  -- Caller must be principal of that school (or super-admin).
  v_caller_school := public.current_user_school_id();
  IF NOT public.is_super_admin() THEN
    IF NOT public.is_principal() OR v_caller_school IS DISTINCT FROM v_school_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  WITH del AS (
    DELETE FROM public.fee_installments
     WHERE related_id = p_assignment_id
       AND fee_type = 'TRANSPORT'
       AND paid_amount = 0
       AND write_off_amount = 0
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  WITH ins AS (
    INSERT INTO public.fee_installments
      (student_id, school_id, academic_year_id, month, due_date,
       fee_type, amount, payer_type, related_id)
    SELECT
      (r->>'student_id')::uuid,
      (r->>'school_id')::uuid,
      (r->>'academic_year_id')::uuid,
       r->>'month',
      (r->>'due_date')::date,
       r->>'fee_type',
      (r->>'amount')::numeric,
       r->>'payer_type',
      (r->>'related_id')::uuid
    FROM jsonb_array_elements(p_rows) AS r
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN QUERY SELECT v_deleted, v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transport_replace_unpaid_installments(uuid, jsonb) TO authenticated;
-- Migration 0065: Phase 6 follow-up fixes from second audit pass
-- - Atomic transport-cancel-after RPC (was looped UPDATE per row).
-- Run: npm run db:apply

CREATE OR REPLACE FUNCTION public.transport_cancel_after(
  p_assignment_id uuid,
  p_from_date     date
)
RETURNS TABLE (deleted_count integer, cancelled_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_caller_school uuid;
  v_deleted int := 0;
  v_cancelled int := 0;
BEGIN
  SELECT school_id INTO v_school_id
    FROM public.fee_installments
   WHERE related_id = p_assignment_id AND fee_type = 'TRANSPORT'
   LIMIT 1;
  IF v_school_id IS NULL THEN
    -- nothing to cancel
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  v_caller_school := public.current_user_school_id();
  IF NOT public.is_super_admin() THEN
    IF NOT public.is_principal() OR v_caller_school IS DISTINCT FROM v_school_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Untouched rows: delete outright.
  WITH del AS (
    DELETE FROM public.fee_installments
     WHERE related_id = p_assignment_id
       AND fee_type   = 'TRANSPORT'
       AND due_date  >= p_from_date
       AND paid_amount = 0
       AND write_off_amount = 0
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  -- Partial / paid rows: freeze amount at (paid + write-off) and stamp CANCELLED.
  WITH upd AS (
    UPDATE public.fee_installments
       SET status     = 'CANCELLED',
           amount     = paid_amount + write_off_amount,
           updated_at = NOW()
     WHERE related_id = p_assignment_id
       AND fee_type   = 'TRANSPORT'
       AND due_date  >= p_from_date
       AND (paid_amount > 0 OR write_off_amount > 0)
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_cancelled FROM upd;

  RETURN QUERY SELECT v_deleted, v_cancelled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transport_cancel_after(uuid, date) TO authenticated;
