-- 0008_year_closing_dues_handling.sql
--
-- Make the wizard's outstandingDuesHandling choice actually mean something.
--
-- ARREARS  (default) — carry unpaid balance forward into the new year via
--                      promote_students() (existing behavior).
-- WRITEOFF          — after promotion, zero-out the carried `total_fee` on
--                      the new-year student_academic_records AND mark every
--                      remaining unpaid old-year fee_installment as written
--                      off, with a corresponding fee_write_offs row.
--
-- Re-creates commit_year_closing with one extra parameter:
--   p_dues_handling TEXT — 'ARREARS' (default) | 'WRITEOFF'
-- The old 7-arg signature is preserved (its body is just rewritten to
-- delegate to the 8-arg one with 'ARREARS') so existing callers keep
-- working.

CREATE OR REPLACE FUNCTION public.commit_year_closing(
  p_old_year_id   UUID,
  p_new_label     TEXT,
  p_new_start     DATE,
  p_new_end       DATE,
  p_new_board     TEXT,
  p_new_medium    TEXT,
  p_decisions     JSONB,
  p_dues_handling TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school        UUID := public.current_user_school_id();
  v_new_year_id   UUID;
  v_promoted      INT  := 0;
  v_written_off   INT  := 0;
  v_writeoff_amt  BIGINT := 0;
BEGIN
  IF auth.uid() IS NULL                           THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal()                    THEN RAISE EXCEPTION 'principal only'; END IF;
  IF v_school IS NULL                             THEN RAISE EXCEPTION 'no school for caller'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years
                  WHERE id = p_old_year_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'old year not found in caller school';
  END IF;
  IF p_new_label IS NULL OR length(trim(p_new_label)) = 0 THEN
    RAISE EXCEPTION 'new year label required';
  END IF;
  IF p_new_start IS NULL OR p_new_end IS NULL OR p_new_end <= p_new_start THEN
    RAISE EXCEPTION 'invalid date range for new year';
  END IF;
  IF p_dues_handling NOT IN ('ARREARS', 'WRITEOFF', 'NONE') THEN
    RAISE EXCEPTION 'invalid dues handling: %', p_dues_handling;
  END IF;

  -- 1. Lock old year (idempotent)
  UPDATE public.academic_years
     SET is_closed = TRUE, is_active = FALSE
   WHERE id = p_old_year_id;

  -- 2. Atomically deactivate any other active years and insert the new one
  UPDATE public.academic_years
     SET is_active = FALSE
   WHERE school_id = v_school AND is_active;

  INSERT INTO public.academic_years
    (school_id, label, start_date, end_date, is_active, board, medium)
  VALUES
    (v_school, p_new_label, p_new_start, p_new_end, TRUE,
     COALESCE(p_new_board, 'CBSE'), COALESCE(p_new_medium, 'English'))
  RETURNING id INTO v_new_year_id;

  -- 3. Promote students (always carries v_carry into next year initially)
  v_promoted := public.promote_students(p_old_year_id, v_new_year_id, p_decisions);

  -- 4. Honor WRITEOFF — strip the just-carried dues + record write-offs
  IF p_dues_handling = 'WRITEOFF' THEN
    -- 4a. Zero out the new-year student_academic_records.total_fee that
    --     came from the carry-forward (no real schedule exists yet for
    --     the new year, so total_fee here is purely the v_carry value)
    UPDATE public.student_academic_records sar
       SET total_fee = 0,
           fee_status = 'PENDING'
     WHERE sar.academic_year_id = v_new_year_id
       AND sar.total_fee > 0;

    -- 4b. Record write-offs for every UNPAID old-year installment
    INSERT INTO public.fee_write_offs
      (installment_id, school_id, amount, reason, approved_by)
    SELECT fi.id,
           fi.school_id,
           GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount),
           'year_closing_writeoff',
           auth.uid()
      FROM public.fee_installments fi
     WHERE fi.academic_year_id = p_old_year_id
       AND fi.school_id = v_school
       AND fi.status <> 'PAID'
       AND (fi.amount - fi.paid_amount - fi.write_off_amount) > 0;

    GET DIAGNOSTICS v_written_off = ROW_COUNT;

    -- 4c. Mark those installments themselves as written off
    UPDATE public.fee_installments
       SET write_off_amount = write_off_amount
                              + GREATEST(0, amount - paid_amount - write_off_amount),
           write_off_reason = COALESCE(write_off_reason, 'year_closing_writeoff'),
           status = 'WRITTEN_OFF',
           updated_at = NOW()
     WHERE academic_year_id = p_old_year_id
       AND school_id = v_school
       AND status <> 'PAID'
       AND (amount - paid_amount - write_off_amount) > 0;

    SELECT COALESCE(SUM(amount), 0) INTO v_writeoff_amt
      FROM public.fee_write_offs
     WHERE installment_id IN (
       SELECT id FROM public.fee_installments
        WHERE academic_year_id = p_old_year_id AND school_id = v_school)
       AND reason = 'year_closing_writeoff';
  END IF;

  -- 5. Single audit row covering the whole atomic operation
  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (auth.uid(), v_school, 'commit_year_closing', 'academic_year', p_old_year_id,
     jsonb_build_object(
       'new_year_id',     v_new_year_id,
       'new_label',       p_new_label,
       'promoted',        v_promoted,
       'dues_handling',   p_dues_handling,
       'written_off_rows', v_written_off,
       'written_off_amt', v_writeoff_amt
     ));

  RETURN jsonb_build_object(
    'new_year_id',      v_new_year_id,
    'new_label',        p_new_label,
    'promoted',         v_promoted,
    'dues_handling',    p_dues_handling,
    'written_off_rows', v_written_off,
    'written_off_amt',  v_writeoff_amt
  );
END $$;

GRANT EXECUTE ON FUNCTION public.commit_year_closing(UUID, TEXT, DATE, DATE, TEXT, TEXT, JSONB, TEXT) TO authenticated;

-- Backwards-compatible 7-arg shim — defaults to ARREARS
CREATE OR REPLACE FUNCTION public.commit_year_closing(
  p_old_year_id UUID,
  p_new_label   TEXT,
  p_new_start   DATE,
  p_new_end     DATE,
  p_new_board   TEXT,
  p_new_medium  TEXT,
  p_decisions   JSONB
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.commit_year_closing(
    p_old_year_id, p_new_label, p_new_start, p_new_end,
    p_new_board, p_new_medium, p_decisions, 'ARREARS'
  );
$$;

GRANT EXECUTE ON FUNCTION public.commit_year_closing(UUID, TEXT, DATE, DATE, TEXT, TEXT, JSONB) TO authenticated;
