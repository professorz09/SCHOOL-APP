-- =============================================================
-- 0072_pay_installment_advance.sql
-- =============================================================
-- Extends pay_installment with optional `p_use_advance`. When TRUE
-- and the student has a positive advance_balances row, that pool
-- is drawn from FIRST to clear the installment. Any cash entered
-- (`p_amount`) is layered on top. Overpay is still hard-rejected.
--
-- Method is unchanged TEXT — UIs may pass 'GOVERNMENT' to mark the
-- payment as government-funded so history can render it differently.
-- =============================================================

DROP FUNCTION IF EXISTS public.pay_installment(UUID, BIGINT, BIGINT, TEXT, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.pay_installment(
  p_installment_id UUID,
  p_amount         BIGINT,
  p_discount       BIGINT  DEFAULT 0,
  p_method         TEXT    DEFAULT 'CASH',
  p_date           DATE    DEFAULT CURRENT_DATE,
  p_note           TEXT    DEFAULT NULL,
  p_use_advance    BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_inst         RECORD;
  v_outstanding  BIGINT;
  v_payment_id   UUID;
  v_receipt      TEXT;
  v_disc         BIGINT;
  v_amt          BIGINT;
  v_advance      BIGINT := 0;
  v_advance_use  BIGINT := 0;
  v_total_apply  BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  v_amt  := COALESCE(p_amount, 0);
  v_disc := GREATEST(0, COALESCE(p_discount, 0));

  IF v_amt < 0  THEN RAISE EXCEPTION 'amount must be non-negative'; END IF;

  SELECT id, student_id, school_id, academic_year_id, amount, paid_amount,
         write_off_amount, fee_type, month, due_date
    INTO v_inst
    FROM public.fee_installments
   WHERE id = p_installment_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'installment not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_inst.school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_outstanding := v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount;
  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'installment already cleared';
  END IF;

  -- Pull from advance pool first if requested. Cap by what's needed
  -- after cash + discount have been considered, so we never overdraw.
  IF p_use_advance THEN
    SELECT COALESCE(amount, 0) INTO v_advance
      FROM public.advance_balances
     WHERE student_id = v_inst.student_id
     FOR UPDATE;
    v_advance := COALESCE(v_advance, 0);
    -- Need to cover (outstanding - cash - discount) at most
    v_advance_use := LEAST(
      v_advance,
      GREATEST(0, v_outstanding - v_amt - v_disc)
    );
  END IF;

  IF v_amt = 0 AND v_disc = 0 AND v_advance_use = 0 THEN
    RAISE EXCEPTION 'nothing to apply (amount, discount and advance are zero)';
  END IF;

  v_total_apply := v_amt + v_disc + v_advance_use;
  IF v_total_apply > v_outstanding THEN
    RAISE EXCEPTION 'overpay blocked (outstanding=%, attempted=%)',
      v_outstanding, v_total_apply;
  END IF;

  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS')
                     || '-' || substr(v_inst.student_id::text, 1, 4);

  -- Cash leg of the payment row records the actual cash + advance
  -- drawn (so totals reconcile against payment_installment_links),
  -- minus the discount which is tracked separately.
  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id,
     amount, discount_amount, method, date, receipt_no, note)
  VALUES
    (v_inst.student_id, v_inst.school_id, v_inst.academic_year_id,
     v_amt + v_advance_use, v_disc, p_method, p_date, v_receipt,
     CASE
       WHEN v_advance_use > 0 AND p_note IS NOT NULL
         THEN p_note || ' (incl. ₹' || v_advance_use || ' advance)'
       WHEN v_advance_use > 0
         THEN '₹' || v_advance_use || ' from advance credit'
       ELSE p_note
     END)
  RETURNING id INTO v_payment_id;

  IF (v_amt + v_advance_use) > 0 THEN
    INSERT INTO public.payment_installment_links
      (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_amt + v_advance_use);
  END IF;

  IF v_disc > 0 THEN
    INSERT INTO public.fee_write_offs
      (installment_id, student_id, school_id, amount, reason, approved_by)
    VALUES
      (v_inst.id, v_inst.student_id, v_inst.school_id, v_disc,
       COALESCE(p_note, 'Discount'), v_caller);
  END IF;

  -- Decrement the advance pool.
  IF v_advance_use > 0 THEN
    UPDATE public.advance_balances
       SET amount = amount - v_advance_use,
           updated_at = NOW()
     WHERE student_id = v_inst.student_id;
  END IF;

  UPDATE public.fee_installments
     SET paid_amount      = paid_amount + v_amt + v_advance_use,
         write_off_amount = write_off_amount + v_disc,
         write_off_reason = CASE
                              WHEN v_disc > 0
                                THEN COALESCE(p_note, write_off_reason, 'Discount')
                              ELSE write_off_reason
                            END,
         status = public.compute_installment_status(
                    amount,
                    paid_amount + v_amt + v_advance_use,
                    write_off_amount + v_disc,
                    due_date),
         updated_at = NOW()
   WHERE id = v_inst.id;

  PERFORM public.refresh_student_fee_aggregate(v_inst.student_id, v_inst.academic_year_id);

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (v_caller, v_inst.school_id, 'fee_payment_per_installment', 'payment', v_payment_id,
     jsonb_build_object(
       'installment_id', v_inst.id,
       'student_id',     v_inst.student_id,
       'month',          v_inst.month,
       'fee_type',       v_inst.fee_type,
       'amount',         v_amt,
       'discount',       v_disc,
       'advance_used',   v_advance_use,
       'method',         p_method,
       'receipt',        v_receipt));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pay_installment(UUID, BIGINT, BIGINT, TEXT, DATE, TEXT, BOOLEAN)
  TO authenticated;
