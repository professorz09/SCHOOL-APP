-- ============================================================================
-- 0020 — Late-fee preview + apply on payment.
--
-- Problem: until now late fees were a configurable JSONB on
-- public.fee_structures (`{enabled, gracePeriodDays, type, amount, maxCap}`)
-- but nothing on the server actually applied them. Principals collecting fees
-- after the due date were silently waiving the late-fee policy.
--
-- This migration is purely additive:
--
--   1. preview_student_late_fees(p_student_id) — read-only RPC that returns
--      the per-overdue-installment late-fee amount the student currently
--      owes, joining each installment to its class' fee_structures.late_fee
--      config in the active year.
--   2. record_fee_payment is RE-CREATED with one extra optional argument
--      `p_apply_late_fee BOOLEAN DEFAULT TRUE`. When TRUE and the student
--      has any computable late fee, a single aggregated installment row is
--      INSERTed with fee_type='OTHER', month='Late Fee' and is dated today
--      so that oldest-due-first allocation immediately consumes it. The
--      original RPC's behaviour (oldest-due-first allocation, advance
--      balance, audit) is preserved verbatim. Existing call sites continue
--      to work because the new arg has a default.
--
-- Idempotent: CREATE OR REPLACE on both functions; the previous
-- record_fee_payment overload is dropped first because the parameter list
-- changes (adding a new BOOLEAN at the tail).
-- ============================================================================

-- ─── 1. preview_student_late_fees ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.preview_student_late_fees(UUID);

CREATE OR REPLACE FUNCTION public.preview_student_late_fees(p_student_id UUID)
RETURNS TABLE (
  installment_id UUID,
  due_date DATE,
  days_late INT,
  late_fee BIGINT,
  source TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_year_id UUID;
  v_class_name TEXT;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  -- Authz: super-admin, same-school principal/teacher, OR the student/parent
  -- linked to this student (so previews show in the parent FeesView too).
  IF NOT (public.is_super_admin()
          OR ((public.current_user_role() IN ('PRINCIPAL','TEACHER'))
              AND public.current_user_school_id() = v_school_id)
          OR p_student_id = ANY(public.linked_student_ids())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Resolve the active year + the student's class within that year.
  SELECT id INTO v_year_id FROM public.academic_years
    WHERE school_id = v_school_id AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN RETURN; END IF;

  SELECT class_name INTO v_class_name FROM public.student_academic_records
    WHERE student_id = p_student_id AND academic_year_id = v_year_id
    LIMIT 1;
  IF v_class_name IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH cfg AS (
    -- Pick the most recently-updated fee_structures row for the class.
    -- Multiple structures per class are allowed (e.g. concession variants);
    -- the late-fee policy is a school-level convention so we just pick one.
    SELECT late_fee
      FROM public.fee_structures
     WHERE school_id = v_school_id
       AND academic_year_id = v_year_id
       AND class_name = v_class_name
     ORDER BY updated_at DESC
     LIMIT 1
  ),
  overdue AS (
    SELECT i.id, i.due_date, i.amount, i.paid_amount, i.write_off_amount
      FROM public.fee_installments i
     WHERE i.student_id = p_student_id
       AND i.academic_year_id = v_year_id
       AND i.payer_type = 'PARENT'
       AND (i.amount - i.paid_amount - i.write_off_amount) > 0
       -- Skip late-fee rows themselves (avoid recursive late fees).
       AND NOT (i.fee_type = 'OTHER' AND i.month = 'Late Fee')
  )
  SELECT
    o.id AS installment_id,
    o.due_date,
    GREATEST(0, (CURRENT_DATE - o.due_date) - COALESCE((cfg.late_fee->>'gracePeriodDays')::INT, 0))::INT AS days_late,
    CASE
      WHEN cfg.late_fee IS NULL THEN 0::BIGINT
      WHEN COALESCE((cfg.late_fee->>'enabled')::BOOLEAN, FALSE) = FALSE THEN 0::BIGINT
      WHEN (CURRENT_DATE - o.due_date) <= COALESCE((cfg.late_fee->>'gracePeriodDays')::INT, 0) THEN 0::BIGINT
      ELSE
        LEAST(
          COALESCE((cfg.late_fee->>'maxCap')::BIGINT, 9999999999::BIGINT),
          -- Accept both legacy lowercase ('percent'/'flat') and the canonical
          -- uppercase values written by the principal Fee Structures editor
          -- ('PERCENTAGE'/'FIXED'). Anything other than a percent variant
          -- falls through to the fixed-amount branch.
          CASE
            WHEN UPPER(COALESCE(cfg.late_fee->>'type', 'FIXED')) IN ('PERCENTAGE', 'PERCENT') THEN
              FLOOR((o.amount - o.paid_amount - o.write_off_amount)
                    * COALESCE((cfg.late_fee->>'amount')::NUMERIC, 0) / 100.0)::BIGINT
            ELSE
              COALESCE((cfg.late_fee->>'amount')::BIGINT, 0)
          END
        )
    END AS late_fee,
    -- Canonicalise to exactly 'PERCENTAGE' or 'FIXED' so callers don't have
    -- to worry about legacy lowercase / 'PERCENT' variants when labelling.
    CASE
      WHEN UPPER(COALESCE(cfg.late_fee->>'type', 'FIXED')) IN ('PERCENTAGE', 'PERCENT') THEN 'PERCENTAGE'
      ELSE 'FIXED'
    END AS source
  FROM overdue o
  LEFT JOIN cfg ON TRUE;
END $$;

GRANT EXECUTE ON FUNCTION public.preview_student_late_fees(UUID) TO authenticated;


-- ─── 2. record_fee_payment — apply computed late fee before allocation ─────
--
-- Drop the prior 6-arg signature first. Existing services using the old
-- signature still work because the new 7th arg has a default.
DROP FUNCTION IF EXISTS public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_id    UUID,
  p_amount        BIGINT,
  p_method        TEXT    DEFAULT 'CASH',
  p_date          DATE    DEFAULT CURRENT_DATE,
  p_note          TEXT    DEFAULT NULL,
  p_use_advance   BOOLEAN DEFAULT FALSE,
  p_apply_late_fee BOOLEAN DEFAULT TRUE
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id    UUID;
  v_year_id      UUID;
  v_payment_id   UUID;
  v_remaining    BIGINT;
  v_receipt      TEXT;
  v_inst         RECORD;
  v_apply        BIGINT;
  v_advance      BIGINT := 0;
  v_late_total   BIGINT := 0;
  v_late_existing BIGINT := 0;
  v_late_delta   BIGINT := 0;
  v_caller       UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year_id FROM public.academic_years
   WHERE school_id = v_school_id AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN RAISE EXCEPTION 'no active academic year for school'; END IF;

  -- Apply late-fee policy idempotently. preview_student_late_fees() returns
  -- the TOTAL liability the student should currently owe in late fees. We
  -- compare against the SUM(amount) of every 'Late Fee' row already accrued
  -- for this (student, year) — INCLUDING paid/written-off rows — and only
  -- insert the positive DELTA. Using the full principal as the baseline
  -- (rather than the unpaid remainder) is critical: otherwise a partial
  -- payment or write-off of an existing late-fee row would shrink the
  -- baseline and the very next call would re-insert the just-paid/waived
  -- amount as fresh accrual, creating a never-ending top-up loop.
  --
  -- Allocation ordering note: the new row is dated CURRENT_DATE - 1 so it
  -- sorts AHEAD of any installments due today/in the future, but any older
  -- still-overdue base installments (earlier due_date) will still allocate
  -- first under the oldest-due-first walk below. This is intentional —
  -- principals collect for the oldest dues first, then the late fee is
  -- cleared. If a strict "late fee first" policy is ever required, change
  -- the ORDER BY in the allocation loop to prioritise month='Late Fee'.
  IF p_apply_late_fee THEN
    SELECT COALESCE(SUM(late_fee), 0) INTO v_late_total
      FROM public.preview_student_late_fees(p_student_id);

    SELECT COALESCE(SUM(amount), 0)
      INTO v_late_existing
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND academic_year_id = v_year_id
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
         CURRENT_DATE - INTERVAL '1 day',
         'OTHER', v_late_delta, 'PARENT');
    END IF;
  END IF;

  v_remaining := p_amount;

  IF p_use_advance THEN
    SELECT amount INTO v_advance FROM public.advance_balances WHERE student_id = p_student_id;
    IF COALESCE(v_advance, 0) > 0 THEN
      v_remaining := v_remaining + v_advance;
      UPDATE public.advance_balances SET amount = 0, updated_at = NOW()
        WHERE student_id = p_student_id;
    END IF;
  END IF;

  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_student_id::text, 1, 4);

  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, method, date, receipt_no, note)
  VALUES
    (p_student_id, v_school_id, v_year_id, p_amount, p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

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

  IF v_remaining > 0 THEN
    INSERT INTO public.advance_balances (student_id, amount)
    VALUES (p_student_id, v_remaining)
    ON CONFLICT (student_id) DO UPDATE
      SET amount = public.advance_balances.amount + EXCLUDED.amount,
          updated_at = NOW();
    UPDATE public.payment_records SET advance_amount = v_remaining WHERE id = v_payment_id;
  END IF;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, v_year_id);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school_id, 'fee_payment', 'payment', v_payment_id,
          jsonb_build_object(
            'amount', p_amount,
            'student_id', p_student_id,
            'receipt', v_receipt,
            'used_advance', p_use_advance,
            'late_fee_total',           v_late_total,    -- liability computed at this call
            'late_fee_existing_basis',  v_late_existing, -- principal already accrued
            'late_fee_delta_inserted',  GREATEST(v_late_delta, 0) -- amount actually inserted
          ));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
