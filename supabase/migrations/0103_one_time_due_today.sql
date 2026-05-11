-- 0103_one_time_due_today.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Changes the schedule generator so ONE_TIME / ANNUAL fee heads are due
-- on the date the schedule is generated (CURRENT_DATE), not on the
-- academic-year start. Admission fees, annual-day fees, etc. are
-- typically collected at the moment of admission — pinning them to
-- April 1st made them look "already overdue" the moment a mid-year
-- joiner's schedule was created.
--
-- ANNUAL is treated identically to ONE_TIME going forward — the UI
-- merges them into a single "One-time" option since they were already
-- behaving the same in the DB (one row, one date, no recurrence).
--
-- Idempotent: CREATE OR REPLACE.

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
  v_dd_str TEXT;
  v_dd_date DATE;
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

  -- Drop unpaid/un-written-off rows so we re-create cleanly. Paid history is preserved.
  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := v_head->>'name';
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
        v_dd_str := v_dd->>'date';
        IF v_dd_str IS NULL OR length(btrim(v_dd_str)) = 0 THEN
          CONTINUE;
        END IF;
        v_dd_date := v_dd_str::DATE;

        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
        VALUES
          (p_student_id, p_year_id, v_school_id, v_dd->>'month',
           v_dd_date,
           CASE WHEN lower(v_name) LIKE '%transport%' THEN 'TRANSPORT'
                WHEN lower(v_name) LIKE '%exam%'      THEN 'EXAM'
                WHEN lower(v_name) LIKE '%tuition%'   THEN 'TUITION'
                ELSE 'OTHER' END,
           v_amt, v_payer);
        v_count := v_count + 1;
      END LOOP;
    ELSE
      -- ONE_TIME (and legacy ANNUAL) → due *today*. Schools collect
      -- one-shot fees at the moment of admission, not on AY start;
      -- pinning them to April 1 made them look pre-overdue.
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         'OneTime',
         CURRENT_DATE,
         CASE WHEN lower(v_name) LIKE '%transport%' THEN 'TRANSPORT'
              WHEN lower(v_name) LIKE '%exam%'      THEN 'EXAM'
              WHEN lower(v_name) LIKE '%tuition%'   THEN 'TUITION'
              ELSE 'OTHER' END,
         v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
