-- 0061_reverse_payment_academic_year_fix.sql
--
-- Patches reverse_payment to copy academic_year_id from the original
-- payment_records row onto the reversal entry. Without this, the reversal
-- INSERT crashed with "null value in column 'academic_year_id' violates
-- not-null constraint" because the function never selected the column from
-- the original row in the first place.
--
-- The original row has been auth-validated by the server route and is the
-- authoritative source of the year, so we just mirror it onto the negative
-- entry. Same fix in two places: the SELECT loader and the INSERT.
--
-- Idempotent: CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION public.reverse_payment(
  p_payment_id uuid,
  p_user_id    uuid,
  p_reason     text
)
RETURNS TABLE (reversal_id uuid, original_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig         record;
  v_reversal_id  uuid;
  v_link         record;
  v_inst         record;
  v_new_paid     numeric;
  v_new_status   text;
  v_total        numeric;
  v_writeoff     numeric;
  v_remaining    numeric;
  v_stamped      int;
BEGIN
  SELECT id, school_id, student_id, academic_year_id, amount, method, date,
         receipt_no, advance_amount, note, reversed_at, reverses_payment_id
    INTO v_orig
    FROM public.payment_records
   WHERE id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orig.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = 'unique_violation';
  END IF;
  IF v_orig.reverses_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot_reverse_a_reversal' USING ERRCODE = 'check_violation';
  END IF;
  IF v_orig.amount <= 0 THEN
    RAISE EXCEPTION 'non_positive_amount' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.payment_records
     SET reversed_at     = now(),
         reversed_by     = p_user_id,
         reversal_reason = p_reason
   WHERE id = p_payment_id
     AND reversed_at IS NULL;
  GET DIAGNOSTICS v_stamped = ROW_COUNT;
  IF v_stamped = 0 THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.payment_records (
    school_id, student_id, academic_year_id,
    amount, method, date, receipt_no,
    advance_amount, note, reverses_payment_id, reversed_by, reversal_reason
  ) VALUES (
    v_orig.school_id, v_orig.student_id, v_orig.academic_year_id,
    -abs(v_orig.amount),
    v_orig.method, (now() AT TIME ZONE 'Asia/Kolkata')::date,
    'REV-' || v_orig.receipt_no,
    -abs(coalesce(v_orig.advance_amount, 0)),
    'Reversal of ' || v_orig.receipt_no || ': ' || p_reason,
    v_orig.id, p_user_id, p_reason
  )
  RETURNING id INTO v_reversal_id;

  FOR v_link IN
    SELECT installment_id, amount_applied
      FROM public.payment_installment_links
     WHERE payment_id = v_orig.id
  LOOP
    SELECT id, amount, paid_amount, write_off_amount, status
      INTO v_inst
      FROM public.fee_installments
     WHERE id = v_link.installment_id
     FOR UPDATE;

    IF FOUND THEN
      v_new_paid := greatest(0, v_inst.paid_amount - v_link.amount_applied);
      v_total    := v_inst.amount;
      v_writeoff := coalesce(v_inst.write_off_amount, 0);
      v_remaining := v_total - v_writeoff;

      IF v_writeoff >= v_total THEN
        v_new_status := 'WAIVED';
      ELSIF v_new_paid >= v_remaining AND v_remaining > 0 THEN
        v_new_status := 'PAID';
      ELSIF v_new_paid + v_writeoff >= v_total AND v_writeoff > 0 THEN
        v_new_status := 'WAIVED';
      ELSIF v_new_paid > 0 THEN
        v_new_status := 'PARTIAL';
      ELSE
        v_new_status := 'UNPAID';
      END IF;

      UPDATE public.fee_installments
         SET paid_amount = v_new_paid,
             status      = v_new_status,
             updated_at  = now()
       WHERE id = v_inst.id;

      INSERT INTO public.payment_installment_links (
        payment_id, installment_id, amount_applied
      ) VALUES (
        v_reversal_id, v_inst.id, -v_link.amount_applied
      );
    END IF;
  END LOOP;

  IF coalesce(v_orig.advance_amount, 0) > 0 THEN
    INSERT INTO public.advance_balances (student_id, amount)
    VALUES (v_orig.student_id, 0)
    ON CONFLICT (student_id) DO NOTHING;

    UPDATE public.advance_balances
       SET amount = greatest(0, amount - v_orig.advance_amount)
     WHERE student_id = v_orig.student_id;
  END IF;

  RETURN QUERY SELECT v_reversal_id, v_orig.id;
END;
$$;

COMMIT;
