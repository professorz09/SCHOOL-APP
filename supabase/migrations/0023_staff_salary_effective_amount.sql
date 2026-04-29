-- ============================================================================
-- Migration 0023 — Make month-by-month salary calculations history-aware.
--
-- Background
--   `staff.salary` holds the *current* monthly amount. When a principal raises
--   a salary effective from a future date, the new amount lands in
--   `staff_salary_history` and *also* in `staff.salary` (latest amount). That
--   second write means any code that reads `staff.salary` to compute "what was
--   owed in October?" gets the wrong answer for past months once a future
--   raise has been recorded.
--
-- This migration adds:
--
--   * effective_staff_salary(staff_id, target_date)
--       The amount that was in effect on `target_date`, looked up from
--       staff_salary_history (latest row whose effective_from ≤ target_date).
--       Falls back to staff.salary if no history row covers the date (legacy
--       rows pre-0021).
--
--   * salary_reminders(school_id, year_month) re-implemented to use
--       effective_staff_salary(staff_id, last_day_of_month). Pending amount is
--       expected − paid for that specific month. Same RLS gate as before.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP FUNCTION IF EXISTS. Re-running
-- is safe. No table / column changes — purely additive function definitions.
-- ============================================================================

BEGIN;

-- ─── 1. effective_staff_salary helper ────────────────────────────────────
DROP FUNCTION IF EXISTS public.effective_staff_salary(UUID, DATE);
CREATE OR REPLACE FUNCTION public.effective_staff_salary(
  p_staff_id UUID,
  p_target_date DATE
) RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (
      SELECT salary_amount
      FROM public.staff_salary_history
      WHERE staff_id = p_staff_id
        AND effective_from <= p_target_date
      ORDER BY effective_from DESC, created_at DESC
      LIMIT 1
    ),
    (SELECT salary FROM public.staff WHERE id = p_staff_id),
    0
  )::BIGINT;
$$;
GRANT EXECUTE ON FUNCTION public.effective_staff_salary(UUID, DATE) TO authenticated;

-- ─── 2. salary_reminders — history-aware expected amount ─────────────────
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
      AND COALESCE(s.status, 'ACTIVE') NOT IN ('SUSPENDED','RELIEVED')
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
