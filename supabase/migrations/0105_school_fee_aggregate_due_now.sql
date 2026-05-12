-- 0105_school_fee_aggregate_due_now.sql
-- ─────────────────────────────────────────────────────────────────────────
-- The school-wide fee aggregate used to sum outstanding across ALL
-- installments — including UPCOMING ones whose due_date is in the
-- future. The "Pending Dues" / "Total Due" KPI in FeeCollectionsHub
-- shows the entire yearly schedule as due on April 1st, which is
-- alarming and wrong.
--
-- Fix: count parent_due / govt_due / due_count only from installments
-- whose due_date is on or before today (i.e. OVERDUE + PARTIAL). Future
-- months stay invisible until they actually come due.
--
-- total_collected stays lifetime (paid is paid, regardless of when).
-- cleared_count uses lifetime outstanding (a student with future months
-- still unpaid isn't "cleared" — they just owe less *right now*).

DROP FUNCTION IF EXISTS public.get_school_fee_aggregate();
CREATE OR REPLACE FUNCTION public.get_school_fee_aggregate()
RETURNS TABLE (
  total_students          BIGINT,
  pending_count           BIGINT,
  due_count               BIGINT,
  cleared_count           BIGINT,
  total_collected         BIGINT,
  total_parent_due        BIGINT,
  total_govt_due          BIGINT
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
  -- Per-student installment summary. lifetime_* covers all rows;
  -- now_* restricts to installments whose due_date <= today so the
  -- "Pending Dues" KPI doesn't include future months.
  per_student AS (
    SELECT
      fi.student_id,
      COUNT(*) AS inst_count,
      SUM(GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount))
        AS lifetime_outstanding,
      SUM(CASE WHEN fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                  AS now_outstanding,
      SUM(CASE WHEN fi.payer_type = 'PARENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                  AS parent_due_now,
      SUM(CASE WHEN fi.payer_type = 'GOVERNMENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                  AS govt_due_now,
      SUM(fi.paid_amount)                                   AS total_paid
    FROM public.fee_installments fi
    JOIN active_students s ON s.id = fi.student_id
    GROUP BY fi.student_id
  )
  SELECT
    (SELECT COUNT(*) FROM active_students)                                          AS total_students,
    -- Pending: active students that don't appear in fee_installments at all.
    (SELECT COUNT(*) FROM active_students s
        WHERE NOT EXISTS (SELECT 1 FROM per_student p WHERE p.student_id = s.id))  AS pending_count,
    -- Due *right now* — at least one currently-overdue/partial installment.
    (SELECT COUNT(*) FROM per_student WHERE now_outstanding > 0)                   AS due_count,
    -- Cleared = lifetime fully settled (no future months hanging either).
    (SELECT COUNT(*) FROM per_student WHERE lifetime_outstanding = 0)              AS cleared_count,
    COALESCE((SELECT SUM(total_paid)     FROM per_student), 0)::BIGINT             AS total_collected,
    COALESCE((SELECT SUM(parent_due_now) FROM per_student), 0)::BIGINT             AS total_parent_due,
    COALESCE((SELECT SUM(govt_due_now)   FROM per_student), 0)::BIGINT             AS total_govt_due;
END $$;

GRANT EXECUTE ON FUNCTION public.get_school_fee_aggregate() TO authenticated;
