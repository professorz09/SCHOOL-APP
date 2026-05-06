-- ============================================================================
-- Migration 0027 — Fix "column reference 'name' is ambiguous" in
-- public.salary_reminders.
--
-- Problem
--   Migration 0024 redefined salary_reminders with this signature:
--
--     RETURNS TABLE (staff_id UUID, name TEXT, role TEXT,
--                    salary BIGINT, paid_amount BIGINT)
--
--   Inside the function body, the final SELECT used unqualified column
--   names:
--
--     SELECT id, name, role, expected, paid FROM with_paid
--
--   In plpgsql, RETURNS TABLE columns become OUT parameters that are
--   visible inside the function body. Because Postgres' default
--   `#variable_conflict` mode is `error`, the unqualified `name` and
--   `role` references collide with the OUT parameters of the same name
--   and abort the query with:
--
--     ERROR: column reference "name" is ambiguous
--
--   That bubbles up to the principal dashboard's SalaryReminderCard as
--   "Salary reminders unavailable / column reference 'name' is
--   ambiguous", masking salary reminders entirely.
--
-- Fix
--   1. Add `#variable_conflict use_column` directive — when an
--      identifier could refer to either a plpgsql variable/OUT param or
--      a table column, prefer the column. This is the canonical pattern
--      for plpgsql functions whose RETURNS TABLE column names overlap
--      with table columns they query.
--   2. Belt-and-suspenders: explicitly alias the final SELECT
--      (`SELECT wp.id AS staff_id, wp.name, wp.role, wp.expected AS salary,
--       wp.paid AS paid_amount FROM with_paid wp`) so that even if a
--      future edit removes the directive, the query still resolves
--      cleanly to the CTE's columns.
--
--   No behavioural change vs. 0024 — same eligibility window, same
--   expected-amount calculation, same RLS gate. Purely a parser-level
--   disambiguation.
--
-- Idempotent: DROP FUNCTION IF EXISTS + CREATE OR REPLACE FUNCTION.
-- No table or column changes.
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
#variable_conflict use_column
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
  SELECT wp.id          AS staff_id,
         wp.name        AS name,
         wp.role        AS role,
         wp.expected    AS salary,
         wp.paid        AS paid_amount
  FROM with_paid wp
  WHERE wp.expected > 0
    AND wp.paid < wp.expected;
END $$;

GRANT EXECUTE ON FUNCTION public.salary_reminders(UUID, TEXT) TO authenticated;

COMMIT;
