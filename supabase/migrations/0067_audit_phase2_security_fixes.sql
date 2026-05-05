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
