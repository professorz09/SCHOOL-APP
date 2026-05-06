-- Migration 0042: Payment discount support
--
-- Adds a `discount_amount` column to payment_records so revenue (actual cash
-- received) is stored separately from the total amount cleared on installments.
--
-- Updates record_fee_payment to accept an optional p_discount_amount.  The RPC
-- records p_amount (actual cash) in payment_records but allocates
-- p_amount + p_discount_amount to installments oldest-due-first.  This means:
--
--   revenue = SUM(payment_records.amount)          ← actual cash received
--   cleared = SUM(payment_installment_links.amount_applied)  ← incl. discount
--
-- Example: fee=1000, paid=600, discount=400 → payment_records.amount=600,
-- installments cleared=1000.

-- ─── 1. Add discount_amount column ───────────────────────────────────────────
ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS discount_amount BIGINT NOT NULL DEFAULT 0;

-- ─── 2. Replace record_fee_payment with 8-arg version ─────────────────────
DROP FUNCTION IF EXISTS public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_id      UUID,
  p_amount          BIGINT,
  p_method          TEXT    DEFAULT 'CASH',
  p_date            DATE    DEFAULT CURRENT_DATE,
  p_note            TEXT    DEFAULT NULL,
  p_use_advance     BOOLEAN DEFAULT FALSE,
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
  v_advance            BIGINT := 0;
  v_late_total         BIGINT := 0;
  v_late_existing      BIGINT := 0;
  v_late_delta         BIGINT := 0;
  v_caller             UUID   := auth.uid();
  v_effective_discount BIGINT;
  v_cash_remaining     BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  v_effective_discount := GREATEST(0, COALESCE(p_discount_amount, 0));

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year_id FROM public.academic_years
   WHERE school_id = v_school_id AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN RAISE EXCEPTION 'no active academic year for school'; END IF;

  -- Apply late-fee policy idempotently (same logic as before).
  IF p_apply_late_fee THEN
    SELECT COALESCE(SUM(late_fee), 0) INTO v_late_total
      FROM public.preview_student_late_fees(p_student_id, p_date);

    SELECT COALESCE(SUM(amount), 0)
      INTO v_late_existing
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND payer_type = 'PARENT'
       AND fee_type = 'OTHER'
       AND month = 'Late Fee';

    v_late_delta := v_late_total - v_late_existing;
    IF v_late_delta > 0 THEN
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date,
         fee_type, amount, payer_type)
      VALUES
        (p_student_id, v_year_id, v_school_id, 'Late Fee',
         p_date - INTERVAL '1 day',
         'OTHER', v_late_delta, 'PARENT');
    END IF;
  END IF;

  -- Effective remaining = actual cash + discount (both clear outstanding dues).
  v_remaining := p_amount + v_effective_discount;

  IF p_use_advance THEN
    SELECT amount INTO v_advance FROM public.advance_balances WHERE student_id = p_student_id;
    IF COALESCE(v_advance, 0) > 0 THEN
      v_remaining := v_remaining + v_advance;
      UPDATE public.advance_balances SET amount = 0, updated_at = NOW()
        WHERE student_id = p_student_id;
    END IF;
  END IF;

  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_student_id::text, 1, 4);

  -- Record actual cash received (NOT including discount) for revenue tracking.
  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, discount_amount, method, date, receipt_no, note)
  VALUES
    (p_student_id, v_school_id, v_year_id, p_amount, v_effective_discount, p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  -- Allocate (cash + discount) oldest-due-first across parent installments.
  FOR v_inst IN
    SELECT id, amount, paid_amount, write_off_amount, due_date
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND payer_type = 'PARENT'
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

  -- Only unused CASH becomes advance credit — unused discount does not.
  -- After allocation: v_remaining = leftover from (cash + discount).
  -- Cash leftover = max(0, v_remaining - discount_portion_not_used).
  -- Since discount is always applied first conceptually (it reduces dues),
  -- any leftover ≤ discount means no cash leftover; any leftover > discount
  -- means (leftover - discount) of actual cash was unused.
  v_cash_remaining := GREATEST(0, v_remaining - v_effective_discount);

  IF v_cash_remaining > 0 THEN
    INSERT INTO public.advance_balances (student_id, amount)
    VALUES (p_student_id, v_cash_remaining)
    ON CONFLICT (student_id) DO UPDATE
      SET amount = public.advance_balances.amount + EXCLUDED.amount,
          updated_at = NOW();
    UPDATE public.payment_records SET advance_amount = v_cash_remaining WHERE id = v_payment_id;
  END IF;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, v_year_id);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school_id, 'fee_payment', 'payment', v_payment_id,
          jsonb_build_object(
            'amount',                  p_amount,
            'discount_amount',         v_effective_discount,
            'student_id',              p_student_id,
            'receipt',                 v_receipt,
            'used_advance',            p_use_advance,
            'late_fee_total',          v_late_total,
            'late_fee_existing_basis', v_late_existing,
            'late_fee_delta_inserted', GREATEST(v_late_delta, 0)
          ));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN, BOOLEAN, BIGINT) TO authenticated;
