-- 0107_aggregate_upcoming.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Adds total_parent_upcoming + total_govt_upcoming columns to
-- get_school_fee_aggregate so the principal's Fee Collection hub can
-- split "what's owed now (overdue)" from "what's coming later
-- (upcoming)". Without this the hub either shows only overdue and
-- hides the rest of the year, or counts the full schedule as panic.

DROP FUNCTION IF EXISTS public.get_school_fee_aggregate();
CREATE OR REPLACE FUNCTION public.get_school_fee_aggregate()
RETURNS TABLE (
  total_students          BIGINT,
  pending_count           BIGINT,
  due_count               BIGINT,
  cleared_count           BIGINT,
  total_collected         BIGINT,
  total_parent_due        BIGINT,    -- overdue (due_date <= today, unpaid)
  total_govt_due          BIGINT,
  total_parent_upcoming   BIGINT,    -- future (due_date > today, unpaid)
  total_govt_upcoming     BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_principal()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_school_id := public.current_user_school_id();
  IF v_school_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'no school in session';
  END IF;

  RETURN QUERY
  WITH
  active_students AS (
    SELECT id FROM public.students
     WHERE school_id = v_school_id AND is_active = TRUE
  ),
  per_student AS (
    SELECT
      fi.student_id,
      SUM(GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount))
        AS lifetime_outstanding,
      SUM(CASE WHEN fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                    AS now_outstanding,
      SUM(CASE WHEN fi.payer_type = 'PARENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                    AS parent_due_now,
      SUM(CASE WHEN fi.payer_type = 'GOVERNMENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                    AS govt_due_now,
      SUM(CASE WHEN fi.payer_type = 'PARENT' AND fi.due_date > CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                    AS parent_upcoming,
      SUM(CASE WHEN fi.payer_type = 'GOVERNMENT' AND fi.due_date > CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                    AS govt_upcoming,
      SUM(fi.paid_amount)                                     AS total_paid
    FROM public.fee_installments fi
    JOIN active_students s ON s.id = fi.student_id
    GROUP BY fi.student_id
  )
  SELECT
    (SELECT COUNT(*) FROM active_students)                                          AS total_students,
    (SELECT COUNT(*) FROM active_students s
        WHERE NOT EXISTS (SELECT 1 FROM per_student p WHERE p.student_id = s.id))  AS pending_count,
    (SELECT COUNT(*) FROM per_student WHERE now_outstanding > 0)                   AS due_count,
    (SELECT COUNT(*) FROM per_student WHERE lifetime_outstanding = 0)              AS cleared_count,
    COALESCE((SELECT SUM(total_paid)        FROM per_student), 0)::BIGINT          AS total_collected,
    COALESCE((SELECT SUM(parent_due_now)    FROM per_student), 0)::BIGINT          AS total_parent_due,
    COALESCE((SELECT SUM(govt_due_now)      FROM per_student), 0)::BIGINT          AS total_govt_due,
    COALESCE((SELECT SUM(parent_upcoming)   FROM per_student), 0)::BIGINT          AS total_parent_upcoming,
    COALESCE((SELECT SUM(govt_upcoming)     FROM per_student), 0)::BIGINT          AS total_govt_upcoming;
END $$;

GRANT EXECUTE ON FUNCTION public.get_school_fee_aggregate() TO authenticated;
