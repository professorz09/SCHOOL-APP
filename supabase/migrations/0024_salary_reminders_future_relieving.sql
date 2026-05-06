-- ============================================================================
-- Migration 0024 — Honour future-dated relieving in salary_reminders.
--
-- Problem
--   set_staff_relieving_date flips staff.status to 'RELIEVED' as soon as the
--   principal records the relieving date — even when that date is in the
--   future. salary_reminders (0023) excludes everyone with status='RELIEVED',
--   so future-dated relieving silently kills the reminder for the months the
--   staff was still on payroll.
--
-- Fix
--   Stop using staff.status as the primary eligibility gate for reminders.
--   Use the relieving_date window directly (it is what really tells us
--   whether the staff was on payroll in the requested month). SUSPENDED is
--   still excluded because the spec says "salary payments will be put on
--   hold" while suspended.
--
--   Concretely the filter becomes:
--     - SUSPENDED is excluded (regardless of dates).
--     - joining_date IS NULL OR joining_date <= last day of month.
--     - relieving_date IS NULL OR relieving_date >= first day of month.
--   That naturally includes a future-relieved staff for every month up to
--   and including their relieving month, then drops them afterwards.
--
-- Idempotent: DROP FUNCTION IF EXISTS + CREATE OR REPLACE FUNCTION. No
-- table / column changes — purely a function redefinition.
-- ============================================================================

BEGIN;

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

  BEGIN
    v_first := to_date(p_year_month, 'FMMonth YYYY');
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  v_last := (v_first + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  RETURN QUERY
  WITH eligible AS (
    SELECT s.id, s.name, s.role,
           public.effective_staff_salary(s.id, v_last) AS expected
    FROM public.staff s
    WHERE s.school_id = p_school_id
      AND s.is_active = TRUE
      -- SUSPENDED stays excluded; RELIEVED is gated by relieving_date below
      -- so future-dated relieving still gets reminders for past months.
      AND COALESCE(s.status, 'ACTIVE') <> 'SUSPENDED'
      AND (s.joining_date IS NULL OR s.joining_date <= v_last)
      AND (s.relieving_date IS NULL OR s.relieving_date >= v_first)
  ), with_paid AS (
    SELECT e.id, e.name, e.role, e.expected,
           COALESCE(SUM(sp.amount), 0)::BIGINT AS paid
    FROM eligible e
    LEFT JOIN public.salary_payments sp
      ON sp.staff_id = e.id AND sp.month = p_year_month
    GROUP BY e.id, e.name, e.role, e.expected
  )
  SELECT id, name, role, expected, paid
  FROM with_paid
  WHERE expected > 0
    AND paid < expected;
END $$;
GRANT EXECUTE ON FUNCTION public.salary_reminders(UUID, TEXT) TO authenticated;

COMMIT;
