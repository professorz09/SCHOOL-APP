-- 0106_installment_head_name.sql
-- ─────────────────────────────────────────────────────────────────────────
-- fee_installments only carries a coarse `fee_type` bucket (TUITION /
-- EXAM / TRANSPORT / OTHER). Heads like "Library Fees", "Smart Class
-- Fee", "Admission Fee", "School Fees" all collapse into OTHER and the
-- principal sees a wall of "Other ₹X" rows in the student profile.
--
-- Fix: add `head_name TEXT` to fee_installments and write it from
-- generate_student_fee_schedule. The UI prefers head_name when present
-- and falls back to fee_type for legacy rows.

ALTER TABLE public.fee_installments
  ADD COLUMN IF NOT EXISTS head_name TEXT;

-- Update the schedule generator to preserve the original head name.
DROP FUNCTION IF EXISTS public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id      UUID,
  p_year_id         UUID,
  p_heads           JSONB,
  p_due_dates       JSONB,
  p_is_rte          BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_pct    NUMERIC DEFAULT 0
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_caller UUID := auth.uid();
  v_count INT := 0;
  v_head JSONB;
  v_dd JSONB;
  v_payer TEXT;
  v_freq TEXT;
  v_amt BIGINT;
  v_name TEXT;
  v_discount BIGINT;
  v_pct NUMERIC := COALESCE(p_discount_pct, 0);
  v_fixed NUMERIC := COALESCE(p_discount_amount, 0);
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'discount_pct out of range'; END IF;
  IF v_fixed < 0 THEN RAISE EXCEPTION 'discount_amount must be non-negative'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := NULLIF(trim(v_head->>'name'), '');
    v_amt  := (v_head->>'amount')::BIGINT;
    v_freq := COALESCE(v_head->>'frequency', 'MONTHLY');
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
          (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
        VALUES
          (p_student_id, p_year_id, v_school_id, v_dd->>'month',
           (v_dd->>'date')::DATE,
           CASE WHEN lower(coalesce(v_name,'')) LIKE '%transport%' THEN 'TRANSPORT'
                WHEN lower(coalesce(v_name,'')) LIKE '%exam%'      THEN 'EXAM'
                WHEN lower(coalesce(v_name,'')) LIKE '%tuition%'   THEN 'TUITION'
                ELSE 'OTHER' END,
           v_name,
           v_amt, v_payer);
        v_count := v_count + 1;
      END LOOP;
    ELSE
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
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
