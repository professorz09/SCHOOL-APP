-- ============================================================================
-- Migration 0022 — Tighten 0021 staff-salary lifecycle policies + RPC.
--
-- 1. salary_reminders(school_id, year_month):
--      0021's filter excluded staff by today's date instead of the requested
--      month, and forgot to filter out staff who join AFTER that month. Fix
--      both: parse p_year_month with `to_date('Month YYYY')`, derive the
--      first / last day, and gate joining_date / relieving_date against
--      that window.
--
-- 2. staff_documents delete policy:
--      0021 granted same-school principals AND teachers FOR ALL on the table,
--      but the storage policy only lets principals (or super admins) DELETE
--      objects. A teacher deleting metadata would orphan the underlying
--      private storage object. Split the FOR ALL policy into separate
--      INSERT/UPDATE (principal+teacher) and DELETE (principal-only)
--      policies so the table + storage stay in sync.
--
-- Idempotent: DROP POLICY IF EXISTS / DROP FUNCTION IF EXISTS / CREATE OR
-- REPLACE FUNCTION. Re-running is safe.
-- ============================================================================

BEGIN;

-- ─── 1. salary_reminders: month-aware filtering ──────────────────────────
DROP FUNCTION IF EXISTS public.salary_reminders(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.salary_reminders(
  p_school_id UUID,
  p_year_month TEXT
) RETURNS TABLE (
  staff_id    UUID,
  name        TEXT,
  role        TEXT,
  salary      BIGINT,
  paid_amount BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role  TEXT := public.current_user_role();
  v_first DATE;
  v_last  DATE;
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role IS NULL OR v_role NOT IN ('PRINCIPAL','TEACHER')
          OR public.current_user_school_id() IS DISTINCT FROM p_school_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 'October 2025' / 'April 2026' → first day of that month.
  -- to_date is locale-stable (POSIX month names) when SET search_path is empty.
  BEGIN
    v_first := to_date(p_year_month, 'FMMonth YYYY');
  EXCEPTION WHEN OTHERS THEN
    -- Caller passed something we cannot parse; bail with no rows so the
    -- dashboard widget hides instead of crashing.
    RETURN;
  END;
  v_last := (v_first + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.role,
    s.salary,
    COALESCE(SUM(sp.amount) FILTER (WHERE sp.month = p_year_month), 0)::BIGINT
  FROM public.staff s
  LEFT JOIN public.salary_payments sp
    ON sp.staff_id = s.id
   AND sp.month    = p_year_month
  WHERE s.school_id = p_school_id
    AND s.is_active = TRUE
    AND COALESCE(s.status, 'ACTIVE') NOT IN ('SUSPENDED','RELIEVED')
    AND s.salary > 0
    -- Eligible: joined on or before the month ends.
    AND (s.joining_date IS NULL OR s.joining_date <= v_last)
    -- Eligible: not relieved before the month starts.
    AND (s.relieving_date IS NULL OR s.relieving_date >= v_first)
  GROUP BY s.id, s.name, s.role, s.salary
  HAVING COALESCE(SUM(sp.amount) FILTER (WHERE sp.month = p_year_month), 0) < s.salary;
END $$;
GRANT EXECUTE ON FUNCTION public.salary_reminders(UUID, TEXT) TO authenticated;

-- ─── 2. staff_documents: restrict DELETE to principals ──────────────────
DROP POLICY IF EXISTS staff_documents_write ON public.staff_documents;

DROP POLICY IF EXISTS staff_documents_insert ON public.staff_documents;
CREATE POLICY staff_documents_insert ON public.staff_documents FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS staff_documents_update ON public.staff_documents;
CREATE POLICY staff_documents_update ON public.staff_documents FOR UPDATE
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  );

-- DELETE: principal-only, matching the staff-documents storage policy so
-- table + bucket cannot drift out of sync.
DROP POLICY IF EXISTS staff_documents_delete ON public.staff_documents;
CREATE POLICY staff_documents_delete ON public.staff_documents FOR DELETE
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

COMMIT;
