-- 0106_fee_aggregate_upcoming_and_head_name.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Two related fixes for the fee module:
--
-- 1. UI needs a separate "upcoming" total alongside the existing "overdue
--    parent due" — so the principal can see what's due today (rose) vs
--    what will become due later in the year (slate). Add
--    total_parent_upcoming to get_school_fee_aggregate.
--
-- 2. fee_installments only stored the bucketed fee_type (TUITION / EXAM /
--    TRANSPORT / OTHER) — so a school's "Library Fee", "Smart Class Fee",
--    etc. all rendered as "Other" in the FeeLedger. Add a fee_head_name
--    column to preserve the original head string from the fee_structures
--    JSONB, populate it from existing rows where possible, and update
--    generate_student_fee_schedule to fill it on new inserts.

-- ─── 1. fee_installments.fee_head_name ────────────────────────────────
ALTER TABLE public.fee_installments
  ADD COLUMN IF NOT EXISTS fee_head_name TEXT;

-- Backfill: existing rows have no head name. The best we can do is map
-- the bucketed fee_type back to a sensible label. Real per-row names
-- will start landing as soon as the regenerated function below runs.
UPDATE public.fee_installments
   SET fee_head_name = CASE fee_type
     WHEN 'TUITION'   THEN 'Tuition Fee'
     WHEN 'EXAM'      THEN 'Exam Fee'
     WHEN 'TRANSPORT' THEN 'Transport Fee'
     ELSE                  'Other'
   END
 WHERE fee_head_name IS NULL;

-- ─── 2. Regenerate generate_student_fee_schedule to capture v_name ────
-- Only the INSERT columns + values change — every other branch matches
-- the existing function (3864-3966 in _apply.sql) byte-for-byte.
CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id      UUID,
  p_year_id         UUID,
  p_heads           JSONB,
  p_due_dates       JSONB,
  p_is_rte          BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_pct    NUMERIC DEFAULT 0
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_h         JSONB;
  v_dd        JSONB;
  v_amt       BIGINT;
  v_freq      TEXT;
  v_name      TEXT;
  v_count     INT := 0;
  v_payer     TEXT;
  v_discount  BIGINT;
  v_pct       NUMERIC := COALESCE(p_discount_pct, 0);
  v_fixed     NUMERIC := COALESCE(p_discount_amount, 0);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'discount_pct out of range'; END IF;
  IF v_fixed < 0 THEN RAISE EXCEPTION 'discount_amount must be non-negative'; END IF;

  SELECT s.school_id INTO v_school_id
  FROM public.students s WHERE s.id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;

  -- Clear prior unpaid rows so re-runs (regen after edits) don't dupe.
  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_h IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := COALESCE(v_h->>'name', '');
    v_amt  := COALESCE((v_h->>'amount')::BIGINT, 0);
    v_freq := COALESCE(v_h->>'frequency', 'MONTHLY');
    IF v_amt <= 0 THEN CONTINUE; END IF;

    v_payer := CASE WHEN p_is_rte THEN 'GOVERNMENT' ELSE 'PARENT' END;

    v_discount := GREATEST(
      v_fixed::BIGINT,
      FLOOR(v_amt * v_pct / 100.0)::BIGINT
    );
    v_amt := GREATEST(0, v_amt - v_discount);

    IF v_freq = 'MONTHLY' THEN
      FOR v_dd IN SELECT * FROM jsonb_array_elements(p_due_dates)
      LOOP
        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date,
           fee_type, fee_head_name, amount, payer_type)
        VALUES
          (p_student_id, p_year_id, v_school_id, v_dd->>'month',
           (v_dd->>'date')::DATE,
           CASE WHEN lower(v_name) LIKE '%transport%' THEN 'TRANSPORT'
                WHEN lower(v_name) LIKE '%exam%'      THEN 'EXAM'
                WHEN lower(v_name) LIKE '%tuition%'   THEN 'TUITION'
                ELSE 'OTHER' END,
           v_name,
           v_amt, v_payer);
        v_count := v_count + 1;
      END LOOP;
    ELSE  -- ANNUAL / ONE_TIME → single row
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date,
         fee_type, fee_head_name, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(p_due_dates) dd),
         'OTHER',
         v_name,
         v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC) TO authenticated;

-- ─── 3. Add total_parent_upcoming to school fee aggregate ─────────────
CREATE OR REPLACE FUNCTION public.get_school_fee_aggregate()
RETURNS TABLE (
  total_students          BIGINT,
  pending_count           BIGINT,
  due_count               BIGINT,
  cleared_count           BIGINT,
  total_collected         BIGINT,
  total_parent_due        BIGINT,
  total_parent_upcoming   BIGINT,
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
  per_student AS (
    SELECT
      fi.student_id,
      SUM(GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount))
        AS lifetime_outstanding,
      SUM(CASE WHEN fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                            AS now_outstanding,
      SUM(CASE WHEN fi.payer_type = 'PARENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                            AS parent_due_now,
      SUM(CASE WHEN fi.payer_type = 'PARENT' AND fi.due_date >  CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                            AS parent_upcoming,
      SUM(CASE WHEN fi.payer_type = 'GOVERNMENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                            AS govt_due_now,
      SUM(fi.paid_amount)                                             AS total_paid
    FROM public.fee_installments fi
    JOIN active_students s ON s.id = fi.student_id
    GROUP BY fi.student_id
  )
  SELECT
    (SELECT COUNT(*) FROM active_students)                                              AS total_students,
    (SELECT COUNT(*) FROM active_students s
        WHERE NOT EXISTS (SELECT 1 FROM per_student p WHERE p.student_id = s.id))      AS pending_count,
    (SELECT COUNT(*) FROM per_student WHERE now_outstanding > 0)                       AS due_count,
    (SELECT COUNT(*) FROM per_student WHERE lifetime_outstanding = 0)                  AS cleared_count,
    COALESCE((SELECT SUM(total_paid)      FROM per_student), 0)::BIGINT                AS total_collected,
    COALESCE((SELECT SUM(parent_due_now)  FROM per_student), 0)::BIGINT                AS total_parent_due,
    COALESCE((SELECT SUM(parent_upcoming) FROM per_student), 0)::BIGINT                AS total_parent_upcoming,
    COALESCE((SELECT SUM(govt_due_now)    FROM per_student), 0)::BIGINT                AS total_govt_due;
END $$;

GRANT EXECUTE ON FUNCTION public.get_school_fee_aggregate() TO authenticated;
