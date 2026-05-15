-- =============================================================
-- 0140_reverse_payment_daily_cap_lock.sql
-- =============================================================
-- The "max 3 reversals per principal per day" cap lived in the
-- Express route (server/routes/fees.ts) as a count-then-act:
--   1. SELECT COUNT(*) FROM audit_logs WHERE user=… AND today
--   2. compare against 3
--   3. call reverse_payment RPC
-- Two parallel reverse requests from the same principal both saw the
-- same count, both passed, both succeeded → 4 reversals on a day where
-- 3 was the explicit cap.
--
-- Fix: move the cap into reverse_payment itself, serialised through a
-- pg_advisory_xact_lock keyed on (user_id, IST date). Two concurrent
-- calls now queue on the lock; the second sees the now-incremented
-- count and raises before any write.
--
-- Rebased on the 0136 body (which fixed the write-off PARTIAL branch).
-- =============================================================

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
  v_today_ist    date;
  v_today_count  int;
BEGIN
  SELECT id, school_id, student_id, academic_year_id, amount, method, date,
         receipt_no, advance_amount, note, reversed_at, reverses_payment_id,
         created_at
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
  IF v_orig.created_at < (now() - INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'reversal_window_expired'
      USING ERRCODE = 'check_violation',
            HINT = '24 ghante ke baad reverse nahi kar sakte. Naya correction payment / write-off use karein.';
  END IF;

  -- ── Daily cap (3 per principal per IST day) ─────────────────────────
  -- Advisory lock keyed on (user, IST date) serialises concurrent
  -- reverse calls from the same principal so the COUNT below is
  -- non-racy. Lock auto-releases at transaction end.
  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || '|' || v_today_ist::text, 42)
  );
  SELECT COUNT(*) INTO v_today_count
    FROM public.audit_logs
   WHERE user_id = p_user_id
     AND action  = 'fee_payment_reversed'
     AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;
  IF v_today_count >= 3 THEN
    RAISE EXCEPTION 'daily_cap_exceeded'
      USING ERRCODE = 'check_violation',
            HINT = 'Daily limit reached: max 3 reversals per principal per day';
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
      v_new_paid  := greatest(0, v_inst.paid_amount - v_link.amount_applied);
      v_total     := v_inst.amount;
      v_writeoff  := coalesce(v_inst.write_off_amount, 0);
      v_remaining := v_total - v_writeoff - v_new_paid;

      IF v_remaining <= 0 THEN
        IF v_writeoff > 0 THEN
          v_new_status := 'WAIVED';
        ELSE
          v_new_status := 'PAID';
        END IF;
      ELSIF v_new_paid > 0 OR v_writeoff > 0 THEN
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
