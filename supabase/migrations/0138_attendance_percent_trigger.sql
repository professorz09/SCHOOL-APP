-- =============================================================
-- 0138_attendance_percent_trigger.sql
-- =============================================================
-- student_academic_records.attendance_percent was only ever set to 0
-- on insert and at promotion. No code path recomputed it when daily
-- attendance was marked or edited, so the column was effectively
-- always-zero. Year-closing's "detain anyone below 75%" preview would
-- mass-flag every active student.
--
-- This trigger keeps the column in sync:
--   • Fires AFTER INSERT/UPDATE/DELETE on attendance_student_details
--   • For each affected (student_id, academic_year_id) recomputes
--       (present + 0.5*half) / (present + half + absent) * 100
--     matching the formula now used in the Analytics dashboard.
--   • Holidays excluded from both sides.
--
-- Row-level trigger — bulk attendance submits N rows per class
-- (typically 40) which is fine; each recompute is a single indexed
-- query through attendance_records.
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.recompute_student_attendance_pct()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_year_id    UUID;
  v_present    INT;
  v_half       INT;
  v_absent     INT;
  v_denom      INT;
  v_pct        NUMERIC(5,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_student_id := OLD.student_id;
    SELECT academic_year_id INTO v_year_id
      FROM public.attendance_records WHERE id = OLD.attendance_id;
  ELSE
    v_student_id := NEW.student_id;
    SELECT academic_year_id INTO v_year_id
      FROM public.attendance_records WHERE id = NEW.attendance_id;
  END IF;

  IF v_year_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE asd.status = 'present'),
    COUNT(*) FILTER (WHERE asd.status = 'half'),
    COUNT(*) FILTER (WHERE asd.status = 'absent')
  INTO v_present, v_half, v_absent
  FROM public.attendance_student_details asd
  JOIN public.attendance_records ar ON ar.id = asd.attendance_id
  WHERE asd.student_id = v_student_id
    AND ar.academic_year_id = v_year_id;

  v_denom := COALESCE(v_present, 0) + COALESCE(v_half, 0) + COALESCE(v_absent, 0);
  IF v_denom > 0 THEN
    v_pct := ROUND(
      (((COALESCE(v_present, 0) + COALESCE(v_half, 0) * 0.5) / v_denom::NUMERIC) * 100)::NUMERIC,
      2
    );
  ELSE
    v_pct := 0;
  END IF;

  UPDATE public.student_academic_records
     SET attendance_percent = v_pct
   WHERE student_id = v_student_id
     AND academic_year_id = v_year_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS attsd_recompute_pct ON public.attendance_student_details;
CREATE TRIGGER attsd_recompute_pct
AFTER INSERT OR UPDATE OR DELETE ON public.attendance_student_details
FOR EACH ROW EXECUTE FUNCTION public.recompute_student_attendance_pct();


-- One-shot back-fill: recompute every existing AR row from current
-- attendance_student_details so the column is correct from day one.
UPDATE public.student_academic_records sar
   SET attendance_percent = COALESCE(t.pct, 0)
  FROM (
    SELECT
      asd.student_id,
      ar.academic_year_id,
      ROUND(
        (
          (
            COUNT(*) FILTER (WHERE asd.status = 'present')
            + COUNT(*) FILTER (WHERE asd.status = 'half') * 0.5
          ) /
          NULLIF(
            COUNT(*) FILTER (WHERE asd.status IN ('present','half','absent'))
          , 0)::NUMERIC
          * 100
        )::NUMERIC,
        2
      ) AS pct
    FROM public.attendance_student_details asd
    JOIN public.attendance_records ar ON ar.id = asd.attendance_id
    GROUP BY asd.student_id, ar.academic_year_id
  ) t
 WHERE sar.student_id = t.student_id
   AND sar.academic_year_id = t.academic_year_id;

COMMIT;
