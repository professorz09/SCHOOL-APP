-- 0112_one_time_due_today.sql
-- ─────────────────────────────────────────────────────────────────────────
-- OneTime fee due date bug fix.
--
-- Earlier OneTime installments were dated v_year_start (= academic_years.
-- start_date). Once the AY had already started — i.e. for every mid-
-- year admission — the OneTime installment landed in the past.
-- compute_late_fee_for_student would then attach months of retroactive
-- late charges to a brand-new student who'd been on the roll for one
-- day. Functionally a regression waiting for the first late-fee click.
--
-- Fix: OneTime due_date = GREATEST(AY_start, CURRENT_DATE).
--   • AY already started → due today (school applies structure today).
--   • AY hasn't started yet → due on AY-start day (pre-admission case).
--
-- MONTHLY heads are unchanged — schools that bill from April do want
-- the back-Aprils to remain on the schedule for students who actually
-- were enrolled in April; only OneTime is reset.

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
  v_year_start DATE;
  v_one_time_due DATE;
  v_count INT := 0;
  v_head JSONB;
  v_dd JSONB;
  v_payer TEXT;
  v_freq TEXT;
  v_amt BIGINT;
  v_name TEXT;
  v_months JSONB;
  v_month_name TEXT;
  v_month_idx INT;
  v_due_year INT;
  v_due_date DATE;
  v_start_year INT;
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

  SELECT start_date INTO v_year_start FROM public.academic_years WHERE id = p_year_id;
  IF v_year_start IS NULL THEN RAISE EXCEPTION 'academic year not found'; END IF;
  v_start_year := EXTRACT(YEAR FROM v_year_start)::INT;
  -- OneTime due date: AY start when AY hasn't begun, today when it has.
  -- Prevents back-dated late-fee accrual for mid-year admissions.
  v_one_time_due := GREATEST(v_year_start, CURRENT_DATE);

  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name   := NULLIF(trim(v_head->>'name'), '');
    v_amt    := (v_head->>'amount')::BIGINT;
    v_freq   := COALESCE(v_head->>'frequency', 'MONTHLY');
    v_months := v_head->'months';
    v_payer  := CASE WHEN p_is_rte THEN 'GOVERNMENT' ELSE 'PARENT' END;

    v_discount := GREATEST(
      v_fixed::BIGINT,
      FLOOR(v_amt * v_pct / 100.0)::BIGINT
    );
    v_amt := GREATEST(0, v_amt - v_discount);

    IF v_freq = 'MONTHLY' THEN
      IF v_months IS NOT NULL AND jsonb_typeof(v_months) = 'array' AND jsonb_array_length(v_months) > 0 THEN
        FOR v_month_name IN SELECT jsonb_array_elements_text(v_months)
        LOOP
          v_month_idx := CASE v_month_name
            WHEN 'Jan' THEN 1 WHEN 'Feb' THEN 2 WHEN 'Mar' THEN 3
            WHEN 'Apr' THEN 4 WHEN 'May' THEN 5 WHEN 'Jun' THEN 6
            WHEN 'Jul' THEN 7 WHEN 'Aug' THEN 8 WHEN 'Sep' THEN 9
            WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
            ELSE NULL END;
          IF v_month_idx IS NULL THEN CONTINUE; END IF;
          v_due_year := CASE WHEN v_month_idx >= 4 THEN v_start_year ELSE v_start_year + 1 END;
          v_due_date := make_date(v_due_year, v_month_idx, 1);
          INSERT INTO public.fee_installments
            (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
          VALUES
            (p_student_id, p_year_id, v_school_id, v_month_name, v_due_date,
             CASE WHEN lower(coalesce(v_name,'')) LIKE '%transport%' THEN 'TRANSPORT'
                  WHEN lower(coalesce(v_name,'')) LIKE '%exam%'      THEN 'EXAM'
                  WHEN lower(coalesce(v_name,'')) LIKE '%tuition%'   THEN 'TUITION'
                  ELSE 'OTHER' END,
             v_name, v_amt, v_payer);
          v_count := v_count + 1;
        END LOOP;
      ELSE
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
             v_name, v_amt, v_payer);
          v_count := v_count + 1;
        END LOOP;
      END IF;
    ELSE
      -- OneTime / legacy non-monthly — due today (or AY start, whichever
      -- is later). Earlier this was pinned to AY start which back-
      -- dated mid-year admissions and tripped retroactive late fees.
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id, 'OneTime', v_one_time_due,
         'OTHER', v_name, v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC) TO authenticated;
