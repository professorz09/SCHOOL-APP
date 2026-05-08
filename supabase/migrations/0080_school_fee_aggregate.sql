-- =============================================================
-- 0080_school_fee_aggregate.sql
-- =============================================================
-- Server-side fee summary aggregate for the principal FeeLedger.
-- Replaces the client-side cache walk that summed across every
-- student's installments — which is what forced FeeLedger to
-- pre-load the entire school's fee_installments cache. With this
-- RPC the principal can render the Total/Due/Collected tiles
-- without ever pulling individual student rows.
--
-- Authorisation: principal of the school (or super_admin).
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_school_fee_aggregate()
RETURNS TABLE (
  total_students          BIGINT,
  pending_count           BIGINT,  -- active students with no installments at all
  due_count               BIGINT,  -- students with ≥1 outstanding installment
  cleared_count           BIGINT,  -- students with ≥1 installment, all settled
  total_collected         BIGINT,  -- sum of paid_amount across all installments
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
  -- Per-student installment summary so we can bucket students into
  -- pending / due / cleared in a single pass.
  per_student AS (
    SELECT
      fi.student_id,
      COUNT(*)                                                                    AS inst_count,
      SUM(GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount))          AS outstanding_all,
      SUM(CASE WHEN fi.payer_type = 'PARENT'
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                                        AS parent_due,
      SUM(CASE WHEN fi.payer_type = 'GOVERNMENT'
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                                        AS govt_due,
      SUM(fi.paid_amount)                                                         AS total_paid
    FROM public.fee_installments fi
    JOIN active_students s ON s.id = fi.student_id
    GROUP BY fi.student_id
  )
  SELECT
    (SELECT COUNT(*) FROM active_students)                                         AS total_students,
    -- Pending: active students that don't appear in fee_installments at all.
    (SELECT COUNT(*) FROM active_students s
        WHERE NOT EXISTS (SELECT 1 FROM per_student p WHERE p.student_id = s.id)) AS pending_count,
    (SELECT COUNT(*) FROM per_student WHERE outstanding_all > 0)                  AS due_count,
    (SELECT COUNT(*) FROM per_student WHERE outstanding_all = 0)                  AS cleared_count,
    COALESCE((SELECT SUM(total_paid)  FROM per_student), 0)::BIGINT                AS total_collected,
    COALESCE((SELECT SUM(parent_due)  FROM per_student), 0)::BIGINT                AS total_parent_due,
    COALESCE((SELECT SUM(govt_due)    FROM per_student), 0)::BIGINT                AS total_govt_due;
END $$;

GRANT EXECUTE ON FUNCTION public.get_school_fee_aggregate() TO authenticated;
