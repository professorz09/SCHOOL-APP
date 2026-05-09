-- =============================================================
-- 0084_drop_advance_credit.sql
-- =============================================================
-- Removes the "advance credit" concept. Schools that use this app
-- collect monthly fees; surplus payments held as a school liability
-- caused more confusion than it solved (98% case: family pays the
-- exact installment; overpay was either a typo or a refund event).
--
-- After this migration:
--   • record_fee_payment    REJECTS overpay (no silent advance dump)
--   • pay_installment       drops p_use_advance parameter
--   • advance_balances rows zeroed via audit-friendly write-off
--   • Existing balances logged into audit_logs as 'advance_credit_zeroed'
--     so the school can refund those families manually.
--
-- The advance_balances table itself is KEPT (empty) for back-compat;
-- nothing reads it anymore in app code, but a few legacy reports and
-- the FK from payment_records.advance_amount hold references.
-- =============================================================

-- 1. Audit + zero existing advance balances ──────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT ab.student_id, ab.amount, s.school_id, s.name
      FROM public.advance_balances ab
      JOIN public.students s ON s.id = ab.student_id
     WHERE ab.amount > 0
  LOOP
    INSERT INTO public.audit_logs
      (user_id, school_id, action, entity_type, entity_id, details)
    VALUES
      (NULL, r.school_id, 'advance_credit_zeroed', 'student', r.student_id,
       jsonb_build_object(
         'student_name', r.name,
         'previous_balance', r.amount,
         'reason', 'Advance credit feature removed in 0084 — refund manually if needed'
       ));
  END LOOP;

  UPDATE public.advance_balances SET amount = 0, updated_at = NOW();
END $$;

-- 2. Replace record_fee_payment to reject overpay ────────────────
DROP FUNCTION IF EXISTS public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN, BOOLEAN, BIGINT);

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_id      UUID,
  p_amount          BIGINT,
  p_method          TEXT    DEFAULT 'CASH',
  p_date            DATE    DEFAULT CURRENT_DATE,
  p_note            TEXT    DEFAULT NULL,
  p_apply_late_fee  BOOLEAN DEFAULT TRUE,
  p_discount_amount BIGINT  DEFAULT 0
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id          UUID;
  v_year_id            UUID;
  v_payment_id         UUID;
  v_remaining          BIGINT;
  v_receipt            TEXT;
  v_inst               RECORD;
  v_apply              BIGINT;
  v_late_total         BIGINT := 0;
  v_late_existing      BIGINT := 0;
  v_late_delta         BIGINT := 0;
  v_outstanding        BIGINT := 0;
  v_caller             UUID   := auth.uid();
  v_effective_discount BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount < 0 THEN RAISE EXCEPTION 'amount must be non-negative'; END IF;

  v_effective_discount := GREATEST(0, COALESCE(p_discount_amount, 0));

  IF p_amount = 0 AND v_effective_discount = 0 THEN
    RAISE EXCEPTION 'amount and discount cannot both be zero';
  END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year_id FROM public.academic_years
   WHERE school_id = v_school_id AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN RAISE EXCEPTION 'no active academic year for school'; END IF;

  -- Late-fee policy applied idempotently before allocation.
  IF p_apply_late_fee THEN
    SELECT COALESCE(SUM(late_fee), 0) INTO v_late_total
      FROM public.preview_student_late_fees(p_student_id, p_date);
    SELECT COALESCE(SUM(amount), 0) INTO v_late_existing
      FROM public.fee_installments
     WHERE student_id = p_student_id AND fee_type = 'OTHER' AND month = 'Late Fee';
    v_late_delta := v_late_total - v_late_existing;
    IF v_late_delta > 0 THEN
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, amount)
      VALUES
        (p_student_id, v_year_id, v_school_id, 'Late Fee',
         p_date - INTERVAL '1 day', 'OTHER', v_late_delta);
    END IF;
  END IF;

  -- Compute total outstanding AFTER any late-fee row was inserted.
  SELECT COALESCE(SUM(GREATEST(0, amount - paid_amount - write_off_amount)), 0)
    INTO v_outstanding
    FROM public.fee_installments
   WHERE student_id = p_student_id;

  -- HARD STOP on overpay. The previous behaviour silently dumped the
  -- surplus into advance_balances; that's gone in 0084.
  IF (p_amount + v_effective_discount) > v_outstanding THEN
    RAISE EXCEPTION 'Cannot exceed total due (₹%). Reduce cash or discount.', v_outstanding
      USING ERRCODE = 'check_violation';
  END IF;

  v_remaining := p_amount + v_effective_discount;
  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_student_id::text, 1, 4);

  -- Record payment row (cash + discount tracked separately).
  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, discount_amount,
     method, date, receipt_no, note)
  VALUES
    (p_student_id, v_school_id, v_year_id, p_amount, v_effective_discount,
     p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  -- Allocate (cash + discount) oldest-due-first.
  FOR v_inst IN
    SELECT id, amount, paid_amount, write_off_amount, due_date
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND (amount - paid_amount - write_off_amount) > 0
     ORDER BY due_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount);
    UPDATE public.fee_installments
       SET paid_amount = paid_amount + v_apply,
           status = public.compute_installment_status(amount, paid_amount + v_apply, write_off_amount, due_date),
           updated_at = NOW()
     WHERE id = v_inst.id;
    INSERT INTO public.payment_installment_links
      (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_apply);
    v_remaining := v_remaining - v_apply;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, v_year_id);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school_id, 'fee_payment', 'payment', v_payment_id,
          jsonb_build_object('amount', p_amount, 'discount_amount', v_effective_discount,
                             'student_id', p_student_id, 'receipt', v_receipt));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN, BIGINT)
  TO authenticated;

-- 3. Drop p_use_advance from pay_installment ─────────────────────
DROP FUNCTION IF EXISTS public.pay_installment(UUID, BIGINT, BIGINT, TEXT, DATE, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.pay_installment(
  p_installment_id UUID,
  p_amount         BIGINT,
  p_discount       BIGINT  DEFAULT 0,
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
  v_disc         BIGINT;
  v_amt          BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  v_amt  := COALESCE(p_amount, 0);
  v_disc := GREATEST(0, COALESCE(p_discount, 0));
  IF v_amt < 0 THEN RAISE EXCEPTION 'amount must be non-negative'; END IF;
  IF v_amt = 0 AND v_disc = 0 THEN RAISE EXCEPTION 'nothing to apply'; END IF;

  SELECT id, student_id, school_id, academic_year_id, amount, paid_amount,
         write_off_amount, fee_type, month, due_date
    INTO v_inst FROM public.fee_installments
   WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'installment not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_inst.school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_outstanding := v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount;
  IF v_outstanding <= 0 THEN RAISE EXCEPTION 'installment already cleared'; END IF;
  IF (v_amt + v_disc) > v_outstanding THEN
    RAISE EXCEPTION 'overpay blocked (outstanding=%, attempted=%)', v_outstanding, v_amt + v_disc;
  END IF;

  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(v_inst.student_id::text, 1, 4);

  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, discount_amount, method, date, receipt_no, note)
  VALUES
    (v_inst.student_id, v_inst.school_id, v_inst.academic_year_id,
     v_amt, v_disc, p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  IF v_amt > 0 THEN
    INSERT INTO public.payment_installment_links (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_amt);
  END IF;

  IF v_disc > 0 THEN
    INSERT INTO public.fee_write_offs (installment_id, student_id, school_id, amount, reason, approved_by)
    VALUES (v_inst.id, v_inst.student_id, v_inst.school_id, v_disc, COALESCE(p_note, 'Discount'), v_caller);
  END IF;

  UPDATE public.fee_installments
     SET paid_amount = paid_amount + v_amt,
         write_off_amount = write_off_amount + v_disc,
         write_off_reason = CASE WHEN v_disc > 0 THEN COALESCE(p_note, write_off_reason, 'Discount') ELSE write_off_reason END,
         status = public.compute_installment_status(amount, paid_amount + v_amt, write_off_amount + v_disc, due_date),
         updated_at = NOW()
   WHERE id = v_inst.id;

  PERFORM public.refresh_student_fee_aggregate(v_inst.student_id, v_inst.academic_year_id);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_inst.school_id, 'fee_payment_per_installment', 'payment', v_payment_id,
    jsonb_build_object('installment_id', v_inst.id, 'student_id', v_inst.student_id,
                       'month', v_inst.month, 'fee_type', v_inst.fee_type,
                       'amount', v_amt, 'discount', v_disc, 'method', p_method, 'receipt', v_receipt));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pay_installment(UUID, BIGINT, BIGINT, TEXT, DATE, TEXT) TO authenticated;
