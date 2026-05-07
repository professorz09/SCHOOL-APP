-- =============================================================
-- 0071_pay_installment_rpc.sql
-- =============================================================
-- Adds `pay_installment` — a strict, single-row payment RPC that:
--   • Applies cash + (optional) discount to ONE specific fee_installment row
--     chosen by the caller (no oldest-due-first guessing).
--   • Hard-rejects overpay (cash + discount > outstanding) instead of
--     silently dumping the surplus into advance_balances.
--   • Writes the matching payment_records row, payment_installment_links
--     row, and (if discount > 0) a fee_write_offs row so the existing
--     history/expand-on-tap UI shows the full audit trail.
--
-- Coexists with record_fee_payment (oldest-first): callers pick the RPC
-- that matches the UX they want.
-- =============================================================

CREATE OR REPLACE FUNCTION public.pay_installment(
  p_installment_id UUID,
  p_amount         BIGINT,                -- cash applied (≥ 0)
  p_discount       BIGINT  DEFAULT 0,     -- write-off applied to this row (≥ 0)
  p_method         TEXT    DEFAULT 'CASH',
  p_date           DATE    DEFAULT CURRENT_DATE,
  p_note           TEXT    DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_inst         RECORD;
  v_outstanding  BIGINT;
  v_payment_id   UUID;
  v_receipt      TEXT;
  v_total_apply  BIGINT;
  v_disc         BIGINT;
  v_amt          BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  v_amt  := COALESCE(p_amount, 0);
  v_disc := GREATEST(0, COALESCE(p_discount, 0));

  IF v_amt < 0  THEN RAISE EXCEPTION 'amount must be non-negative'; END IF;
  IF v_amt = 0 AND v_disc = 0 THEN
    RAISE EXCEPTION 'nothing to apply (amount and discount both zero)';
  END IF;

  -- Lock the target installment so concurrent payments can't double-spend it.
  SELECT id, student_id, school_id, academic_year_id, amount, paid_amount,
         write_off_amount, fee_type, month, due_date
    INTO v_inst
    FROM public.fee_installments
   WHERE id = p_installment_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'installment not found'; END IF;

  -- Authorise: same rule as record_fee_payment.
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_inst.school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_outstanding := v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount;
  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'installment already cleared';
  END IF;

  v_total_apply := v_amt + v_disc;
  IF v_total_apply > v_outstanding THEN
    RAISE EXCEPTION 'overpay blocked (outstanding=%, attempted=%)',
      v_outstanding, v_total_apply;
  END IF;

  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS')
                     || '-' || substr(v_inst.student_id::text, 1, 4);

  -- Insert the payment row (cash only — discount tracked separately).
  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, discount_amount,
     method, date, receipt_no, note)
  VALUES
    (v_inst.student_id, v_inst.school_id, v_inst.academic_year_id,
     v_amt, v_disc, p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  -- Link payment → installment (only when cash > 0).
  IF v_amt > 0 THEN
    INSERT INTO public.payment_installment_links
      (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_amt);
  END IF;

  -- Persist discount as an explicit write-off audit row.
  IF v_disc > 0 THEN
    INSERT INTO public.fee_write_offs
      (installment_id, student_id, school_id, amount, reason, approved_by)
    VALUES
      (v_inst.id, v_inst.student_id, v_inst.school_id, v_disc,
       COALESCE(p_note, 'Discount'), v_caller);
  END IF;

  -- Bump the installment + recompute its derived status.
  UPDATE public.fee_installments
     SET paid_amount      = paid_amount + v_amt,
         write_off_amount = write_off_amount + v_disc,
         write_off_reason = CASE
                              WHEN v_disc > 0
                                THEN COALESCE(p_note, write_off_reason, 'Discount')
                              ELSE write_off_reason
                            END,
         status = public.compute_installment_status(
                    amount,
                    paid_amount + v_amt,
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
       'receipt',        v_receipt));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pay_installment(UUID, BIGINT, BIGINT, TEXT, DATE, TEXT)
  TO authenticated;
