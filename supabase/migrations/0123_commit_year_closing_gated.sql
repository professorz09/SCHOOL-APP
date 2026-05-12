-- 0123_commit_year_closing_gated.sql
-- 0122 gated public.close_academic_year on schools.year_close_enabled.
-- The Year Closing Wizard goes through a different RPC —
-- commit_year_closing — which also flips academic_years.is_closed
-- TRUE as part of its atomic promote-and-roll-over transaction. That
-- path bypassed the gate. Apply the same check + auto-reset to BOTH
-- overloads so any close path requires super-admin unlock first.
--
-- Both function bodies are otherwise unchanged from their previous
-- definitions (CREATE OR REPLACE preserves grants).

-- ── 7-arg overload (legacy) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commit_year_closing(
  p_old_year_id UUID,
  p_new_label   TEXT,
  p_new_start   DATE,
  p_new_end     DATE,
  p_new_board   TEXT DEFAULT 'CBSE',
  p_new_medium  TEXT DEFAULT 'English',
  p_decisions   JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school      UUID := public.current_user_school_id();
  v_new_year_id UUID;
  v_promoted    INT  := 0;
  v_enabled     BOOLEAN;
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

  -- Same gate as close_academic_year — wizard path was previously a bypass.
  SELECT year_close_enabled INTO v_enabled FROM public.schools WHERE id = v_school;
  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Year close is locked. Ask the super-admin to enable Year Close for this school first.';
  END IF;

  UPDATE public.academic_years
     SET is_closed = TRUE, is_active = FALSE
   WHERE id = p_old_year_id;

  UPDATE public.academic_years
     SET is_active = FALSE
   WHERE school_id = v_school AND is_active;

  INSERT INTO public.academic_years
    (school_id, label, start_date, end_date, is_active, board, medium)
  VALUES
    (v_school, p_new_label, p_new_start, p_new_end, TRUE, p_new_board, p_new_medium)
  RETURNING id INTO v_new_year_id;

  v_promoted := public.promote_students(p_old_year_id, v_new_year_id, p_decisions);

  -- One-shot: reset the permission so a second wizard run requires another
  -- super-admin unlock.
  UPDATE public.schools SET year_close_enabled = FALSE WHERE id = v_school;

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (auth.uid(), v_school, 'commit_year_closing', 'academic_year', p_old_year_id,
     jsonb_build_object(
       'new_year_id', v_new_year_id,
       'new_label',   p_new_label,
       'promoted',    v_promoted
     ));

  RETURN jsonb_build_object(
    'new_year_id', v_new_year_id,
    'new_label',   p_new_label,
    'promoted',    v_promoted
  );
END $$;

GRANT EXECUTE ON FUNCTION public.commit_year_closing(UUID, TEXT, DATE, DATE, TEXT, TEXT, JSONB) TO authenticated;


-- ── 8-arg overload (current wizard with dues handling) ────────────────────
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
  v_enabled       BOOLEAN;
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

  -- Same gate as close_academic_year — wizard path was previously a bypass.
  SELECT year_close_enabled INTO v_enabled FROM public.schools WHERE id = v_school;
  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Year close is locked. Ask the super-admin to enable Year Close for this school first.';
  END IF;

  UPDATE public.academic_years
     SET is_closed = TRUE, is_active = FALSE
   WHERE id = p_old_year_id;

  UPDATE public.academic_years
     SET is_active = FALSE
   WHERE school_id = v_school AND is_active;

  INSERT INTO public.academic_years
    (school_id, label, start_date, end_date, is_active, board, medium)
  VALUES
    (v_school, p_new_label, p_new_start, p_new_end, TRUE,
     COALESCE(p_new_board, 'CBSE'), COALESCE(p_new_medium, 'English'))
  RETURNING id INTO v_new_year_id;

  v_promoted := public.promote_students(p_old_year_id, v_new_year_id, p_decisions);

  IF p_dues_handling = 'WRITEOFF' THEN
    UPDATE public.student_academic_records sar
       SET total_fee = 0,
           fee_status = 'PENDING'
     WHERE sar.academic_year_id = v_new_year_id
       AND sar.total_fee > 0;

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

  -- One-shot reset for the wizard path too.
  UPDATE public.schools SET year_close_enabled = FALSE WHERE id = v_school;

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (auth.uid(), v_school, 'commit_year_closing', 'academic_year', p_old_year_id,
     jsonb_build_object(
       'new_year_id',      v_new_year_id,
       'new_label',        p_new_label,
       'promoted',         v_promoted,
       'dues_handling',    p_dues_handling,
       'written_off_rows', v_written_off,
       'written_off_amt',  v_writeoff_amt
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
