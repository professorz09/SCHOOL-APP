-- 0060_fee_schedule_due_date_fallbacks.sql
--
-- Patches generate_student_fee_schedule so it can never insert a NULL
-- due_date into fee_installments. Two failure modes were observed in
-- production after 0017 shipped:
--
--   (a) ANNUAL / ONE_TIME head + empty p_due_dates → MIN(...) was NULL.
--       The RPC blew up with "null value in column 'due_date' violates
--       not-null constraint" and rolled back the whole regenerate, so
--       the principal saw a half-broken UI for that student.
--
--   (b) A MONTHLY due-dates row missing its `date` key → same crash.
--
-- Behaviour after this migration:
--   * Annual/one-time heads fall back to the academic_years.start_date
--     when p_due_dates is empty or every entry lacks a date — that's a
--     sensible "due at the start of the year" default and matches what
--     principals already eyeball when reading a year-start invoice.
--   * Monthly rows missing a date are skipped silently rather than
--     poisoning the whole insert. v_count stays accurate.
--   * Function is recreated with the same signature so existing callers
--     and the GRANT line don't need re-issuing.
--
-- Idempotent: CREATE OR REPLACE.

BEGIN;

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
  v_year_start DATE;
  v_dd_str TEXT;
  v_dd_date DATE;
  v_fallback_date DATE;
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

  -- Cache the AY start so annual / one-time heads have a sensible fallback
  -- when p_due_dates is empty. CURRENT_DATE is the second-line backstop
  -- (e.g., AY missing a start_date — should never happen, defensive only).
  SELECT start_date INTO v_year_start FROM public.academic_years WHERE id = p_year_id;
  v_fallback_date := COALESCE(v_year_start, CURRENT_DATE);

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
        -- Skip rows without a date instead of letting NULL hit the column.
        -- Earlier behaviour was to insert NULL → not-null constraint blew
        -- up the whole regenerate, leaving the student in a half-state.
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
      -- ANNUAL / ONE_TIME: pick the earliest due date from the structure,
      -- and fall back to the AY start when the structure has none.
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         COALESCE(
           (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(p_due_dates) dd
             WHERE dd->>'date' IS NOT NULL AND length(btrim(dd->>'date')) > 0),
           v_fallback_date
         ),
         'OTHER',
         v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;

COMMIT;
